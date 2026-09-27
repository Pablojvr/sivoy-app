/**
 * SiVoy Local Release & Rollback Rehearsal — Core Orchestration Engine
 *
 * Slices: T36a
 * Cero dependencias npm adicionales (requiere herramientas del sistema: Git, tar, Node.js y npm).
 * Encapsula la lógica de orquestación, validación de seguridad, redacción de secretos,
 * aislamiento en espacios temporales, ciclo de vida de procesos y sondas de verificación.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const child_process = require('node:child_process');

// Regex for git ref validation (safe chars, no shell injection, no leading dash)
const SAFE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_\.\-\/~^@]*$/;

// Whitelist of strictly necessary system environment variables for Node and npm child processes
const SYSTEM_ENV_WHITELIST = [
    'PATH', 'Path', 'path',
    'PATHEXT',
    'SYSTEMROOT', 'SystemRoot',
    'WINDIR', 'windir',
    'COMSPEC', 'ComSpec',
    'TEMP', 'TMP', 'TMPDIR',
    'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
    'APPDATA', 'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
    'SYSTEMDRIVE',
    'LANG', 'LC_ALL', 'USER', 'SHELL'
];

/**
 * Builds a sanitized, whitelisted environment for child processes (Node, npm).
 * Never inherits arbitrary parent environment variables or credentials.
 */
function buildSafeChildEnv(extraEnv = {}, sourceEnv = process.env) {
    const childEnv = {};
    for (const key of SYSTEM_ENV_WHITELIST) {
        if (Object.prototype.hasOwnProperty.call(sourceEnv, key) && sourceEnv[key] !== undefined) {
            childEnv[key] = sourceEnv[key];
        }
    }

    // Explicit non-production safe mock defaults
    childEnv.NODE_ENV = 'test';
    childEnv.DATABASE_URL = 'postgresql://sivoy_rehearsal:unprivileged@127.0.0.1:54321/sivoy_rehearsal_mock';
    childEnv.MAPBOX_PUBLIC_TOKEN = 'pk.mock_token_for_rehearsal_only';

    // Apply any explicit extra parameters (e.g. PORT, NPM_CONFIG_*)
    for (const [k, v] of Object.entries(extraEnv)) {
        if (v !== undefined && v !== null) {
            childEnv[k] = String(v);
        }
    }

    return childEnv;
}

/**
 * Sanitize log messages and configuration dumps to avoid leaking secrets.
 */
