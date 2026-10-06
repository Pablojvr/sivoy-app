import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Standard CSS Color Module Level 4 named color keywords,
 * including 'transparent' and 'currentcolor', in deterministic alphabetical order.
 */
export const CSS_NAMED_COLORS = Object.freeze([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
  'beige', 'bisque', 'black', 'blanchedalmond', 'blue',
  'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson',
  'currentcolor', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod',
  'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
  'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia',
  'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray',
  'green', 'greenyellow', 'grey', 'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
  'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
  'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
  'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose',
  'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive',
  'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
  'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey',
  'snow', 'springgreen', 'steelblue', 'tan', 'teal',
  'thistle', 'tomato', 'transparent', 'turquoise', 'violet',
  'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
]);

/**
 * Normalizes CSS color string:
 * - Hex colors to lowercase
 * - Function names to lowercase
 * - Whitespace normalized inside arguments, commas (', '), and slashes (' / ')
 * - Preserves numbers and percentages semantically without modification
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeColor(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('#')) {
    return trimmed.toLowerCase();
  }

  const match = trimmed.match(/^([a-zA-Z]+)\s*\(([\s\S]*)\)$/);
  if (!match) {
    return trimmed.toLowerCase();
  }

  const fnName = match[1].toLowerCase();
  let args = match[2].trim();

  // Normalize spaces around commas to ', '
  args = args.replace(/\s*,\s*/g, ', ');
  // Normalize spaces around slashes to ' / '
  args = args.replace(/\s*\/\s*/g, ' / ');
  // Collapse multiple whitespaces into a single space
  args = args.replace(/\s+/g, ' ');

  return `${fnName}(${args})`;
}

/**
 * Strips comments from CSS string
 * @param {string} css
 * @returns {string}
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extracts all color literals, named colors, and :root custom properties from CSS content.
 *
 * @param {string} cssContent
 * @returns {{ colors: string[], namedColors: string[], rootCustomProperties: string[] }}
 */
