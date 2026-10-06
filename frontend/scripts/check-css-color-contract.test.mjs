import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  normalizeColor,
  extractColorsAndTokens,
  findCssFiles,
  validateCssAgainstContract,
  generateBaseline,
  runCli,
  CSS_NAMED_COLORS
} from './check-css-color-contract.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');

// Helper to create isolated temporary directory under os.tmpdir()
function createTempDir(prefix = 'css-color-contract-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('CSS Color Contract - 1. baseline actual verde', () => {
  const contractPath = path.join(frontendDir, 'css-color-contract.json');
  assert.ok(fs.existsSync(contractPath), 'Contract file must exist');

  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const srcDir = path.join(frontendDir, 'src');
  const cssFiles = findCssFiles(srcDir);

  assert.ok(cssFiles.length > 0, 'CSS files must be found in frontend/src');

  const filesMap = {};
  for (const file of cssFiles) {
    const relKey = path.relative(frontendDir, file).replace(/\\/g, '/');
    filesMap[relKey] = fs.readFileSync(file, 'utf8');
  }

  const result = validateCssAgainstContract(filesMap, contract);

  assert.strictEqual(result.valid, true, 'Current baseline must be valid');
  assert.strictEqual(result.errors.length, 0, 'Expected 0 errors against baseline contract');
});

