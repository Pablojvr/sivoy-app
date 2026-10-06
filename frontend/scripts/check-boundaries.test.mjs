import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  extractImports,
  validateBaseline,
  checkBoundaries,
  runCli,
  RULES,
} from './check-boundaries.mjs';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createFixture(files, baseline = []) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-test-'));
  const srcApp = path.join(tempDir, 'src', 'app');
  fs.mkdirSync(srcApp, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  const baselinePath = path.join(tempDir, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
  return {
    tempDir,
    srcApp,
    baselinePath,
    cleanup: () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    },
    run: (opts = {}) => checkBoundaries({ srcDir: srcApp, baselinePath, baseDir: tempDir, ...opts }),
  };
}

test('Architectural Boundaries - 1. real repo baseline passes with 0 new violations', () => {
  const srcDir = path.join(frontendDir, 'src', 'app');
  const baselinePath = path.join(frontendDir, 'scripts', 'boundary-baseline.json');
  assert.ok(fs.existsSync(srcDir) && fs.existsSync(baselinePath));

  const result = checkBoundaries({ srcDir, baselinePath, baseDir: frontendDir });
  assert.deepStrictEqual(result.newViolations, []);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.permittedViolations, 0);
  assert.ok(result.totalFiles >= 40);
});

test('Architectural Boundaries - 2. Rule (a) feature-to-feature violation fails without baseline', () => {
  const f = createFixture({
    'src/app/features/discovery/discovery.component.ts': "import { HomeComponent } from '../home/home.component';",
    'src/app/features/home/home.component.ts': 'export class HomeComponent {}',
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 1);
    assert.strictEqual(res.newViolations[0].rule, RULES.FEATURE_TO_FEATURE);
    assert.strictEqual(res.newViolations[0].source, 'src/app/features/discovery/discovery.component.ts');
    assert.strictEqual(res.newViolations[0].target, 'src/app/features/home/home.component.ts');
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 3. Rule (b) shared cannot import core', () => {
  const f = createFixture({
    'src/app/core/toast/toast.service.ts': 'export class ToastService {}',
    'src/app/shared/toast/toast.component.ts': "import { ToastService } from '../../core/toast/toast.service';",
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 1);
    assert.strictEqual(res.newViolations[0].rule, RULES.SHARED_TO_CORE);
    assert.strictEqual(res.newViolations[0].source, 'src/app/shared/toast/toast.component.ts');
    assert.strictEqual(res.newViolations[0].target, 'src/app/core/toast/toast.service.ts');
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 4. Rule (b) shared cannot import features', () => {
  const f = createFixture({
    'src/app/features/admin/admin.component.ts': 'export class AdminComponent {}',
    'src/app/shared/nav/nav.component.ts': "import { AdminComponent } from '../../features/admin/admin.component';",
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 1);
    assert.strictEqual(res.newViolations[0].rule, RULES.SHARED_TO_FEATURES);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 5. Rule (c) core cannot import features', () => {
  const f = createFixture({
    'src/app/features/home/home.model.ts': 'export interface HomeModel {}',
    'src/app/core/services/data.service.ts': "import { HomeModel } from '../../features/home/home.model';",
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 1);
    assert.strictEqual(res.newViolations[0].rule, RULES.CORE_TO_FEATURES);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 6. Allowed cases: intra-feature, core/shared reuse, root composition', () => {
  const f = createFixture({
    'src/environments/environment.ts': 'export const environment = {};',
    'src/app/core/maps/port.ts': 'export interface MapPort {}',
    'src/app/core/maps/adapter.ts': "import { MapPort } from './port';\nexport class MapAdapter implements MapPort {}",
    'src/app/shared/ui/button.ts': 'export class Button {}',
    'src/app/shared/ui/card.ts': "import { Button } from './button';\nexport class Card {}",
    'src/app/features/home/home.model.ts': 'export interface Model {}',
    'src/app/features/home/sub/home.sub.ts': `import { Model } from '../home.model';
import { MapPort } from '../../../core/maps/port';
import { Button } from '../../../shared/ui/button';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { Component } from '@angular/core';
export class SubComponent {}`,
    'src/app/app.routes.ts': `import { SubComponent } from './features/home/sub/home.sub';
import { MapAdapter } from './core/maps/adapter';
import { Card } from './shared/ui/card';
export const routes = [];`,
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.newViolations.length, 0);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 7. Comments and false positives (strings, comments, from keyword)', () => {
  const f = createFixture({
    'src/app/features/home/target.ts': 'export const TARGET = 1;',
    'src/app/features/discovery/discovery.ts': `
// import { TARGET } from '../home/target';
/* import { TARGET } from '../home/target'; */
const singleQuoteStr = 'import { TARGET } from "../home/target"';
const doubleQuoteStr = "import { TARGET } from '../home/target'";
const templateStr = \`import { TARGET } from '../home/target';\`;
const obj = { from: 'home', to: 'discovery' };
const letters = Array.from('abc');
export class DiscoveryComponent {
  title = "import something from '../home/target'";
}
`,
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.newViolations.length, 0);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 8. Multiline static imports, dynamic imports, and export-from are detected', () => {
  const f = createFixture({
    'src/app/features/feat-b/mod-b.ts': 'export class B {}; export class B2 {}',
    'src/app/features/feat-a/multiline.ts': "import {\n  B,\n  B2\n} from '../feat-b/mod-b';",
    'src/app/features/feat-a/dynamic.ts': "export async function load() {\n  return await import(\n    '../feat-b/mod-b'\n  );\n}",
    'src/app/features/feat-a/reexport.ts': "export { B } from '../feat-b/mod-b';\nexport * from '../feat-b/mod-b';",
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 4);
    const sources = res.newViolations.map((v) => v.source);
    assert.ok(sources.some((s) => s.includes('multiline.ts')));
    assert.ok(sources.some((s) => s.includes('dynamic.ts')));
    assert.ok(sources.some((s) => s.includes('reexport.ts')));
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 9. Resolves directory import to index.ts', () => {
  const f = createFixture({
    'src/app/features/feat-b/index.ts': 'export const FROM_INDEX = true;',
    'src/app/features/feat-a/consumer.ts': "import { FROM_INDEX } from '../feat-b';",
  });
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 1);
    assert.strictEqual(res.newViolations[0].target, 'src/app/features/feat-b/index.ts');
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 10. Windows backslash separators in specifiers and paths are normalized', () => {
  const f = createFixture(
    {
      'src/app/features/feat-b/win.ts': 'export const WIN = 1;',
      'src/app/features/feat-a/win-caller.ts': 'import { WIN } from "..\\\\feat-b\\\\win";',
    },
    [{ source: 'src/app/features/feat-a/win-caller.ts', target: 'src/app/features/feat-b/win.ts', rule: RULES.FEATURE_TO_FEATURE }]
  );
  try {
    const res = f.run();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.newViolations.length, 0);
    assert.strictEqual(res.permittedViolations, 1);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 11. Stale / eliminated baseline exception does NOT fail', () => {
  const f = createFixture(
    { 'src/app/features/feat-a/clean.ts': 'export const clean = true;' },
    [{ source: 'src/app/features/feat-a/deleted.ts', target: 'src/app/features/feat-b/deleted.ts', rule: RULES.FEATURE_TO_FEATURE }]
  );
  try {
    const res = f.run();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.newViolations.length, 0);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 12. Baseline with mismatched rule fails', () => {
  const f = createFixture(
    {
      'src/app/features/feat-b/b.ts': 'export const b = 1;',
      'src/app/features/feat-a/a.ts': "import { b } from '../feat-b/b';",
    },
    [{ source: 'src/app/features/feat-a/a.ts', target: 'src/app/features/feat-b/b.ts', rule: RULES.SHARED_TO_CORE }]
  );
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.newViolations.length, 1);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 13. Duplicate baseline entry fails validation', () => {
  const entry = { source: 'src/app/features/alpha/alpha.component.ts', target: 'src/app/features/beta/beta.component.ts', rule: RULES.FEATURE_TO_FEATURE };
  const val = validateBaseline([entry, entry]);
  assert.strictEqual(val.valid, false);
  assert.ok(val.error.includes('Duplicate baseline entry detected'));
});

test('Architectural Boundaries - 14. Malformed and invalid baseline entries fail validation', () => {
  assert.strictEqual(validateBaseline('not an array').valid, false);
  assert.strictEqual(validateBaseline([{ source: 'a' }]).valid, false);
  assert.strictEqual(validateBaseline([{ source: 'a', target: 'b' }]).valid, false);
  assert.strictEqual(validateBaseline([{ source: '', target: 'b', rule: 'r' }]).valid, false);
});

test('Architectural Boundaries - 15. Non-existent source directory fails with diagnostic', () => {
  const res = checkBoundaries({
    srcDir: path.join(os.tmpdir(), 'non-existent-dir-12345'),
    baselinePath: path.join(frontendDir, 'scripts', 'boundary-baseline.json'),
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.errors[0].includes('Source directory does not exist'));
});

test('Architectural Boundaries - 16. Empty source directory fails with diagnostic', () => {
  const f = createFixture({});
  try {
    const res = f.run();
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors[0].includes('No production TypeScript files found'));
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 17. Missing baseline file fails with diagnostic', () => {
  const f = createFixture({ 'src/app/sample.ts': 'export const x = 1;' });
  try {
    const res = checkBoundaries({ srcDir: f.srcApp, baselinePath: path.join(f.tempDir, 'missing.json') });
    assert.strictEqual(res.ok, false);
    assert.ok(res.errors[0].includes('Baseline file not found'));
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 18. runCli returns 0 for real repo and 1 on violation', async () => {
  assert.strictEqual(await runCli(['--quiet']), 0);
  assert.strictEqual(await runCli(['--help']), 0);

  const f = createFixture({
    'src/app/features/a/a.ts': "import { b } from '../b/b';",
    'src/app/features/b/b.ts': 'export const b = 1;',
  });
  try {
    const exitFail = await runCli(['--src-dir', f.srcApp, '--baseline', f.baselinePath, '--base-dir', f.tempDir, '--quiet']);
    assert.strictEqual(exitFail, 1);
  } finally {
    f.cleanup();
  }
});

test('Architectural Boundaries - 19. Baseline validation rejects unknown rules', () => {
  const val = validateBaseline([{ source: 'src/app/features/a.ts', target: 'src/app/features/b.ts', rule: 'arbitrary-rule' }]);
  assert.strictEqual(val.valid, false);
  assert.ok(val.error.includes('unknown or disallowed rule'));
});

test('Architectural Boundaries - 20. Baseline validation rejects alias rules (canonical only)', () => {
  for (const rule of ['feature-to-feature', 'shared-to-core', 'shared-to-features', 'core-to-features']) {
    const val = validateBaseline([{ source: 'src/app/features/a.ts', target: 'src/app/features/b.ts', rule }]);
    assert.strictEqual(val.valid, false, `Alias '${rule}' must be rejected`);
    assert.ok(val.error.includes('unknown or disallowed rule'));
  }
});

test('Architectural Boundaries - 21. Baseline validation rejects path traversal with ".."', () => {
  const val = validateBaseline([{ source: 'src/app/features/../a.ts', target: 'src/app/features/b.ts', rule: RULES.FEATURE_TO_FEATURE }]);
  assert.strictEqual(val.valid, false);
  assert.ok(val.error.includes("cannot contain traversal '..'"));
});

test('Architectural Boundaries - 22. Baseline validation rejects absolute paths', () => {
  const val = validateBaseline([{ source: '/src/app/features/a.ts', target: 'src/app/features/b.ts', rule: RULES.FEATURE_TO_FEATURE }]);
  assert.strictEqual(val.valid, false);
  assert.ok(val.error.includes('must be a relative path, not absolute'));
});

test('Architectural Boundaries - 23. Baseline validation rejects extra keys in entry', () => {
  const val = validateBaseline([{ source: 'src/app/features/a.ts', target: 'src/app/features/b.ts', rule: RULES.FEATURE_TO_FEATURE, extra: 'extra' }]);
  assert.strictEqual(val.valid, false);
  assert.ok(val.error.includes('without extra keys'));
});

test('Architectural Boundaries - 24. Baseline validation rejects paths not ending in .ts or outside src/app', () => {
  assert.strictEqual(validateBaseline([{ source: 'src/app/features/a.js', target: 'src/app/features/b.ts', rule: RULES.FEATURE_TO_FEATURE }]).valid, false);
  assert.strictEqual(validateBaseline([{ source: 'src/environments/env.ts', target: 'src/app/features/b.ts', rule: RULES.FEATURE_TO_FEATURE }]).valid, false);
});

test('Architectural Boundaries - 25. Lexer does not confuse obj.import or obj?.import with dynamic imports', () => {
  const code = `
const obj = { import: (p: string) => p };
const a = obj.import('../features/home/home.component');
const b = obj?.import('../features/home/home.component');
`;
  assert.strictEqual(extractImports(code).length, 0);
});

test('Architectural Boundaries - 26. Lexer does not confuse object property import: or method import() {} with imports', () => {
  const code = `
const cfg = { import: '../features/home/home.component' };
class Loader { import() { return true; } }
const handler = { import(arg: string) { return arg; } };
`;
  assert.strictEqual(extractImports(code).length, 0);
});

test('Architectural Boundaries - 27. Lexer does not confuse exported class, function, or const having "from" with re-exports', () => {
  const code = `
export class UserProfile { from = 'admin'; }
export const settings = { from: 'discovery' };
export function transfer(from: string) { return from; }
export default class Router { from = 'any'; }
`;
  assert.strictEqual(extractImports(code).length, 0);
});

test('Architectural Boundaries - 28. CLI fails on unknown flag or unexpected argument', async () => {
  assert.strictEqual(await runCli(['--unknown-flag']), 1);
  assert.strictEqual(await runCli(['-x']), 1);
  assert.strictEqual(await runCli(['random-positional-arg']), 1);
});

test('Architectural Boundaries - 29. CLI fails when option is missing a value', async () => {
  assert.strictEqual(await runCli(['--src-dir']), 1);
  assert.strictEqual(await runCli(['--baseline']), 1);
  assert.strictEqual(await runCli(['--base-dir']), 1);
  assert.strictEqual(await runCli(['--src-dir', '--quiet']), 1);
});

test('Architectural Boundaries - 30. CLI fails when an option is repeated', async () => {
  assert.strictEqual(await runCli(['--src-dir', 'dirA', '--src-dir', 'dirB']), 1);
  assert.strictEqual(await runCli(['--quiet', '--quiet']), 1);
  assert.strictEqual(await runCli(['--baseline', 'b1', '--baseline', 'b2']), 1);
});

test('Architectural Boundaries - 31. Toast migration eliminates shared-to-core exception and preserves strict class identity', () => {
  const baselinePath = path.join(frontendDir, 'scripts', 'boundary-baseline.json');
  const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  assert.ok(!baselineData.some((entry) => entry.rule === RULES.SHARED_TO_CORE), 'shared-cannot-import-core must no longer be present in baseline');

  const sharedServicePath = path.join(frontendDir, 'src', 'app', 'shared', 'services', 'toast.service.ts');
  const coreServicePath = path.join(frontendDir, 'src', 'app', 'core', 'services', 'toast.service.ts');
  const toastComponentPath = path.join(frontendDir, 'src', 'app', 'shared', 'components', 'toast', 'toast.component.ts');

  assert.ok(fs.existsSync(sharedServicePath), 'Shared toast service file must exist');
  assert.ok(fs.existsSync(coreServicePath), 'Core toast service file must exist');
  assert.ok(fs.existsSync(toastComponentPath), 'Toast component file must exist');

  const compContent = fs.readFileSync(toastComponentPath, 'utf8');
  const compImports = extractImports(compContent);
  assert.ok(!compImports.some((i) => i.specifier.includes('core/services/toast')), 'Toast component must not import core toast service');
  assert.ok(compImports.some((i) => i.specifier.includes('../../services/toast.service')), 'Toast component must import shared toast service');

  const coreTs = fs.readFileSync(coreServicePath, 'utf8');

  // A direct ES module re-export preserves the exact class/token identity.
  assert.ok(!coreTs.includes('class ToastService'), 'Core service must not declare its own ToastService class');
  assert.match(
    coreTs.trim(),
    /^export \{ ToastService, type ToastMessage \} from '\.\.\/\.\.\/shared\/services\/toast\.service';$/,
    'Core compatibility path must be a direct re-export of the shared service',
  );
});
