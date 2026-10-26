'use strict';

const fs = require('node:fs');

function classifyChangedFiles(paths, options = {}) {
  if (options.forceFull) {
    return { backend: true, frontend: true, reason: 'full-validation' };
  }

  const normalizedPaths = paths
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => value.replaceAll('\\', '/'));

  if (normalizedPaths.length === 0) {
    return { backend: true, frontend: true, reason: 'empty-change-set' };
  }

  let backend = false;
  let frontend = false;
  let sharedOrUnclassified = false;

  for (const path of normalizedPaths) {
    if (isDocumentation(path)) continue;
    if (path.startsWith('backend/')) {
      backend = true;
      continue;
    }
    if (path.startsWith('frontend/')) {
      frontend = true;
      continue;
    }
    sharedOrUnclassified = true;
  }

  if (sharedOrUnclassified) {
    return { backend: true, frontend: true, reason: 'shared-or-unclassified' };
  }
  if (backend && frontend) {
    return { backend: true, frontend: true, reason: 'backend-and-frontend' };
  }
  if (backend) return { backend: true, frontend: false, reason: 'backend-only' };
  if (frontend) return { backend: false, frontend: true, reason: 'frontend-only' };
  return { backend: false, frontend: false, reason: 'documentation-only' };
}

function isDocumentation(path) {
  return path.startsWith('docs/') || path.endsWith('.md');
}

function runCli() {
  const input = fs.readFileSync(0, 'utf8');
  const paths = input.split('\0').filter(Boolean);
  const scope = classifyChangedFiles(paths, {
    forceFull: process.argv.includes('--full')
  });
  process.stdout.write([
    `backend=${scope.backend}`,
    `frontend=${scope.frontend}`,
    `reason=${scope.reason}`,
    `changed_count=${paths.length}`
  ].join('\n') + '\n');
}

if (require.main === module) runCli();

module.exports = { classifyChangedFiles };
