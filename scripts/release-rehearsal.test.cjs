const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const child_process = require('node:child_process');

// Require the rehearsal core module under test and the thin CLI wrapper
const rehearsal = require('./release-rehearsal-core.cjs');
const cli = require('./release-rehearsal.cjs');

test('CLI: thin wrapper re-exports core functions and main entry point', () => {
    assert.equal(typeof cli.runRehearsal, 'function');
    assert.equal(typeof cli.parseArgs, 'function');
    assert.equal(typeof cli.main, 'function');
    assert.equal(cli.runRehearsal, rehearsal.runRehearsal);
});

test('CLI: thin wrapper executes --help cleanly via process execution', () => {
    const cliPath = path.resolve('scripts/release-rehearsal.cjs');
    const output = child_process.execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
    assert.ok(output.includes('SiVoy Local Release & Rollback Rehearsal (T36a)'));
    assert.ok(output.includes('--candidate'));
    assert.ok(output.includes('--command-timeout'));
});

test('parseArgs: parses default and custom arguments with separated timeouts', () => {
    const defaults = rehearsal.parseArgs([]);
    assert.equal(defaults.candidateRef, 'HEAD');
    assert.equal(defaults.previousRef, 'HEAD~1');
    assert.equal(defaults.dryRun, false);
    assert.equal(defaults.timeoutMs, 15000);
    assert.equal(defaults.commandTimeoutMs, 300000);

    const custom = rehearsal.parseArgs([
        '--candidate', 'feat/new-release',
        '--previous', 'v1.0.0',
        '--dry-run',
        '--timeout', '8000',
        '--command-timeout', '180000',
        '--keep-temp',
        '--skip-install',
        '--skip-build',
        '--port', '8080',
        '--verbose'
    ]);
    assert.equal(custom.candidateRef, 'feat/new-release');
    assert.equal(custom.previousRef, 'v1.0.0');
    assert.equal(custom.dryRun, true);
    assert.equal(custom.timeoutMs, 8000);
    assert.equal(custom.commandTimeoutMs, 180000);
    assert.equal(custom.keepTemp, true);
    assert.equal(custom.skipInstall, true);
    assert.equal(custom.skipBuild, true);
    assert.equal(custom.port, 8080);
    assert.equal(custom.verbose, true);
});

test('parseArgs: rejects invalid, malformed or out-of-bounds arguments', () => {
    assert.throws(() => rehearsal.parseArgs(['--timeout', 'not-a-number']), /Invalid timeout/);
    assert.throws(() => rehearsal.parseArgs(['--timeout', '100']), /Invalid timeout/); // Below 500ms
    assert.throws(() => rehearsal.parseArgs(['--timeout', '500000']), /Invalid timeout/); // Above 300000ms

    assert.throws(() => rehearsal.parseArgs(['--command-timeout', 'not-a-number']), /Invalid command timeout/);
    assert.throws(() => rehearsal.parseArgs(['--command-timeout', '500']), /Invalid command timeout/); // Below 1000ms
    assert.throws(() => rehearsal.parseArgs(['--command-timeout', '2000000']), /Invalid command timeout/); // Above 1800000ms

    assert.throws(() => rehearsal.parseArgs(['--port', '99999']), /Invalid port value/);
    assert.throws(() => rehearsal.parseArgs(['--candidate']), /Missing value for argument/);
    assert.throws(() => rehearsal.parseArgs(['--previous']), /Missing value for argument/);
    assert.throws(() => rehearsal.parseArgs(['--command-timeout']), /Missing value for argument/);
    assert.throws(() => rehearsal.parseArgs(['--unknown-flag']), /Unknown argument/);
});

test('validateRef: allows valid git refs and rejects dangerous or invalid patterns', () => {
    const validRefs = ['HEAD', 'HEAD~1', 'main', 'develop', 'release/v1.2.3', 'v1.0.0', '164661e', 'origin/main'];
    for (const ref of validRefs) {
        assert.doesNotThrow(() => rehearsal.validateRef(ref), `Expected ref "${ref}" to be valid`);
    }

    const invalidRefs = [
        '',
        ' ',
        '-foo', // Starts with dash (command injection defense)
        '--candidate',
        'HEAD; rm -rf /',
        'HEAD && ls',
        'ref`whoami`',
        'ref$(whoami)',
        'ref|cat',
        'ref>file',
        'ref<file',
        'ref\nnewline',
        'ref"quote'
    ];
    for (const ref of invalidRefs) {
        assert.throws(() => rehearsal.validateRef(ref), /Invalid git reference/, `Expected ref "${ref}" to be rejected`);
    }
});

