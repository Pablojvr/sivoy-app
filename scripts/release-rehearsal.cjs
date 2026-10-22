#!/usr/bin/env node
/**
 * SiVoy Local Release & Rollback Rehearsal CLI
 *
 * Slices: T36a
 * Cero dependencias npm adicionales (requiere herramientas del sistema: Git, tar, Node.js y npm).
 * CLI delgada que delega la orquestación a scripts/release-rehearsal-core.cjs.
 */

const { parseArgs, runRehearsal, sanitizeLog } = require('./release-rehearsal-core.cjs');

function printHelp() {
    console.log(`
SiVoy Local Release & Rollback Rehearsal (T36a)
Cero dependencias npm adicionales (requiere herramientas del sistema: Git, tar, Node.js y npm).

Usage:
  node scripts/release-rehearsal.cjs [options]

Options:
  --candidate <ref>       Git reference for release candidate (default: HEAD)
  --previous <ref>        Git reference for known previous release (default: HEAD~1)
  --dry-run               Perform structural validation without spawning long-running servers
  --timeout <ms>          Timeout for HTTP boot & probes in ms (default: 15000, bounds: 500-300000)
  --command-timeout <ms>  Timeout for npm install and build in ms (default: 300000, bounds: 1000-1800000)
  --port <num>            Explicit port to test (default: ephemeral dynamic port with race risk until bind)
  --skip-install          Skip npm ci installation steps
  --skip-build            Skip frontend production build steps
  --keep-temp             Do not remove temporary directories after run (for debugging)
  --verbose, -v           Verbose output
  --help, -h              Show this help message
`);
}

async function main(argv = process.argv.slice(2)) {
    try {
        const args = parseArgs(argv);
        if (args.help) {
            printHelp();
            return 0;
        }

        const report = await runRehearsal(args);
        if (report.status !== 'success') {
            console.error(`\n[REHEARSAL FAILED] ${report.error || 'Unknown error'}`);
            return 1;
        }

        console.log('\n[REHEARSAL PASSED]');
        return 0;
    } catch (err) {
        console.error(`\n[ARGUMENT ERROR] ${sanitizeLog(err.message)}`);
        return 1;
    }
}

if (require.main === module) {
    main().then((code) => process.exit(code));
}

// Re-export core API for transparent backward compatibility
module.exports = require('./release-rehearsal-core.cjs');
module.exports.main = main;
module.exports.printHelp = printHelp;