export function extractColorsAndTokens(cssContent) {
  const clean = stripComments(cssContent);
  const colors = [];
  const namedColors = [];
  const rootCustomProperties = [];

  // 1. Extract custom properties declared specifically inside :root blocks
  const rootBlockRegex = /:root\b[^{]*\{([^}]*)\}/gi;
  let rootMatch;
  while ((rootMatch = rootBlockRegex.exec(clean)) !== null) {
    const blockContent = rootMatch[1];
    const customPropDeclRegex = /(--[a-zA-Z0-9_-]+)\s*:/g;
    let propMatch;
    while ((propMatch = customPropDeclRegex.exec(blockContent)) !== null) {
      rootCustomProperties.push(propMatch[1].trim());
    }
  }

  // 2. Strip url(...) calls to avoid false positives from URLs/fragments
  const withoutUrls = clean.replace(/url\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, '');

  // 3. Strip quoted strings ("..." and '...') to avoid false positives in content, font names, etc.
  const withoutStrings = withoutUrls.replace(/"[^"]*"|'[^']*'/g, '');

  // 4. Find color function invocations: rgb, rgba, hsl, hsla, hwb, lab, lch, oklab, oklch, color
  const colorFuncRegex = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi;
  const funcRanges = [];
  let funcMatch;

  while ((funcMatch = colorFuncRegex.exec(withoutStrings)) !== null) {
    const start = funcMatch.index;
    let openParens = 1;
    let idx = funcMatch.index + funcMatch[0].length;

    while (idx < withoutStrings.length && openParens > 0) {
      if (withoutStrings[idx] === '(') openParens++;
      else if (withoutStrings[idx] === ')') openParens--;
      idx++;
    }

    if (openParens === 0) {
      const fullCall = withoutStrings.slice(start, idx);
      colors.push(normalizeColor(fullCall));
      funcRanges.push([start, idx]);
    }
  }

  // Blank out matched function calls so internal hex is not double-scanned
  let cssForDeclarations = '';
  let lastIdx = 0;
  for (const [start, end] of funcRanges) {
    cssForDeclarations += withoutStrings.slice(lastIdx, start) + ' '.repeat(end - start);
    lastIdx = end;
  }
  cssForDeclarations += withoutStrings.slice(lastIdx);

  // 5. Scan declaration values for:
  //    a) Hex color literals (from cssForDeclarations)
  //    b) Named color keywords (from withoutStrings, including inside functions like color-mix)
  //
  // A CSS declaration format: property-name : declaration-value [;}]
  const declRegexHex = /(?:^|[;{}])\s*([a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g;
  const hexRegex = /(?<=[\s,(:;]|^)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

  let declMatch;
  while ((declMatch = declRegexHex.exec(cssForDeclarations)) !== null) {
    const declValue = declMatch[2];
    let hexMatch;
    while ((hexMatch = hexRegex.exec(declValue)) !== null) {
      colors.push(normalizeColor(hexMatch[0]));
    }
  }

  // Scan declaration values in withoutStrings for named color keywords
  const declRegexNamed = /(?:^|[;{}])\s*([a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g;
  while ((declMatch = declRegexNamed.exec(withoutStrings)) !== null) {
    const declValue = declMatch[2];
    for (const kw of CSS_NAMED_COLORS) {
      // Must not be preceded or followed by CSS identifier characters ([a-zA-Z0-9_-])
      // This prevents matching --red, var(--red), white-space, border-color, etc.
      const kwRegex = new RegExp(`(?<![a-zA-Z0-9_-])${kw}(?![a-zA-Z0-9_-])`, 'gi');
      if (kwRegex.test(declValue)) {
        namedColors.push(kw.toLowerCase());
      }
    }
  }

  return {
    colors: Array.from(new Set(colors)).sort((a, b) => a.localeCompare(b, 'en')),
    namedColors: Array.from(new Set(namedColors)).sort((a, b) => a.localeCompare(b, 'en')),
    rootCustomProperties: Array.from(new Set(rootCustomProperties)).sort((a, b) => a.localeCompare(b, 'en'))
  };
}

/**
 * Recursively finds all .css files under rootDir.
 * Returns normalized forward-slash paths sorted deterministically.
 *
 * @param {string} rootDir
 * @returns {string[]}
 */
export function findCssFiles(rootDir) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.css')) {
        results.push(fullPath.replace(/\\/g, '/'));
      }
    }
  }

  walk(rootDir);
  return results.sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Validates CSS contents against the versioned contract.
 *
 * @param {Record<string, string>} filesMap Path -> CSS content
 * @param {{ allowedColors?: string[], colors?: string[], allowedNamedColors?: string[], namedColors?: string[], allowedRootCustomProperties?: string[], allowedRootTokens?: string[] }} contract
 * @returns {{ valid: boolean, errors: Array<{ file: string, type: 'color'|'named-color'|'root-token', value: string, message: string }> }}
 */
export function validateCssAgainstContract(filesMap, contract) {
  const allowedColors = new Set(contract.allowedColors || contract.colors || []);
  const allowedNamedColors = new Set(contract.allowedNamedColors || contract.namedColors || []);
  const allowedRootProps = new Set(
    contract.allowedRootCustomProperties ||
    contract.allowedRootTokens ||
    contract.allowedRootProperties ||
    contract.rootCustomProperties ||
    contract.rootTokens ||
    []
  );

  const errors = [];

  for (const [filePath, content] of Object.entries(filesMap)) {
    const { colors, namedColors, rootCustomProperties } = extractColorsAndTokens(content);

    for (const color of colors) {
      if (!allowedColors.has(color)) {
        errors.push({
          file: filePath,
          type: 'color',
          value: color,
          message: `Unapproved color literal "${color}" found in ${filePath}`
        });
      }
    }

    for (const named of namedColors) {
      if (!allowedNamedColors.has(named)) {
        errors.push({
          file: filePath,
          type: 'named-color',
          value: named,
          message: `Unapproved named color "${named}" found in ${filePath}`
        });
      }
    }

    for (const prop of rootCustomProperties) {
      if (!allowedRootProps.has(prop)) {
        errors.push({
          file: filePath,
          type: 'root-token',
          value: prop,
          message: `Unapproved :root custom property "${prop}" declared in ${filePath}`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generates deterministic baseline contract from CSS files map.
 *
 * @param {Record<string, string>} filesMap
 * @returns {{ allowedColors: string[], allowedNamedColors: string[], allowedRootCustomProperties: string[] }}
 */
export function generateBaseline(filesMap) {
  const colorsSet = new Set();
  const namedColorsSet = new Set();
  const rootPropsSet = new Set();

  for (const content of Object.values(filesMap)) {
    const { colors, namedColors, rootCustomProperties } = extractColorsAndTokens(content);
    for (const c of colors) colorsSet.add(c);
    for (const n of namedColors) namedColorsSet.add(n);
    for (const p of rootCustomProperties) rootPropsSet.add(p);
  }

  return {
    allowedColors: Array.from(colorsSet).sort((a, b) => a.localeCompare(b, 'en')),
    allowedNamedColors: Array.from(namedColorsSet).sort((a, b) => a.localeCompare(b, 'en')),
    allowedRootCustomProperties: Array.from(rootPropsSet).sort((a, b) => a.localeCompare(b, 'en'))
  };
}

/**
 * CLI execution handler
 *
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runCli(argv = process.argv.slice(2)) {
  const isGenerate = argv.includes('--generate') || argv.includes('--write');

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(scriptDir, '..');
  const defaultSrcDir = path.join(frontendDir, 'src');
  const defaultContractPath = path.join(frontendDir, 'css-color-contract.json');

  const nonFlagArgs = argv.filter(arg => !arg.startsWith('--'));
  const srcDir = nonFlagArgs[0] ? path.resolve(process.cwd(), nonFlagArgs[0]) : defaultSrcDir;
  const contractPath = nonFlagArgs[1] ? path.resolve(process.cwd(), nonFlagArgs[1]) : defaultContractPath;

  // Validate that source path exists
  if (!fs.existsSync(srcDir)) {
    console.error(`[CSS Color Contract] Error: Source path does not exist: "${srcDir}"`);
    return 1;
  }

  // Validate that source path is a directory
  let stat;
  try {
    stat = fs.statSync(srcDir);
  } catch (err) {
    console.error(`[CSS Color Contract] Error: Cannot access source directory "${srcDir}": ${err.message}`);
    return 1;
  }

  if (!stat.isDirectory()) {
    console.error(`[CSS Color Contract] Error: Source path is not a directory: "${srcDir}"`);
    return 1;
  }

  // Find all CSS files
  let cssFiles;
  try {
    cssFiles = findCssFiles(srcDir);
  } catch (err) {
    console.error(`[CSS Color Contract] Error: Cannot read source directory "${srcDir}": ${err.message}`);
    return 1;
  }

  // Must fail if 0 CSS files are found
  if (cssFiles.length === 0) {
    console.error(`[CSS Color Contract] Error: No CSS files found in "${srcDir}". Expected at least one CSS file.`);
    return 1;
  }

  const filesMap = {};
  for (const file of cssFiles) {
    const relativeKey = path.relative(frontendDir, file).replace(/\\/g, '/');
    filesMap[relativeKey] = fs.readFileSync(file, 'utf8');
  }

  if (isGenerate) {
    const baseline = generateBaseline(filesMap);
    fs.writeFileSync(contractPath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
    const displayContract = path.relative(process.cwd(), contractPath).replace(/\\/g, '/');
    console.log(`[CSS Color Contract] Baseline generated successfully at ${displayContract}`);
    console.log(`- Allowed colors: ${baseline.allowedColors.length}`);
    console.log(`- Allowed named colors: ${baseline.allowedNamedColors.length}`);
    console.log(`- Allowed :root properties: ${baseline.allowedRootCustomProperties.length}`);
    return 0;
  }

  if (!fs.existsSync(contractPath)) {
    console.error(`[CSS Color Contract] Error: Contract file not found at ${contractPath}. Run with --generate first.`);
    return 1;
  }

  let contract;
  try {
    contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  } catch (err) {
    console.error(`[CSS Color Contract] Error parsing JSON contract at ${contractPath}:`, err.message);
    return 1;
  }

  const { valid, errors } = validateCssAgainstContract(filesMap, contract);

  if (!valid) {
    console.error(`[CSS Color Contract] FAILED: ${errors.length} violation(s) detected:`);
    for (const err of errors) {
      console.error(`  - ${err.file}: [${err.type}] ${err.value} (${err.message})`);
    }
    return 1;
  }

  console.log(`[CSS Color Contract] PASSED: ${cssFiles.length} CSS file(s) checked, 0 violations.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().then(code => {
    process.exit(code);
  }).catch(err => {
    console.error('[CSS Color Contract] Fatal execution error:', err);
    process.exit(1);
  });
}