test('buildSafeChildEnv: creates sanitized environment without leaking parent secrets and configures npm isolation', () => {
    const parentEnv = {
        PATH: 'C:\\Windows\\system32;/usr/bin',
        SYSTEMROOT: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\MockUser',
        SECRET_SENTINEL: 'super_secret_token_12345',
        DATABASE_PASSWORD: 'raw_db_password_here',
        AWS_SECRET_ACCESS_KEY: 'sensitive_aws_key'
    };

    const childEnv = rehearsal.buildSafeChildEnv({
        PORT: '45678',
        NPM_CONFIG_USERCONFIG: '/tmp/run-123/.npmrc',
        NPM_CONFIG_CACHE: '/tmp/run-123/npm-cache'
    }, parentEnv);

    // Whitelisted variables preserved
    assert.equal(childEnv.PATH, parentEnv.PATH);
    assert.equal(childEnv.SYSTEMROOT, parentEnv.SYSTEMROOT);
    assert.equal(childEnv.USERPROFILE, parentEnv.USERPROFILE);

    // Safe mocks assigned
    assert.equal(childEnv.PORT, '45678');
    assert.equal(childEnv.NODE_ENV, 'test');
    assert.equal(childEnv.NPM_CONFIG_USERCONFIG, '/tmp/run-123/.npmrc');
    assert.equal(childEnv.NPM_CONFIG_CACHE, '/tmp/run-123/npm-cache');
    assert.ok(childEnv.DATABASE_URL.includes('sivoy_rehearsal_mock'));
    assert.ok(childEnv.MAPBOX_PUBLIC_TOKEN.includes('mock_token'));

    // Critical: Secret sentinel and arbitrary credentials must NOT be inherited!
    assert.equal(childEnv.SECRET_SENTINEL, undefined, 'SECRET_SENTINEL must never leak into child environment');
    assert.equal(childEnv.DATABASE_PASSWORD, undefined, 'DATABASE_PASSWORD must never leak into child environment');
    assert.equal(childEnv.AWS_SECRET_ACCESS_KEY, undefined, 'AWS_SECRET_ACCESS_KEY must never leak into child environment');
});

test('sanitizeLog: redacts tokens, credentials, and sensitive URLs', () => {
    const sensitive = [
        'DATABASE_URL=postgres://app_user:s3cr3tP@ss!@db.internal:5432/sivoy_db',
        'Authorization: Bearer my-super-secret-token-12345',
        'METRICS_TOKEN=super_secret_metrics_token',
        'Normal message without secrets'
    ].join('\n');

    const sanitized = rehearsal.sanitizeLog(sensitive);
    assert.ok(!sanitized.includes('s3cr3tP@ss!'), 'Postgres password must be redacted');
    assert.ok(!sanitized.includes('my-super-secret-token-12345'), 'Bearer token must be redacted');
    assert.ok(!sanitized.includes('super_secret_metrics_token'), 'Metrics token must be redacted');
    assert.ok(sanitized.includes('Normal message without secrets'), 'Normal logs preserved');
    assert.ok(sanitized.includes('[REDACTED]'), 'Redaction placeholder present');
});

