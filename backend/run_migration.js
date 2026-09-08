// Retained only to stop old operational instructions from running destructive DDL.
console.error('Deprecated: use `npm run migrate:status` before `npm run migrate`.');
process.exitCode = 1;
