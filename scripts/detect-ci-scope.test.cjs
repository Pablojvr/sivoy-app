'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { classifyChangedFiles } = require('./detect-ci-scope.cjs');

describe('CI change scope', () => {
  test('runs only backend checks for backend and documentation changes', () => {
    assert.deepEqual(classifyChangedFiles([
      'backend/src/server.js',
      'docs/DEFINITION_OF_DONE.md'
    ]), {
      backend: true,
      frontend: false,
      reason: 'backend-only'
    });
  });

  test('runs only frontend checks for frontend changes', () => {
    assert.deepEqual(classifyChangedFiles(['frontend/src/app/app.ts']), {
      backend: false,
      frontend: true,
      reason: 'frontend-only'
    });
  });

  test('runs both checks when both applications change', () => {
    assert.deepEqual(classifyChangedFiles([
      'backend/server.js',
      'frontend/src/main.ts'
    ]), {
      backend: true,
      frontend: true,
      reason: 'backend-and-frontend'
    });
  });

  test('runs both checks for shared or unclassified configuration', () => {
    for (const path of [
      '.github/workflows/ci.yml',
      'render.yaml',
      'scripts/check-install-scripts.cjs',
      'package.json'
    ]) {
      assert.deepEqual(classifyChangedFiles([path]), {
        backend: true,
        frontend: true,
        reason: 'shared-or-unclassified'
      });
    }
  });

  test('skips application checks for documentation-only changes', () => {
    assert.deepEqual(classifyChangedFiles([
      'README.md',
      'docs/UI_REDESIGN_DIRECTION.md',
      'AGENTS.md'
    ]), {
      backend: false,
      frontend: false,
      reason: 'documentation-only'
    });
  });

  test('defaults to both checks when the change list is empty or full validation is requested', () => {
    assert.deepEqual(classifyChangedFiles([]), {
      backend: true,
      frontend: true,
      reason: 'empty-change-set'
    });
    assert.deepEqual(classifyChangedFiles(['docs/README.md'], { forceFull: true }), {
      backend: true,
      frontend: true,
      reason: 'full-validation'
    });
  });

  test('normalizes Windows separators before classifying paths', () => {
    assert.deepEqual(classifyChangedFiles(['frontend\\src\\main.ts']), {
      backend: false,
      frontend: true,
      reason: 'frontend-only'
    });
  });
});