test('isSafeTempDirectory: strictly enforces temp directory boundary', () => {
    const baseTemp = path.resolve(os.tmpdir(), 'sivoy-test-boundary');
    const safeSub = path.join(baseTemp, 'sub-workspace-1');
    const safeNested = path.join(baseTemp, 'sub', 'nested');

    assert.equal(rehearsal.isSafeTempDirectory(safeSub, baseTemp), true);
    assert.equal(rehearsal.isSafeTempDirectory(safeNested, baseTemp), true);

    // Unsafe paths
    assert.equal(rehearsal.isSafeTempDirectory(baseTemp, baseTemp), false, 'Base temp itself should not be purged indiscriminately');
    assert.equal(rehearsal.isSafeTempDirectory(path.resolve('.'), baseTemp), false, 'Repo root must not be safe temp');
    assert.equal(rehearsal.isSafeTempDirectory(os.homedir(), baseTemp), false, 'Home dir must not be safe temp');
    assert.equal(rehearsal.isSafeTempDirectory(path.join(baseTemp, '..', 'escaped'), baseTemp), false, 'Path traversal must be rejected');
});

test('safeRemoveTempDir: refuses to remove unsafe directories', () => {
    const baseTemp = path.resolve(os.tmpdir(), 'sivoy-test-boundary-remove');
    assert.throws(() => {
        rehearsal.safeRemoveTempDir(path.resolve('.'), baseTemp);
    }, /Refusing to remove directory outside temp boundary/);
});

test('probeHttp: succeeds when endpoint returns expected status and body', async () => {
    const mockFetch = async () => ({
        status: 200,
        body: JSON.stringify({ status: 'ok' })
    });

    const res = await rehearsal.probeHttp({
        port: 4000,
        path: '/api/health',
        expectedStatus: 200,
        matchBody: /"status"\s*:\s*"ok"/,
        timeoutMs: 1000,
        intervalMs: 50,
        fetchFn: mockFetch
    });

    assert.equal(res.success, true);
    assert.equal(res.status, 200);
});

test('probeHttp: fails when endpoint returns wrong status or times out', async () => {
    const mockFetch = async () => ({
        status: 503,
        body: 'Unavailable'
    });

    await assert.rejects(async () => {
        await rehearsal.probeHttp({
            port: 4001,
            path: '/api/health',
            expectedStatus: 200,
            timeoutMs: 200,
            intervalMs: 50,
            fetchFn: mockFetch
        });
    }, /Probe failed/);
});

test('runRehearsal: dry-run verifies path boundaries without disk residue and reports rollbackProcedureVerified: false', async () => {
    const logs = [];
    const report = await rehearsal.runRehearsal({
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: true,
        logger: (msg) => logs.push(msg)
    });

    assert.equal(report.status, 'success');
    assert.equal(report.mode, 'structural-dry-run');
    assert.ok(report.candidate.commit);
    assert.ok(report.previous.commit);

    const dryRunStage = report.stages.find(s => s.name === 'structural-dry-run-verification');
    assert.ok(dryRunStage, 'Must have structural-dry-run-verification stage');
    assert.equal(dryRunStage.details.candidateRefValid, true);
    assert.equal(dryRunStage.details.previousRefValid, true);
    assert.equal(dryRunStage.details.safeConfigValid, true);
    assert.equal(dryRunStage.details.pathBoundaryVerified, true, 'Path boundary must be verified');
    assert.equal(dryRunStage.details.rollbackProcedureVerified, false, 'Rollback must be reported false in dry-run');

    assert.ok(report.limitations.length > 0, 'Must document limitations honestly');
    assert.ok(report.limitations.some(l => l.includes('rollbackProcedureVerified: false')));
});