function sanitizeLog(text, extraSensitive = []) {
    if (typeof text !== 'string') {
        text = String(text || '');
    }
    let sanitized = text;
    for (const item of extraSensitive) {
        if (item && typeof item === 'string' && item.length > 2) {
            sanitized = sanitized.split(item).join('[REDACTED]');
        }
    }

    // 1. Redact database passwords in connection URLs: postgres://user:pass@host/db
    sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1[REDACTED]$3');

    // 2. Redact Authorization Bearer tokens: Bearer <token>
    sanitized = sanitized.replace(/(Bearer\s+)[^\s\r\n]+/gi, '$1[REDACTED]');

    // 3. Redact common key=value credentials
    sanitized = sanitized.replace(/((?:password|secret|token|api_key|auth_token|metrics_token)[=:\s]+['"]?)([^'"\s\r\n&]+)/gi, '$1[REDACTED]');

    return sanitized;
}

/**
 * Validates a git reference string to prevent command injection and malformed refs.
 */
function validateRef(ref) {
    if (typeof ref !== 'string' || ref.trim() === '') {
        throw new Error('Invalid git reference: ref cannot be empty');
    }
    const trimmed = ref.trim();
    if (trimmed.startsWith('-')) {
        throw new Error(`Invalid git reference "${trimmed}": cannot start with a dash`);
    }
    if (!SAFE_REF_PATTERN.test(trimmed)) {
        throw new Error(`Invalid git reference "${trimmed}": contains disallowed or dangerous characters`);
    }
    return trimmed;
}

/**
 * Parse CLI arguments
 */
function parseArgs(argv = []) {
    const options = {
        candidateRef: 'HEAD',
        previousRef: 'HEAD~1',
        dryRun: false,
        timeoutMs: 15000,
        commandTimeoutMs: 300000,
        keepTemp: false,
        skipInstall: false,
        skipBuild: false,
        port: null,
        verbose: false,
        help: false
    };

    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            i++;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
            i++;
        } else if (arg === '--keep-temp') {
            options.keepTemp = true;
            i++;
        } else if (arg === '--skip-install') {
            options.skipInstall = true;
            i++;
        } else if (arg === '--skip-build') {
            options.skipBuild = true;
            i++;
        } else if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
            i++;
        } else if (arg === '--candidate') {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
                throw new Error('Missing value for argument: --candidate');
            }
            options.candidateRef = argv[i + 1];
            i += 2;
        } else if (arg === '--previous') {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
                throw new Error('Missing value for argument: --previous');
            }
            options.previousRef = argv[i + 1];
            i += 2;
        } else if (arg === '--timeout') {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
                throw new Error('Missing value for argument: --timeout');
            }
            const val = Number(argv[i + 1]);
            if (!Number.isSafeInteger(val) || val < 500 || val > 300000) {
                throw new Error(`Invalid timeout value: "${argv[i + 1]}". Must be an integer between 500 and 300000 ms.`);
            }
            options.timeoutMs = val;
            i += 2;
        } else if (arg === '--command-timeout') {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
                throw new Error('Missing value for argument: --command-timeout');
            }
            const val = Number(argv[i + 1]);
            if (!Number.isSafeInteger(val) || val < 1000 || val > 1800000) {
                throw new Error(`Invalid command timeout value: "${argv[i + 1]}". Must be an integer between 1000 and 1800000 ms.`);
            }
            options.commandTimeoutMs = val;
            i += 2;
        } else if (arg === '--port') {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
                throw new Error('Missing value for argument: --port');
            }
            const val = Number(argv[i + 1]);
            if (!Number.isSafeInteger(val) || val < 1024 || val > 65535) {
                throw new Error(`Invalid port value: "${argv[i + 1]}". Must be an integer between 1024 and 65535.`);
            }
            options.port = val;
            i += 2;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    validateRef(options.candidateRef);
    validateRef(options.previousRef);

    return options;
}

/**
 * Checks if a candidate directory is strictly safe to be treated as a managed temp workspace.
 * Must be a direct or nested child of baseTempDir and never system root, home, or repo root.
 */
function isSafeTempDirectory(candidateDir, baseTempDir) {
    if (!candidateDir || typeof candidateDir !== 'string') return false;
    if (!baseTempDir || typeof baseTempDir !== 'string') return false;

    const resolvedCandidate = path.resolve(candidateDir);
    const resolvedBase = path.resolve(baseTempDir);

    const isWin = process.platform === 'win32';
    const normCand = isWin ? resolvedCandidate.toLowerCase() : resolvedCandidate;
    const normBase = isWin ? resolvedBase.toLowerCase() : resolvedBase;

    // Candidate cannot be base itself
    if (normCand === normBase) return false;

    // Candidate must be strictly within baseTempDir
    const expectedPrefix = normBase.endsWith(path.sep) ? normBase : normBase + path.sep;
    if (!normCand.startsWith(expectedPrefix)) return false;

    // Must not be filesystem root, home directory, or current working repo root
    const cwd = isWin ? path.resolve('.').toLowerCase() : path.resolve('.');
    const home = isWin ? path.resolve(os.homedir()).toLowerCase() : path.resolve(os.homedir());
    const root = isWin ? path.parse(resolvedCandidate).root.toLowerCase() : path.parse(resolvedCandidate).root;

    if (normCand === cwd || normCand === home || normCand === root) {
        return false;
    }

    return true;
}

/**
 * Safe removal of temporary directory. Prevents deleting anything outside the rehearsal boundary.
 */
function safeRemoveTempDir(targetDir, baseTempDir) {
    if (!fs.existsSync(targetDir)) return;
    if (!isSafeTempDirectory(targetDir, baseTempDir)) {
        throw new Error(`Refusing to remove directory outside temp boundary: ${targetDir}`);
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
}

/**
 * Find an available ephemeral TCP port on localhost.
 * Note: Subject to an inherent race condition between socket closure and child process listen.
 */
function getEphemeralPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : null;
            server.close((err) => {
                if (err) return reject(err);
                if (!port) return reject(new Error('Failed to retrieve ephemeral port'));
                resolve(port);
            });
        });
    });
}

