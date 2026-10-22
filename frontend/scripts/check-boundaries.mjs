import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const RULES = Object.freeze({
  FEATURE_TO_FEATURE: 'features-cannot-import-features',
  SHARED_TO_CORE: 'shared-cannot-import-core',
  SHARED_TO_FEATURES: 'shared-cannot-import-features',
  CORE_TO_FEATURES: 'core-cannot-import-features',
});

export const CANONICAL_RULES = Object.freeze(new Set(Object.values(RULES)));

export function normalizePath(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/').replace(/^\.\//, '') : '';
}

export function tokenize(content) {
  const tokens = [];
  const len = content.length;
  let line = 1;
  let i = 0;

  while (i < len) {
    const ch = content[i];

    if (ch === '\n') {
      line++;
      i++;
    } else if (ch === '/' && content[i + 1] === '/') {
      i += 2;
      while (i < len && content[i] !== '\n') i++;
    } else if (ch === '/' && content[i + 1] === '*') {
      i += 2;
      while (i < len && !(content[i] === '*' && content[i + 1] === '/')) {
        if (content[i] === '\n') line++;
        i++;
      }
      if (i < len) i += 2;
    } else if (/\s/.test(ch)) {
      i++;
    } else if (ch === '?' && content[i + 1] === '.') {
      tokens.push({ type: 'punct', value: '?.', line });
      i += 2;
    } else if ('.:;(){}*,='.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, line });
      i++;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      const startLine = line;
      let strVal = '';
      let hasInterpolation = false;
      i++;
      while (i < len) {
        const c = content[i];
        if (c === '\n') line++;
        if (c === '\\') {
          strVal += content[i + 1] || '';
          i += 2;
          continue;
        }
        if (quote === '`' && c === '$' && content[i + 1] === '{') hasInterpolation = true;
        if (c === quote) {
          i++;
          break;
        }
        strVal += c;
        i++;
      }
      tokens.push({ type: 'string', value: strVal, line: startLine, hasInterpolation });
    } else if (/[a-zA-Z0-9_$]/.test(ch)) {
      let word = '';
      const startLine = line;
      while (i < len && /[a-zA-Z0-9_$]/.test(content[i])) {
        word += content[i++];
      }
      tokens.push({ type: 'ident', value: word, line: startLine });
    } else {
      tokens.push({ type: 'other', value: ch, line });
      i++;
    }
  }

  return tokens;
}

function findFromSpecifier(tokens, startIdx) {
  let paren = 0;
  let brace = 0;
  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.value === '(') paren++;
    else if (t.value === ')') paren--;
    else if (t.value === '{') brace++;
    else if (t.value === '}') brace--;
    else if (paren === 0 && brace === 0) {
      if (t.value === ';') break;
      if (t.type === 'ident' && t.value === 'from') {
        const next = tokens[i + 1];
        return next?.type === 'string' ? next : null;
      }
      if (t.type === 'ident' && (t.value === 'import' || t.value === 'export')) break;
    }
  }
  return null;
}

const DECLARATION_KEYWORDS = new Set([
  'class', 'function', 'const', 'let', 'var', 'interface', 'enum', 'default', 'abstract', 'async'
]);

export function extractImports(content) {
  const tokens = tokenize(content);
  const imports = [];

  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];

    if (tok.type === 'ident' && tok.value === 'import') {
      const prev = tokens[k - 1];
      if (prev && (prev.value === '.' || prev.value === '?.')) continue;

      const next = tokens[k + 1];
      if (next?.value === ':') continue;

      if (next?.value === '(') {
        const arg = tokens[k + 2];
        if (arg?.type === 'string' && !arg.hasInterpolation) {
          imports.push({ specifier: arg.value, line: arg.line, type: 'dynamic' });
        }
        continue;
      }

      if (next?.type === 'string') {
        imports.push({ specifier: next.value, line: next.line, type: 'static' });
        continue;
      }

      const target = findFromSpecifier(tokens, k + 1);
      if (target) {
        imports.push({ specifier: target.value, line: target.line, type: 'static' });
      }
      continue;
    }

    if (tok.type === 'ident' && tok.value === 'export') {
      const next = tokens[k + 1];
      if (!next || DECLARATION_KEYWORDS.has(next.value)) continue;

      if (next.value === 'type') {
        const afterType = tokens[k + 2];
        if (!afterType || (afterType.value !== '{' && afterType.value !== '*')) continue;
      }

      const target = findFromSpecifier(tokens, k + 1);
      if (target) {
        imports.push({ specifier: target.value, line: target.line, type: 'export' });
      }
    }
  }

  return imports;
}