test('runRehearsal: full lifecycle eliminates TOCTOU by extracting exact resolved commits, isolates npm, and runs explicit production build', async () => {
    const extractedTargets = [];
    const executedCommands = [];
    const spawnedProcesses = [];
    const stoppedProcesses = [];
    const probedUrls = [];
    const cleanedDirs = [];

    const candidateSha = 'c0ffee1234567890abcdef1234567890abcdef12';
    const previousSha = 'deadbeef1234567890abcdef1234567890abcdef12';

    // Mock commit resolver returning exact SHAs
    const mockResolveCommit = async (ref) => {
        if (ref === 'HEAD') return candidateSha;
        if (ref === 'HEAD~1') return previousSha;
        return `resolved-${ref}`;
    };

    // Mock extraction: MUST receive the resolved SHA, not the ref string! (Eliminates TOCTOU)
    const mockExtractRevision = async (commitSha, targetDir) => {
        extractedTargets.push({ commitSha, targetDir });
        return { commit: commitSha, directory: targetDir };
    };

    // Track command execution (npm ci, build)
    const mockRunCommand = async (cmd, args, opts) => {
        executedCommands.push({ cmd, args, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs });
        return { status: 0, stdout: '', stderr: '' };
    };

    // Track process spawning
    let nextPid = 1000;
    const mockSpawn = (cmd, args, opts) => {
        const pid = nextPid++;
        const listeners = {};
        const proc = {
            pid,
            cmd,
            args,
            opts,
            killed: false,
            exitCode: null,
            stdout: { on: () => {}, resume: () => {} },
            stderr: { on: () => {}, resume: () => {} },
            on: (event, cb) => {
                listeners[event] = listeners[event] || [];
                listeners[event].push(cb);
            },
            once: (event, cb) => {
                listeners[event] = listeners[event] || [];
                listeners[event].push(cb);
            },
            kill: (sig) => {
                proc.killed = true;
                proc.exitCode = 0;
                stoppedProcesses.push({ pid, sig });
                if (listeners['exit']) {
                    const cbs = listeners['exit'];
                    delete listeners['exit'];
                    for (const cb of cbs) cb(0);
                }
                return true;
            }
        };
        spawnedProcesses.push({ proc, cwd: opts.cwd, env: opts.env });
        return proc;
    };

    // Mock HTTP fetch for health, runtime-config, and static index
    const mockFetch = async (url) => {
        probedUrls.push(url);
        if (url.endsWith('/api/health')) {
            return { status: 200, body: JSON.stringify({ status: 'ok' }) };
        }
        if (url.endsWith('/runtime-config.js')) {
            return { status: 200, body: 'window.__SIVOY_CONFIG__={};' };
        }
        if (url.endsWith('/index.html') || url.endsWith('/')) {
            return { status: 200, body: '<!doctype html><html><head><title>SiVoy</title></head></html>' };
        }
        return { status: 404, body: 'Not found' };
    };

    const mockMkdtempSync = (prefix) => {
        return path.resolve(os.tmpdir(), 'sivoy-release-rehearsals', `run-test-${Date.now()}`);
    };

    const report = await rehearsal.runRehearsal({
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: false,
        timeoutMs: 5000,
        commandTimeoutMs: 250000,
        injected: {
            resolveCommit: mockResolveCommit,
            extractRevision: mockExtractRevision,
            runCommand: mockRunCommand,
            spawnProcess: mockSpawn,
            fetchUrl: mockFetch,
            mkdtempSync: mockMkdtempSync,
            skipFsSetup: true,
            removeTempDir: async (dir) => cleanedDirs.push(dir),
            getEphemeralPort: async () => 43210
        }
    });

    assert.equal(report.status, 'success');
    assert.equal(report.mode, 'full-rehearsal');

    // 1. TOCTOU verification: extract was called with EXACT resolved SHAs, not mutable 'HEAD' or 'HEAD~1'
    assert.equal(extractedTargets.length, 2);
    assert.equal(extractedTargets[0].commitSha, candidateSha, 'Candidate extraction must use resolved commit SHA');
    assert.equal(extractedTargets[1].commitSha, previousSha, 'Rollback extraction must use resolved commit SHA');

    // 2. Build & Install verification:
    // Frontend build must explicitly have ['run', 'build', '--', '--configuration', 'production']
    // Timeouts for commands must be commandTimeoutMs (250000), NOT probe timeout (5000)
    assert.equal(executedCommands.length, 6);

    // Candidate commands
    assert.deepEqual(executedCommands[0].args, ['ci']);
    assert.equal(executedCommands[0].timeoutMs, 250000);
    assert.deepEqual(executedCommands[1].args, ['ci']);
    assert.equal(executedCommands[1].timeoutMs, 250000);
    assert.deepEqual(executedCommands[2].args, ['run', 'build', '--', '--configuration', 'production']);
    assert.equal(executedCommands[2].timeoutMs, 250000);

    // Rollback commands
    assert.deepEqual(executedCommands[3].args, ['ci']);
    assert.equal(executedCommands[3].timeoutMs, 250000);
    assert.deepEqual(executedCommands[4].args, ['ci']);
    assert.equal(executedCommands[4].timeoutMs, 250000);
    assert.deepEqual(executedCommands[5].args, ['run', 'build', '--', '--configuration', 'production']);
    assert.equal(executedCommands[5].timeoutMs, 250000);

    // Check npm configuration isolation on commands and child processes
    for (const cmd of executedCommands) {
        assert.ok(cmd.env.NPM_CONFIG_USERCONFIG, 'Must set NPM_CONFIG_USERCONFIG');
        assert.ok(cmd.env.NPM_CONFIG_CACHE, 'Must set NPM_CONFIG_CACHE');
    }

    // 3. Probes on BOTH candidate and rollback
    const healthCalls = probedUrls.filter(u => u.endsWith('/api/health'));
    const configCalls = probedUrls.filter(u => u.endsWith('/runtime-config.js'));
    const staticCalls = probedUrls.filter(u => u.endsWith('/index.html'));

    assert.ok(healthCalls.length >= 2, 'Must probe health for both');
    assert.ok(configCalls.length >= 2, 'Must probe runtime-config for both');
    assert.ok(staticCalls.length >= 2, 'Must probe static index for both');

    // 4. Execution dir cleanup: cleans the single parent execution directory
    assert.equal(cleanedDirs.length, 1, 'Must clean the single execution directory holding candidate, rollback, and npm cache');
});