/**
 * Process tracker to ensure no orphaned child processes remain running.
 */
function createProcessTracker() {
    const activeProcesses = new Set();

    function track(proc) {
        if (!proc) return;
        activeProcesses.add(proc);
        const onExit = () => {
            activeProcesses.delete(proc);
        };
        if (typeof proc.once === 'function') {
            proc.once('exit', onExit);
        } else if (typeof proc.on === 'function') {
            proc.on('exit', onExit);
        }
        return proc;
    }

    async function terminate(proc, timeoutMs = 2000) {
        if (!proc) return;
        activeProcesses.delete(proc);

        return new Promise((resolve) => {
            let done = false;
            let timer = null;

            const finish = () => {
                if (!done) {
                    done = true;
                    if (timer) clearTimeout(timer);
                    resolve();
                }
            };

            if (proc.killed || (proc.exitCode !== null && proc.exitCode !== undefined)) {
                return finish();
            }

            if (typeof proc.once === 'function') {
                proc.once('exit', finish);
            } else if (typeof proc.on === 'function') {
                proc.on('exit', finish);
            }

            try {
                // First try polite SIGTERM
                proc.kill('SIGTERM');
            } catch (e) {
                return finish();
            }

            timer = setTimeout(() => {
                try {
                    // Force kill if still running after grace period
                    proc.kill('SIGKILL');
                } catch (e) {
                    // ignore
                }
                finish();
            }, timeoutMs);

            if (timer.unref) timer.unref();
        });
    }

    async function terminateAll(timeoutMs = 2000) {
        const list = Array.from(activeProcesses);
        activeProcesses.clear();
        await Promise.all(list.map(p => terminate(p, timeoutMs)));
    }

    return {
        track,
        terminate,
        terminateAll,
        get activeCount() {
            return activeProcesses.size;
        }
    };
}

/**
 * Simple HTTP probe with retry and timeout, with fast-fail exit check.
 */
async function probeHttp(options = {}) {
    const {
        port,
        path: reqPath = '/api/health',
        expectedStatus = 200,
        matchBody = null,
        timeoutMs = 5000,
        intervalMs = 150,
        fetchFn = null,
        checkExitFn = null
    } = options;

    const url = `http://127.0.0.1:${port}${reqPath}`;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (typeof checkExitFn === 'function') {
            const exitError = checkExitFn();
            if (exitError) throw exitError;
        }

        try {
            let res;
            if (typeof fetchFn === 'function') {
                const fetchPromise = fetchFn(url);
                if (typeof checkExitFn === 'function') {
                    let intervalId;
                    const exitWatcher = new Promise((_, reject) => {
                        intervalId = setInterval(() => {
                            const err = checkExitFn();
                            if (err) {
                                clearInterval(intervalId);
                                reject(err);
                            }
                        }, 50);
                        if (intervalId.unref) intervalId.unref();
                    });
                    try {
                        res = await Promise.race([fetchPromise, exitWatcher]);
                    } finally {
                        if (intervalId) clearInterval(intervalId);
                    }
                } else {
                    res = await fetchPromise;
                }
            } else {
                const httpPromise = new Promise((resolve, reject) => {
                    const req = http.get(url, { timeout: 1000 }, (resp) => {
                        let data = '';
                        resp.on('data', chunk => data += chunk);
                        resp.on('end', () => {
                            resolve({ status: resp.statusCode, body: data, headers: resp.headers });
                        });
                    });
                    req.on('error', reject);
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error('HTTP request timed out'));
                    });
                });

                if (typeof checkExitFn === 'function') {
                    let intervalId;
                    const exitWatcher = new Promise((_, reject) => {
                        intervalId = setInterval(() => {
                            const err = checkExitFn();
                            if (err) {
                                clearInterval(intervalId);
                                reject(err);
                            }
                        }, 50);
                        if (intervalId.unref) intervalId.unref();
                    });
                    try {
                        res = await Promise.race([httpPromise, exitWatcher]);
                    } finally {
                        if (intervalId) clearInterval(intervalId);
                    }
                } else {
                    res = await httpPromise;
                }
            }

            if (res && res.status === expectedStatus) {
                if (!matchBody || (matchBody instanceof RegExp ? matchBody.test(res.body) : res.body.includes(matchBody))) {
                    return { success: true, status: res.status, body: res.body };
                }
            }
        } catch (err) {
            if (typeof checkExitFn === 'function') {
                const exitError = checkExitFn();
                if (exitError) throw exitError;
            }
            if (err && err.message && (err.message.includes('exited prematurely') || err.message.includes('failed to spawn'))) {
                throw err;
            }
            // Keep retrying until timeout
        }

        await new Promise(r => setTimeout(r, intervalMs));
    }

    if (typeof checkExitFn === 'function') {
        const exitError = checkExitFn();
        if (exitError) throw exitError;
    }

    throw new Error(`Probe failed on ${url}: expected status ${expectedStatus} within ${timeoutMs}ms`);
}