export function resolveRelativeImport(sourceFilePath, importSpecifier) {
  if (typeof importSpecifier !== 'string') return null;

  const normalized = importSpecifier.replace(/\\/g, '/');
  if (!normalized.startsWith('.')) return null;

  const sourceDir = path.dirname(path.resolve(sourceFilePath));
  const candidate = path.resolve(sourceDir, normalized);

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  const candidateTs = `${candidate}.ts`;
  if (fs.existsSync(candidateTs) && fs.statSync(candidateTs).isFile()) return candidateTs;
  const indexTs = path.join(candidate, 'index.ts');
  if (fs.existsSync(indexTs) && fs.statSync(indexTs).isFile()) return indexTs;

  return candidate.endsWith('.ts') ? candidate : candidateTs;
}

export function getModuleInfo(filePath, srcAppDir) {
  const normFile = path.resolve(filePath).replace(/\\/g, '/');
  const normAppDir = path.resolve(srcAppDir).replace(/\\/g, '/');
  const relFromApp = path.posix.relative(normAppDir, normFile);

  if (relFromApp.startsWith('..') || path.posix.isAbsolute(relFromApp)) {
    return { layer: 'outside', feature: null, relFromApp };
  }

  const [segment0, segment1] = relFromApp.split('/');
  if (segment0 === 'features') {
    return { layer: 'features', feature: segment1 || null, relFromApp };
  }
  if (segment0 === 'shared' || segment0 === 'core') {
    return { layer: segment0, feature: null, relFromApp };
  }
  return { layer: 'root', feature: null, relFromApp };
}

export function checkImportBoundary(sourceInfo, targetInfo) {
  if (targetInfo.layer === 'outside') return null;

  if (sourceInfo.layer === 'features') {
    if (targetInfo.layer === 'features' && targetInfo.feature && sourceInfo.feature && sourceInfo.feature !== targetInfo.feature) {
      return {
        rule: RULES.FEATURE_TO_FEATURE,
        message: `Feature '${sourceInfo.feature}' cannot import from feature '${targetInfo.feature}'`,
      };
    }
    return null;
  }

  if (sourceInfo.layer === 'shared') {
    if (targetInfo.layer === 'features') {
      return {
        rule: RULES.SHARED_TO_FEATURES,
        message: `Shared layer cannot import from features (target feature: '${targetInfo.feature || 'unknown'}')`,
      };
    }
    if (targetInfo.layer === 'core') {
      return { rule: RULES.SHARED_TO_CORE, message: 'Shared layer cannot import from core layer' };
    }
    return null;
  }

  if (sourceInfo.layer === 'core' && targetInfo.layer === 'features') {
    return {
      rule: RULES.CORE_TO_FEATURES,
      message: `Core layer cannot import from features (target feature: '${targetInfo.feature || 'unknown'}')`,
    };
  }

  return null;
}