test('runRehearsal: handles spawn error event immediately and cleans up', async () => {
    const cleanedDirs = [];

    const mockSpawn = () => {
        const listeners = {};
        const proc = {
            pid: null,
            killed: false,
            exitCode: null,
            stdout: { on: () => {}, resume: () => {} },
            stderr: { on: () => {}, resume: () => {} },
            on: () => {},
            once: (ev, cb) => {
                if (ev === 'error') {
                    setImmediate(() => cb(new Error('spawn node ENOENT')));
                }
            },
            kill: () => true
        };
        return proc;
    };

    const report = await rehearsal.runRehearsal({
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: false,
        timeoutMs: 2000,
        injected: {
            extractRevision: async (ref, dir) => ({ commit: ref, directory: dir }),
            runCommand: async () => ({ status: 0 }),
            spawnProcess: mockSpawn,
            mkdtempSync: (prefix) => path.resolve(os.tmpdir(), 'sivoy-release-rehearsals', `run-err-${Date.now()}`),
            skipFsSetup: true,
            fetchUrl: async () => ({ status: 500, body: 'stalled' }),
            removeTempDir: async (dir) => cleanedDirs.push(dir),
            getEphemeralPort: async () => 43215,
            resolveCommit: async (ref) => `sha-${ref}`
        }
    });

    assert.equal(report.status, 'failed');
    assert.ok(report.error.includes('failed to spawn: spawn node ENOENT'), 'Must report spawn error event');
    assert.ok(cleanedDirs.length > 0, 'Must clean up temp dir on spawn error');
});

test('runRehearsal: respects --skip-install and --skip-build flags', async () => {
    const executedCommands = [];
    const stoppedProcesses = [];

    const mockSpawn = () => {
        let exitCb = null;
        const proc = {
            pid: 1234,
            killed: false,
            exitCode: null,
            stdout: { on: () => {}, resume: () => {} },
            stderr: { on: () => {}, resume: () => {} },
            on: (event, cb) => {},
            once: (event, cb) => {
                if (event === 'exit') exitCb = cb;
            },
            kill: (sig) => {
                proc.killed = true;
                proc.exitCode = 0;
                stoppedProcesses.push(sig);
                if (exitCb) exitCb(0);
                return true;
            }
        };
        return proc;
    };

    const report = await rehearsal.runRehearsal({
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: false,
        skipInstall: true,
        skipBuild: true,
        timeoutMs: 2000,
        injected: {
            extractRevision: async (ref, dir) => ({ commit: ref, directory: dir }),
            runCommand: async (cmd, args) => executedCommands.push({ cmd, args }),
            spawnProcess: mockSpawn,
            mkdtempSync: (prefix) => path.resolve(os.tmpdir(), 'sivoy-release-rehearsals', `run-skip-${Date.now()}`),
            skipFsSetup: true,
            fetchUrl: async (url) => {
                if (url.endsWith('/api/health')) return { status: 200, body: '{"status":"ok"}' };
                if (url.endsWith('/runtime-config.js')) return { status: 200, body: 'window.__SIVOY_CONFIG__={};' };
                return { status: 200, body: '<html></html>' };
            },
            removeTempDir: async () => {},
            getEphemeralPort: async () => 43212,
            resolveCommit: async (ref) => `sha-${ref}`
        }
    });

    assert.equal(report.status, 'success');
    assert.equal(executedCommands.length, 0, 'No npm commands should be executed when install and build are skipped');
    assert.equal(stoppedProcesses.length, 2, 'Candidate and rollback processes must be terminated');
});