/**
 * Execute a git command returning stdout
 */
function execGitSync(args, cwd = '.') {
    return child_process.execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

/**
 * Resolves a git ref strictly as a commit hash using `git rev-parse --verify <ref>^{commit}`
 */
function resolveCommit(ref, repoRoot = '.') {
    validateRef(ref);
    return execGitSync(['rev-parse', '--verify', `${ref}^{commit}`], repoRoot);
}

/**
 * Default command runner for npm install and build commands.
 */
function defaultRunCommand(cmd, args, options = {}) {
    const { cwd = '.', env = process.env, timeoutMs = 300000 } = options;

    let executable = cmd;
    let cmdArgs = args;

    // Cross-platform npm handling: on Windows execute npm-cli.js via node directly to avoid EINVAL/shell
    if (cmd === 'npm' && process.platform === 'win32') {
        const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
        if (fs.existsSync(npmCli)) {
            executable = process.execPath;
            cmdArgs = [npmCli, ...args];
        } else {
            return child_process.spawnSync('npm.cmd', args, {
                cwd,
                env,
                timeout: timeoutMs,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true
            });
        }
    }

    const result = child_process.spawnSync(executable, cmdArgs, {
        cwd,
        env,
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.error) {
        throw new Error(`Execution error running "${cmd} ${args.join(' ')}" in ${cwd}: ${result.error.message}`);
    }

    if (result.status !== 0) {
        const stderr = result.stderr ? result.stderr.toString() : '';
        const stdout = result.stdout ? result.stdout.toString() : '';
        throw new Error(`Command "${cmd} ${args.join(' ')}" failed with exit code ${result.status} in ${cwd}:\n${sanitizeLog(stderr || stdout)}`);
    }

    return result;
}

/**
 * Extract git revision into target directory by exact commit SHA (no symlinking of current working copy!).
 */
async function defaultExtractRevision(commitSha, targetDir, repoRoot = '.') {
    fs.mkdirSync(targetDir, { recursive: true });

    // Use git archive stream to tar to extract exact commit into targetDir
    const archive = child_process.spawnSync('git', ['archive', commitSha], {
        cwd: repoRoot,
        maxBuffer: 50 * 1024 * 1024
    });

    if (archive.status !== 0) {
        throw new Error(`git archive failed for commit ${commitSha}: ${archive.stderr ? archive.stderr.toString() : 'Unknown error'}`);
    }

    const tar = child_process.spawnSync('tar', ['-xf', '-', '-C', targetDir], {
        input: archive.stdout
    });

    if (tar.status !== 0) {
        throw new Error(`tar extract failed for commit ${commitSha}: ${tar.stderr ? tar.stderr.toString() : 'Unknown error'}`);
    }

    return { commit: commitSha, directory: targetDir };
}

/**
 * Probes the complete set of required endpoints on a running instance:
 * 1. /api/health
 * 2. /runtime-config.js
 * 3. Static asset /index.html
 */
async function verifyInstanceEndpoints(port, timeoutMs, fetchFn, checkExitFn) {
    // 1. Health probe
    await probeHttp({
        port,
        path: '/api/health',
        expectedStatus: 200,
        matchBody: /"status"\s*:\s*"ok"/,
        timeoutMs,
        fetchFn,
        checkExitFn
    });

    // 2. Runtime config probe
    await probeHttp({
        port,
        path: '/runtime-config.js',
        expectedStatus: 200,
        matchBody: /window\.__SIVOY_CONFIG__/,
        timeoutMs,
        fetchFn,
        checkExitFn
    });

    // 3. Static asset probe
    await probeHttp({
        port,
        path: '/index.html',
        expectedStatus: 200,
        timeoutMs,
        fetchFn,
        checkExitFn
    });
}

/**
 * Main release & rollback rehearsal runner
 */
async function runRehearsal(userOptions = {}) {
    const options = {
        candidateRef: userOptions.candidateRef || 'HEAD',
        previousRef: userOptions.previousRef || 'HEAD~1',
        dryRun: Boolean(userOptions.dryRun),
        timeoutMs: userOptions.timeoutMs || 15000,
        commandTimeoutMs: userOptions.commandTimeoutMs || 300000,
        keepTemp: Boolean(userOptions.keepTemp),
        skipInstall: Boolean(userOptions.skipInstall),
        skipBuild: Boolean(userOptions.skipBuild),
        port: userOptions.port || null,
        verbose: Boolean(userOptions.verbose),
        repoRoot: userOptions.repoRoot || path.resolve('.'),
        baseTempDir: userOptions.baseTempDir || path.resolve(os.tmpdir(), 'sivoy-release-rehearsals'),
        logger: userOptions.logger || ((msg) => console.log(sanitizeLog(msg))),
        injected: userOptions.injected || null
    };

    const log = options.logger;
    const stages = [];
    const limitations = [];
    const report = {
        timestamp: new Date().toISOString(),
        mode: options.dryRun ? 'structural-dry-run' : 'full-rehearsal',
        status: 'pending',
        candidate: { ref: options.candidateRef },
        previous: { ref: options.previousRef },
        stages,
        limitations
    };

    function recordStage(name, status, details = {}) {
        stages.push({ name, status, timestamp: new Date().toISOString(), details });
        if (options.verbose) {
            log(`[Rehearsal Stage: ${name}] status=${status} ${JSON.stringify(details)}`);
        }
    }

    log(`[Rehearsal] Mode: ${report.mode}`);
    log(`[Rehearsal] Candidate Ref: ${options.candidateRef}`);
    log(`[Rehearsal] Previous Ref: ${options.previousRef}`);

    // 1. Validation Stage: Resolve commits strictly with git rev-parse --verify <ref>^{commit}
    try {
        validateRef(options.candidateRef);
        validateRef(options.previousRef);

        let candidateCommit = 'mock-candidate-sha';
        let previousCommit = 'mock-previous-sha';

        if (options.injected && options.injected.resolveCommit) {
            candidateCommit = await options.injected.resolveCommit(options.candidateRef, options.repoRoot);
            previousCommit = await options.injected.resolveCommit(options.previousRef, options.repoRoot);
        } else if (!options.injected) {
            candidateCommit = resolveCommit(options.candidateRef, options.repoRoot);
            previousCommit = resolveCommit(options.previousRef, options.repoRoot);
        }

        report.candidate.commit = candidateCommit;
        report.previous.commit = previousCommit;
        recordStage('validate-refs', 'ok', { candidateCommit, previousCommit });
    } catch (err) {
        recordStage('validate-refs', 'failed', { error: err.message });
        report.status = 'failed';
        report.error = err.message;
        return report;
    }

    // 2. Ephemeral Port Verification Stage (acknowledging TOCTOU race condition until bind)
    let testPort;
    try {
        if (options.injected && options.injected.getEphemeralPort) {
            testPort = await options.injected.getEphemeralPort();
        } else {
            testPort = options.port || await getEphemeralPort();
        }
        recordStage('ephemeral-port-check', 'ok', { port: testPort, raceConditionNoted: true });
    } catch (err) {
        recordStage('ephemeral-port-check', 'failed', { error: err.message });
        report.status = 'failed';
        report.error = err.message;
        return report;
    }

    // 3. Safe Whitelisted Environment Configuration Check Stage
    const safeEnv = buildSafeChildEnv({ PORT: String(testPort) });
    recordStage('safe-config-check', 'ok', {
        envKeys: Object.keys(safeEnv),
        secretRedacted: true
    });

    // If DRY RUN: perform structural checks (real isSafeTempDirectory check without residue) and exit cleanly
    if (options.dryRun) {
        const simulatedExecDir = path.join(options.baseTempDir, 'dryrun-structural-check');
        const simulatedCandidate = path.join(simulatedExecDir, 'candidate');
        const isCandidateSafe = isSafeTempDirectory(simulatedCandidate, options.baseTempDir);
        const isRepoRootSafe = isSafeTempDirectory(options.repoRoot, options.baseTempDir);
        const pathBoundaryVerified = Boolean(isCandidateSafe && !isRepoRootSafe);

        limitations.push('Structural dry-run verifies commit resolution, path boundaries, ephemeral port acquisition (with race risk until bind), and safe env isolation.');
        limitations.push('Rollback procedure is NOT verified during dry-run (rollbackProcedureVerified: false). Full rollback lifecycle is validated via unit tests with mock process runner and during staging/local full runs.');
        limitations.push('npm ci, build, and database-dependent routes are omitted in dry-run mode to maintain fast, hermetic CI execution without PostgreSQL.');

        recordStage('structural-dry-run-verification', 'ok', {
            candidateRefValid: true,
            previousRefValid: true,
            safeConfigValid: true,
            pathBoundaryVerified,
            rollbackProcedureVerified: false,
            note: 'Rollback lifecycle is not executed in dry-run mode. Verified via unit tests with mock runners.'
        });

        report.status = 'success';
        log('[Rehearsal] Structural dry-run completed successfully.');
        return report;
    }

    // FULL REHEARSAL EXECUTION
    const tracker = createProcessTracker();
    let executionDir = null;

    // Global process cleanup hook in case rehearsal is interrupted
    const onSignal = () => {
        tracker.terminateAll().finally(() => process.exit(1));
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
        const extractRevisionFn = (options.injected && options.injected.extractRevision)
            ? options.injected.extractRevision
            : defaultExtractRevision;

        const runCommandFn = (options.injected && options.injected.runCommand)
            ? options.injected.runCommand
            : defaultRunCommand;

        const removeDirFn = (options.injected && options.injected.removeTempDir)
            ? options.injected.removeTempDir
            : (d) => safeRemoveTempDir(d, options.baseTempDir);

        const spawnFn = (options.injected && options.injected.spawnProcess)
            ? options.injected.spawnProcess
            : child_process.spawn;

        const fetchFn = (options.injected && options.injected.fetchUrl)
            ? options.injected.fetchUrl
            : null;

        // Base temp directory creation
        if (!fs.existsSync(options.baseTempDir)) {
            fs.mkdirSync(options.baseTempDir, { recursive: true });
        }

        // Single unique execution directory via mkdtempSync
        const mkdtempFn = (options.injected && options.injected.mkdtempSync)
            ? options.injected.mkdtempSync
            : (prefix) => fs.mkdtempSync(prefix);

        executionDir = mkdtempFn(path.join(options.baseTempDir, 'run-'));

        const candidateDir = path.join(executionDir, 'candidate');
        const rollbackDir = path.join(executionDir, 'rollback');
        const npmCacheDir = path.join(executionDir, 'npm-cache');
        const emptyNpmrc = path.join(executionDir, '.npmrc');

        if (!options.injected || !options.injected.skipFsSetup) {
            fs.mkdirSync(npmCacheDir, { recursive: true });
            fs.writeFileSync(emptyNpmrc, '');
        }

        // Isolated child environment with local npm cache and empty userconfig
        const childEnv = buildSafeChildEnv({
            PORT: String(testPort),
            NPM_CONFIG_USERCONFIG: emptyNpmrc,
            NPM_CONFIG_CACHE: npmCacheDir
        });

        // Helper to install & build a revision workspace with explicit command timeout and production flag
        async function buildRevision(dir, refName) {
            if (!options.skipInstall) {
                log(`[Rehearsal] Installing backend dependencies for ${refName} (${dir})...`);
                await runCommandFn('npm', ['ci'], { cwd: path.join(dir, 'backend'), env: childEnv, timeoutMs: options.commandTimeoutMs });

                log(`[Rehearsal] Installing frontend dependencies for ${refName} (${dir})...`);
                await runCommandFn('npm', ['ci'], { cwd: path.join(dir, 'frontend'), env: childEnv, timeoutMs: options.commandTimeoutMs });
            }
            if (!options.skipBuild) {
                log(`[Rehearsal] Building frontend production for ${refName} (${dir})...`);
                await runCommandFn('npm', ['run', 'build', '--', '--configuration', 'production'], {
                    cwd: path.join(dir, 'frontend'),
                    env: childEnv,
                    timeoutMs: options.commandTimeoutMs
                });
            }
        }

        // --- STEP 1: EXTRACT & BUILD CANDIDATE BY RESOLVED COMMIT (Eliminates TOCTOU) ---
        log(`[Rehearsal] Extracting candidate workspace for commit ${report.candidate.commit}...`);
        await extractRevisionFn(report.candidate.commit, candidateDir, options.repoRoot);
        recordStage('extract-candidate', 'ok', { directory: candidateDir, commit: report.candidate.commit });

        log(`[Rehearsal] Preparing and building candidate workspace...`);
        await buildRevision(candidateDir, 'candidate');
        recordStage('build-candidate', 'ok');

        // --- STEP 2: BOOT CANDIDATE BACKEND ---
        log(`[Rehearsal] Booting candidate backend on ephemeral port ${testPort}...`);
        const candidateProc = spawnFn(process.execPath, ['server.js'], {
            cwd: path.join(candidateDir, 'backend'),
            env: childEnv,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        tracker.track(candidateProc);

        // Safe drainage of server pipes and error / early exit detection
        let candidateStderr = '';
        let candidateExited = false;
        let candidateExitDetails = null;

        if (candidateProc.stderr) {
            candidateProc.stderr.on('data', (chunk) => {
                candidateStderr += chunk.toString();
                if (candidateStderr.length > 8192) candidateStderr = candidateStderr.slice(-8192);
            });
            if (typeof candidateProc.stderr.resume === 'function') candidateProc.stderr.resume();
        }
        if (candidateProc.stdout && typeof candidateProc.stdout.resume === 'function') {
            candidateProc.stdout.resume();
        }

        candidateProc.once('error', (err) => {
            candidateExited = true;
            candidateExitDetails = { code: null, signal: null, error: err.message };
        });

        candidateProc.once('exit', (code, signal) => {
            candidateExited = true;
            candidateExitDetails = { code, signal };
        });

        const checkCandidateExit = () => {
            if (candidateExited) {
                if (candidateExitDetails.error) {
                    return new Error(`Candidate backend server failed to spawn: ${candidateExitDetails.error}`);
                }
                return new Error(`Candidate backend server exited prematurely with code ${candidateExitDetails.code} (signal: ${candidateExitDetails.signal}). Stderr: ${sanitizeLog(candidateStderr)}`);
            }
            return null;
        };

        // --- STEP 3: VERIFY CANDIDATE ENDPOINTS (health, runtime-config, static index) ---
        log('[Rehearsal] Probing candidate endpoints (/api/health, /runtime-config.js, static index)...');
        try {
            await verifyInstanceEndpoints(testPort, options.timeoutMs, fetchFn, checkCandidateExit);
            recordStage('verify-candidate-endpoints', 'ok', { port: testPort });
        } catch (probeErr) {
            recordStage('verify-candidate-endpoints', 'failed', { error: probeErr.message });
            throw new Error(`Candidate verification failed: ${probeErr.message}`);
        }

        // --- STEP 4: STOP CANDIDATE PROCESS ---
        log('[Rehearsal] Stopping candidate backend...');
        await tracker.terminate(candidateProc);
        recordStage('stop-candidate', 'ok');

        // --- STEP 5: EXTRACT & BUILD ROLLBACK BY RESOLVED COMMIT (Eliminates TOCTOU) ---
        log(`[Rehearsal] Extracting rollback workspace for commit ${report.previous.commit}...`);
        await extractRevisionFn(report.previous.commit, rollbackDir, options.repoRoot);
        recordStage('extract-rollback', 'ok', { directory: rollbackDir, commit: report.previous.commit });

        log(`[Rehearsal] Preparing and building rollback workspace...`);
        await buildRevision(rollbackDir, 'rollback');
        recordStage('build-rollback', 'ok');

        // --- STEP 6: BOOT ROLLBACK BACKEND ---
        log(`[Rehearsal] Booting rollback backend on ephemeral port ${testPort}...`);
        const rollbackProc = spawnFn(process.execPath, ['server.js'], {
            cwd: path.join(rollbackDir, 'backend'),
            env: childEnv,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        tracker.track(rollbackProc);

        // Safe drainage of rollback server pipes and error / early exit detection
        let rollbackStderr = '';
        let rollbackExited = false;
        let rollbackExitDetails = null;

        if (rollbackProc.stderr) {
            rollbackProc.stderr.on('data', (chunk) => {
                rollbackStderr += chunk.toString();
                if (rollbackStderr.length > 8192) rollbackStderr = rollbackStderr.slice(-8192);
            });
            if (typeof rollbackProc.stderr.resume === 'function') rollbackProc.stderr.resume();
        }
        if (rollbackProc.stdout && typeof rollbackProc.stdout.resume === 'function') {
            rollbackProc.stdout.resume();
        }

        rollbackProc.once('error', (err) => {
            rollbackExited = true;
            rollbackExitDetails = { code: null, signal: null, error: err.message };
        });

        rollbackProc.once('exit', (code, signal) => {
            rollbackExited = true;
            rollbackExitDetails = { code, signal };
        });

        const checkRollbackExit = () => {
            if (rollbackExited) {
                if (rollbackExitDetails.error) {
                    return new Error(`Rollback backend server failed to spawn: ${rollbackExitDetails.error}`);
                }
                return new Error(`Rollback backend server exited prematurely with code ${rollbackExitDetails.code} (signal: ${rollbackExitDetails.signal}). Stderr: ${sanitizeLog(rollbackStderr)}`);
            }
            return null;
        };

        // --- STEP 7: VERIFY ROLLBACK ENDPOINTS (health, runtime-config, static index) ---
        log('[Rehearsal] Probing rollback endpoints (/api/health, /runtime-config.js, static index)...');
        try {
            await verifyInstanceEndpoints(testPort, options.timeoutMs, fetchFn, checkRollbackExit);
            recordStage('verify-rollback-endpoints', 'ok', { port: testPort });
        } catch (probeErr) {
            recordStage('verify-rollback-endpoints', 'failed', { error: probeErr.message });
            throw new Error(`Rollback verification failed: ${probeErr.message}`);
        }

        // --- STEP 8: STOP ROLLBACK PROCESS ---
        log('[Rehearsal] Stopping rollback backend...');
        await tracker.terminate(rollbackProc);
        recordStage('stop-rollback', 'ok');

        report.status = 'success';
        log('[Rehearsal] Candidate and rollback rehearsal completed successfully.');
    } catch (err) {
        report.status = 'failed';
        report.error = err.message;
        log(`[Rehearsal ERROR] ${err.message}`);
    } finally {
        // Guarantee termination of any surviving child processes
        await tracker.terminateAll();
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);

        // Teardown the single unique execution directory unless keepTemp requested
        if (!options.keepTemp && executionDir) {
            const removeDirFn = (options.injected && options.injected.removeTempDir)
                ? options.injected.removeTempDir
                : (d) => safeRemoveTempDir(d, options.baseTempDir);

            try {
                await removeDirFn(executionDir);
            } catch (cleanErr) {
                log(`[Rehearsal Warning] Could not remove execution temp dir ${executionDir}: ${cleanErr.message}`);
            }
        }
    }

    return report;
}

module.exports = {
    parseArgs,
    validateRef,
    sanitizeLog,
    buildSafeChildEnv,
    resolveCommit,
    isSafeTempDirectory,
    safeRemoveTempDir,
    getEphemeralPort,
    createProcessTracker,
    probeHttp,
    verifyInstanceEndpoints,
    defaultRunCommand,
    defaultExtractRevision,
    runRehearsal
};