export function findProductionTsFiles(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Directory does not exist: "${dir}"`);

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findProductionTsFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

function validateBaselinePath(val, field, idx, baselinePath) {
  const pfx = `Invalid baseline entry at index ${idx} in "${baselinePath}":`;
  if (typeof val !== 'string' || !val.trim()) return `${pfx} missing or empty '${field}'.`;
  if (path.isAbsolute(val) || val.startsWith('/') || val.startsWith('\\') || /^[a-zA-Z]:/.test(val)) {
    return `${pfx} '${field}' must be a relative path, not absolute ("${val}").`;
  }
  if (val.includes('..')) return `${pfx} '${field}' cannot contain traversal '..' ("${val}").`;
  if (!val.endsWith('.ts')) return `${pfx} '${field}' must end with '.ts' ("${val}").`;
  if (val.includes('\\') || val.startsWith('./') || !val.startsWith('src/app/')) {
    return `${pfx} '${field}' must be normalized with forward slashes inside 'src/app/' ("${val}").`;
  }
  return null;
}

export function validateBaseline(baseline, baselinePath = 'baseline') {
  if (!Array.isArray(baseline)) {
    return { valid: false, error: `Invalid baseline format in "${baselinePath}": expected a JSON array of entries.` };
  }

  const baselineSet = new Set();
  const allowedKeys = ['source', 'target', 'rule'];

  for (let idx = 0; idx < baseline.length; idx++) {
    const entry = baseline[idx];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { valid: false, error: `Invalid baseline entry at index ${idx} in "${baselinePath}": expected an object.` };
    }

    const entryKeys = Object.keys(entry);
    if (entryKeys.length !== 3 || !allowedKeys.every((k) => entryKeys.includes(k))) {
      return {
        valid: false,
        error: `Invalid baseline entry at index ${idx} in "${baselinePath}": entry must contain exactly source, target, rule without extra keys (found: [${entryKeys.join(', ')}]).`,
      };
    }

    if (typeof entry.rule !== 'string' || !CANONICAL_RULES.has(entry.rule)) {
      return {
        valid: false,
        error: `Invalid baseline entry at index ${idx} in "${baselinePath}": unknown or disallowed rule "${entry.rule}". Must be one of canonical RULES.`,
      };
    }

    for (const field of ['source', 'target']) {
      const pathErr = validateBaselinePath(entry[field], field, idx, baselinePath);
      if (pathErr) return { valid: false, error: pathErr };
    }

    const key = `${entry.source}|${entry.target}|${entry.rule}`;
    if (baselineSet.has(key)) {
      return {
        valid: false,
        error: `Duplicate baseline entry detected in "${baselinePath}": source="${entry.source}", target="${entry.target}", rule="${entry.rule}".`,
      };
    }
    baselineSet.add(key);
  }

  return { valid: true, baselineMap: baselineSet };
}

export function checkBoundaries({ srcDir, baselinePath, baseDir } = {}) {
  const fail = (err, total = 0) => ({ ok: false, errors: [err], totalFiles: total, totalViolations: 0, newViolations: [], permittedViolations: 0 });
  if (!srcDir || !fs.existsSync(srcDir)) return fail(`Source directory does not exist: "${srcDir}"`);

  let tsFiles = [];
  try {
    tsFiles = findProductionTsFiles(srcDir);
  } catch (err) {
    return fail(`Failed reading source directory "${srcDir}": ${err.message}`);
  }

  if (tsFiles.length === 0) {
    return fail(`No production TypeScript files found in "${srcDir}". Expected at least one .ts file.`);
  }

  if (!baselinePath || !fs.existsSync(baselinePath)) {
    return fail(`Baseline file not found at "${baselinePath}".`, tsFiles.length);
  }

  let baselineData;
  try {
    baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (err) {
    return fail(`Failed to parse baseline JSON at "${baselinePath}": ${err.message}`, tsFiles.length);
  }

  const baselineValidation = validateBaseline(baselineData, baselinePath);
  if (!baselineValidation.valid) {
    return fail(baselineValidation.error, tsFiles.length);
  }

  const baselineMap = baselineValidation.baselineMap;
  const resolvedBaseDir = baseDir ? path.resolve(baseDir) : path.resolve(srcDir, '..', '..');
  const detectedViolations = [];
  const errors = [];

  for (const filePath of tsFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      errors.push(`Cannot read file "${filePath}": ${err.message}`);
      continue;
    }

    const imports = extractImports(content);
    const sourceInfo = getModuleInfo(filePath, srcDir);

    for (const item of imports) {
      const targetAbs = resolveRelativeImport(filePath, item.specifier);
      if (!targetAbs) continue;

      const targetInfo = getModuleInfo(targetAbs, srcDir);
      const violation = checkImportBoundary(sourceInfo, targetInfo);

      if (violation) {
        detectedViolations.push({
          source: normalizePath(path.relative(resolvedBaseDir, filePath)),
          target: normalizePath(path.relative(resolvedBaseDir, targetAbs)),
          rule: violation.rule,
          line: item.line,
          specifier: item.specifier,
          message: violation.message,
        });
      }
    }
  }

  const newViolations = [];
  let permittedCount = 0;

  for (const v of detectedViolations) {
    const key = `${v.source}|${v.target}|${v.rule}`;
    if (baselineMap.has(key)) permittedCount++;
    else newViolations.push(v);
  }

  newViolations.sort((a, b) =>
    a.source.localeCompare(b.source) ||
    a.line - b.line ||
    a.target.localeCompare(b.target) ||
    a.rule.localeCompare(b.rule)
  );

  return {
    ok: errors.length === 0 && newViolations.length === 0,
    errors,
    totalFiles: tsFiles.length,
    totalViolations: detectedViolations.length,
    newViolations,
    permittedViolations: permittedCount,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let srcDir = path.join(frontendDir, 'src', 'app');
  let baselinePath = path.join(frontendDir, 'scripts', 'boundary-baseline.json');
  let baseDir = frontendDir;
  let quiet = false;

  const seenOptions = new Set();
  const optionsWithValue = new Set(['--src-dir', '--baseline', '--base-dir']);
  const failCli = (msg) => { console.error(`[Architectural Boundaries] Error: ${msg}`); return 1; };

  for (let idx = 0; idx < argv.length; idx++) {
    const arg = argv[idx];

    if (arg === '--help' || arg === '-h') {
      if (seenOptions.has('--help')) return failCli('Option "--help" cannot be specified more than once.');
      seenOptions.add('--help');
      console.log('Usage: node check-boundaries.mjs [--src-dir <dir>] [--baseline <path>] [--base-dir <dir>] [--quiet] [--help]');
      return 0;
    }

    if (arg === '--quiet') {
      if (seenOptions.has('--quiet')) return failCli('Option "--quiet" cannot be specified more than once.');
      seenOptions.add('--quiet');
      quiet = true;
      continue;
    }

    if (optionsWithValue.has(arg)) {
      if (seenOptions.has(arg)) return failCli(`Option "${arg}" cannot be specified more than once.`);
      seenOptions.add(arg);

      const nextVal = argv[idx + 1];
      if (nextVal === undefined || nextVal.startsWith('-')) {
        return failCli(`Option "${arg}" requires a value.`);
      }

      idx++;
      const val = argv[idx];
      if (arg === '--src-dir') srcDir = path.resolve(val);
      else if (arg === '--baseline') baselinePath = path.resolve(val);
      else if (arg === '--base-dir') baseDir = path.resolve(val);
      continue;
    }

    return failCli(arg.startsWith('-') ? `Unknown option "${arg}".` : `Unexpected argument "${arg}".`);
  }

  const result = checkBoundaries({ srcDir, baselinePath, baseDir });

  if (result.errors.length > 0) {
    for (const err of result.errors) console.error(`[Architectural Boundaries] Error: ${err}`);
    return 1;
  }

  if (result.newViolations.length > 0) {
    console.error(`[Architectural Boundaries] FAILED: ${result.newViolations.length} new architectural boundary violation(s) detected:`);
    for (const v of result.newViolations) {
      console.error(`  - ${v.source}:${v.line} [${v.rule}] ${v.message} (target: ${v.target})`);
    }
    return 1;
  }

  if (!quiet) {
    console.log(`[Architectural Boundaries] PASSED: ${result.totalFiles} production file(s) checked. 0 new violations (${result.permittedViolations} baseline exception(s) permitted).`);
  }

  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().then((code) => {
    process.exit(code);
  }).catch((err) => {
    console.error('[Architectural Boundaries] Fatal error:', err);
    process.exit(1);
  });
}