test('runRehearsal: build failure halts execution, cleans up temp workspaces, and spawns zero servers', async () => {
    const spawnedProcesses = [];
    const cleanedDirs = [];

    const mockRunCommand = async (cmd, args) => {
        if (args.includes('build')) {
            throw new Error('Angular build compilation error: syntax error in src/main.ts');
        }
        return { status: 0 };
    };

    const report = await rehearsal.runRehearsal({
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: false,
        injected: {
            extractRevision: async (ref, dir) => ({ commit: ref, directory: dir }),
            runCommand: mockRunCommand,
            spawnProcess: () => {
                spawnedProcesses.push(1);
                return { pid: 999 };
            },
            mkdtempSync: (prefix) => path.resolve(os.tmpdir(), 'sivoy-release-rehearsals', `run-bfail-${Date.now()}`),
            skipFsSetup: true,
            removeTempDir: async (dir) => cleanedDirs.push(dir),
            getEphemeralPort: async () => 43213,
            resolveCommit: async (ref) => `sha-${ref}`
        }
    });

    assert.equal(report.status, 'failed');
    assert.ok(report.error.includes('Angular build compilation error'));
    assert.equal(spawnedProcesses.length, 0, 'Zero servers should be spawned if build fails');
    assert.ok(cleanedDirs.length > 0, 'Temp workspaces must still be cleaned up on build failure');
});

test('runRehearsal: premature backend exit fails fast with clear error and cleans up', async () => {
    const stoppedProcesses = [];
    const cleanedDirs = [];

    const mockSpawn = () => {
        const proc = {
            pid: 5001,
            killed: false,
            exitCode: null,
            stdout: { on: () => {}, resume: () => {} },
            stderr: {
                on: (ev, cb) => {
                    if (ev === 'data') cb(Buffer.from('Database connection refused at 127.0.0.1:54321'));
                },
                resume: () => {}
            },
            once: (ev, cb) => {
                if (ev === 'exit') {
                    setImmediate(() => {
                        proc.exitCode = 1;
                        cb(1, 'SIGABRT');
                    });
                }
            },
            on: () => {},
            kill: (sig) => {
                stoppedProcesses.push(sig);
                return true;
            }
        };
        return proc;
    };

    const report = await rehearsal.runRehearsal({
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: false,
        timeoutMs: 3000,
        injected: {
            extractRevision: async (ref, dir) => ({ commit: ref, directory: dir }),
            runCommand: async () => ({ status: 0 }),
            spawnProcess: mockSpawn,
            mkdtempSync: (prefix) => path.resolve(os.tmpdir(), 'sivoy-release-rehearsals', `run-pexit-${Date.now()}`),
            skipFsSetup: true,
            fetchUrl: async () => ({ status: 500, body: 'server not ready' }),
            removeTempDir: async (dir) => cleanedDirs.push(dir),
            getEphemeralPort: async () => 43214,
            resolveCommit: async (ref) => `sha-${ref}`
        }
    });

    assert.equal(report.status, 'failed');
    assert.ok(report.error.includes('exited prematurely with code 1'), 'Must report premature exit code');
    assert.ok(report.error.includes('Database connection refused'), 'Must capture and sanitize stderr on premature exit');
    assert.ok(cleanedDirs.length > 0, 'Must clean up temp dirs on premature exit');
});