test('CSS Color Contract - 2. hex nuevo falla con diagnostico de archivo y valor', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-new-hex.css');
    const relKey = 'temp/test-new-hex.css';
    fs.writeFileSync(testCssPath, '.banner { color: #012345; background: #654321; }', 'utf8');

    const contract = {
      allowedColors: ['#ffffff'],
      allowedNamedColors: [],
      allowedRootCustomProperties: []
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, false, 'Should fail when unapproved hex color is introduced');
    assert.strictEqual(result.errors.length, 2);

    const error1 = result.errors.find(e => e.value === '#012345');
    assert.ok(error1, 'Error diagnostic must report value #012345');
    assert.strictEqual(error1.file, relKey, 'Error diagnostic must report file path');
    assert.strictEqual(error1.type, 'color');

    const error2 = result.errors.find(e => e.value === '#654321');
    assert.ok(error2, 'Error diagnostic must report value #654321');
    assert.strictEqual(error2.file, relKey, 'Error diagnostic must report file path');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 3. funcion de color nueva falla con diagnostico de archivo y valor', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-new-func.css');
    const relKey = 'temp/test-new-func.css';
    fs.writeFileSync(
      testCssPath,
      `.element {
        color: oklch(0.7 0.15 180);
        background: rgba(1, 2, 3, 0.45);
        border-color: hsl(210, 50%, 40%);
      }`,
      'utf8'
    );

    const contract = {
      allowedColors: ['#ffffff'],
      allowedNamedColors: [],
      allowedRootCustomProperties: []
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, false, 'Should fail when unapproved color function is introduced');
    assert.strictEqual(result.errors.length, 3);

    const oklchErr = result.errors.find(e => e.value === 'oklch(0.7 0.15 180)');
    assert.ok(oklchErr, 'Must report oklch function with normalized syntax');
    assert.strictEqual(oklchErr.file, relKey);

    const rgbaErr = result.errors.find(e => e.value === 'rgba(1, 2, 3, 0.45)');
    assert.ok(rgbaErr, 'Must report rgba function with normalized syntax');
    assert.strictEqual(rgbaErr.file, relKey);

    const hslErr = result.errors.find(e => e.value === 'hsl(210, 50%, 40%)');
    assert.ok(hslErr, 'Must report hsl function with normalized syntax');
    assert.strictEqual(hslErr.file, relKey);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 4. token :root nuevo falla con diagnostico de archivo y valor', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-new-root.css');
    const relKey = 'temp/test-new-root.css';
    fs.writeFileSync(
      testCssPath,
      `:root {
        --existing-token: #ffffff;
        --unapproved-token: #ffffff;
      }`,
      'utf8'
    );

    const contract = {
      allowedColors: ['#ffffff'],
      allowedNamedColors: [],
      allowedRootCustomProperties: ['--existing-token']
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, false, 'Should fail when unapproved :root token is introduced');
    assert.strictEqual(result.errors.length, 1);

    const tokenErr = result.errors[0];
    assert.strictEqual(tokenErr.type, 'root-token');
    assert.strictEqual(tokenErr.value, '--unapproved-token');
    assert.strictEqual(tokenErr.file, relKey);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 5. eliminar uno existente no falla', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-subset.css');
    const relKey = 'temp/test-subset.css';
    // CSS only uses a small subset of allowed items
    fs.writeFileSync(
      testCssPath,
      `:root {
        --brand-blue: #007aff;
      }
      .btn {
        color: #007aff;
      }`,
      'utf8'
    );

    // Contract has many existing colors and root tokens that are NOT present in CSS
    const contract = {
      allowedColors: ['#007aff', '#ffffff', '#000000', 'rgba(0, 0, 0, 0.5)'],
      allowedNamedColors: ['white', 'transparent'],
      allowedRootCustomProperties: ['--brand-blue', '--brand-coral', '--brand-lime']
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, true, 'Deleting existing colors or tokens must not fail');
    assert.strictEqual(result.errors.length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 6. named nuevo falla', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-named-new.css');
    const relKey = 'temp/test-named-new.css';
    fs.writeFileSync(
      testCssPath,
      `.a { color: red; background: rebeccapurple; }`,
      'utf8'
    );

    const contract = {
      allowedColors: [],
      allowedNamedColors: ['transparent', 'white'],
      allowedRootCustomProperties: []
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, false, 'Unapproved named colors must fail');
    assert.strictEqual(result.errors.length, 2);

    const redErr = result.errors.find(e => e.value === 'red');
    assert.ok(redErr, 'Diagnostic must report red');
    assert.strictEqual(redErr.type, 'named-color');
    assert.strictEqual(redErr.file, relKey);

    const rebErr = result.errors.find(e => e.value === 'rebeccapurple');
    assert.ok(rebErr, 'Diagnostic must report rebeccapurple');
    assert.strictEqual(rebErr.type, 'named-color');
    assert.strictEqual(rebErr.file, relKey);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 7. named permitido pasa', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-named-allowed.css');
    const relKey = 'temp/test-named-allowed.css';
    fs.writeFileSync(
      testCssPath,
      `.card {
        color: white;
        background: transparent;
        border-color: currentcolor;
      }`,
      'utf8'
    );

    const contract = {
      allowedColors: [],
      allowedNamedColors: ['currentcolor', 'transparent', 'white'],
      allowedRootCustomProperties: []
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, true, 'Approved named colors must pass');
    assert.strictEqual(result.errors.length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 8. color-mix con named nuevo falla', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-color-mix.css');
    const relKey = 'temp/test-color-mix.css';
    fs.writeFileSync(
      testCssPath,
      `.badge { background: color-mix(in srgb, red 50%, blue); }`,
      'utf8'
    );

    const contract = {
      allowedColors: [],
      allowedNamedColors: ['transparent', 'white'],
      allowedRootCustomProperties: []
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, false, 'color-mix with unapproved named colors must fail');
    assert.strictEqual(result.errors.length, 2);

    const redErr = result.errors.find(e => e.value === 'red');
    assert.ok(redErr, 'Diagnostic must report red inside color-mix');
    assert.strictEqual(redErr.type, 'named-color');
    assert.strictEqual(redErr.file, relKey);

    const blueErr = result.errors.find(e => e.value === 'blue');
    assert.ok(blueErr, 'Diagnostic must report blue inside color-mix');
    assert.strictEqual(blueErr.type, 'named-color');
    assert.strictEqual(blueErr.file, relKey);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 9. strings/var(--red)/selector no fallan (sin falsos positivos)', () => {
  const tempDir = createTempDir();
  try {
    const testCssPath = path.join(tempDir, 'test-no-false-positives.css');
    const relKey = 'temp/test-no-false-positives.css';
    fs.writeFileSync(
      testCssPath,
      `/* comment mentioning red and blue */
      .red {
        --red: 16px;
        --blue-tone: 4px;
        content: "red and blue text";
        font-family: 'Red Hat Text', sans-serif;
        color: var(--red);
        background-color: var(--blue-tone);
        background-image: url('red-icon.svg');
        white-space: nowrap;
      }
      #blue {
        border-color: var(--blue-tone);
      }`,
      'utf8'
    );

    // No named colors or root tokens allowed
    const contract = {
      allowedColors: [],
      allowedNamedColors: [],
      allowedRootCustomProperties: []
    };

    const filesMap = {
      [relKey]: fs.readFileSync(testCssPath, 'utf8')
    };

    const result = validateCssAgainstContract(filesMap, contract);

    assert.strictEqual(result.valid, true, 'Selectors, strings, custom prop names and var(--*) must not trigger false positives');
    assert.strictEqual(result.errors.length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 10. normalizacion de mayusculas y espacios sin cambiar semantica', () => {
  // Hex normalization
  assert.strictEqual(normalizeColor('#FFFFFF'), '#ffffff');
  assert.strictEqual(normalizeColor('#F45B78'), '#f45b78');
  assert.strictEqual(normalizeColor('#abc'), '#abc');

  // Whitespace and case normalization in color functions
  assert.strictEqual(
    normalizeColor('RGBA( 255 , 255 , 255 , 0.85 )'),
    'rgba(255, 255, 255, 0.85)'
  );
  assert.strictEqual(
    normalizeColor('rgba(0,0,0,0.05)'),
    'rgba(0, 0, 0, 0.05)'
  );
  assert.strictEqual(
    normalizeColor('RGB( 255   255   255  /  50% )'),
    'rgb(255 255 255 / 50%)'
  );
  assert.strictEqual(
    normalizeColor('HSL(  210deg , 50% , 40% )'),
    'hsl(210deg, 50%, 40%)'
  );
  assert.strictEqual(
    normalizeColor('oklch( 0.6  0.25  120 )'),
    'oklch(0.6 0.25 120)'
  );

  // Numbers and percentages are kept intact
  assert.strictEqual(
    normalizeColor('rgba(29, 30, 28, 0.060)'),
    'rgba(29, 30, 28, 0.060)'
  );
});

test('CSS Color Contract - 11. CLI: ruta inexistente falla y retorna 1', async () => {
  const nonExistentPath = path.join(os.tmpdir(), `non-existent-dir-${Date.now()}`);
  const dummyContract = path.join(frontendDir, 'css-color-contract.json');

  const exitCode = await runCli([nonExistentPath, dummyContract]);
  assert.strictEqual(exitCode, 1, 'CLI must exit with code 1 when src directory does not exist');
});

test('CSS Color Contract - 12. CLI: carpeta vacia falla y retorna 1', async () => {
  const tempDir = createTempDir('empty-css-dir-');
  try {
    const dummyContract = path.join(frontendDir, 'css-color-contract.json');
    const exitCode = await runCli([tempDir, dummyContract]);
    assert.strictEqual(exitCode, 1, 'CLI must exit with code 1 when 0 CSS files are found');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 13. CLI execution in temp directory', async () => {
  const tempDir = createTempDir();
  try {
    const tempSrcDir = path.join(tempDir, 'src');
    fs.mkdirSync(tempSrcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempSrcDir, 'base.css'),
      ':root { --token: #111111; } .a { color: #111111; background: white; }',
      'utf8'
    );
    const contractPath = path.join(tempDir, 'contract.json');

    // Test --generate flag via CLI
    const genCode = await runCli(['--generate', tempSrcDir, contractPath]);
    assert.strictEqual(genCode, 0, 'CLI --generate should exit 0');
    assert.ok(fs.existsSync(contractPath), 'Contract file should be written');

    const generated = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    assert.deepStrictEqual(generated.allowedNamedColors, ['white']);

    // Test check passing via CLI
    const passCode = await runCli([tempSrcDir, contractPath]);
    assert.strictEqual(passCode, 0, 'CLI should exit 0 on clean code');

    // Introduce violation with unapproved color
    fs.writeFileSync(
      path.join(tempSrcDir, 'violator.css'),
      '.bad { color: #999999; border-color: red; }',
      'utf8'
    );
    const failCode = await runCli([tempSrcDir, contractPath]);
    assert.strictEqual(failCode, 1, 'CLI should exit 1 on violation');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CSS Color Contract - 14. un subdirectorio ilegible no se omite silenciosamente', () => {
  const tempDir = createTempDir();
  const blockedDir = path.join(tempDir, 'blocked');
  const originalReadDirSync = fs.readdirSync;

  try {
    fs.mkdirSync(blockedDir);
    fs.writeFileSync(path.join(tempDir, 'base.css'), '.base { color: #111111; }', 'utf8');
    fs.readdirSync = (target, options) => {
      if (path.resolve(String(target)) === path.resolve(blockedDir)) {
        throw new Error('simulated unreadable directory');
      }
      return originalReadDirSync(target, options);
    };

    assert.throws(
      () => findCssFiles(tempDir),
      /simulated unreadable directory/,
      'Unreadable CSS subtrees must fail the contract instead of being skipped'
    );
  } finally {
    fs.readdirSync = originalReadDirSync;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
