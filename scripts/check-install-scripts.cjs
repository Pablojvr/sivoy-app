'use strict';

const fs = require('node:fs');
const path = require('node:path');

const INSTALL_SCRIPT_POLICY = Object.freeze({
  backend: Object.freeze({
    'node_modules/sqlite3': '6.0.1',
  }),
  frontend: Object.freeze({
    'node_modules/@parcel/watcher': '2.6.0',
    'node_modules/esbuild': '0.28.1',
    'node_modules/fsevents': '2.3.3',
    'node_modules/lmdb': '3.5.1',
    'node_modules/msgpackr-extract': '3.0.4',
  }),
});

function validateResolvedArtifact(packagePath, metadata, errors) {
  if (packagePath === '') return;
  if (typeof metadata.resolved !== 'string' || metadata.resolved.length === 0) {
    errors.push(`${packagePath}: falta origen resuelto verificable`);
    return;
  }

  let resolved;
  try {
    resolved = new URL(metadata.resolved);
  } catch {
    errors.push(`${packagePath}: resolved no es una URL valida`);
    return;
  }

  if (
    resolved.protocol !== 'https:' ||
    resolved.hostname !== 'registry.npmjs.org' ||
    resolved.port !== '' ||
    resolved.username !== '' ||
    resolved.password !== ''
  ) {
    errors.push(`${packagePath}: origen no permitido ${resolved.origin}`);
  }

  if (
    typeof metadata.integrity !== 'string' ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(metadata.integrity)
  ) {
    errors.push(`${packagePath}: falta integridad SHA-512`);
  }
}

function inspectLockfile(lockfile, project) {
  const expected = INSTALL_SCRIPT_POLICY[project];
  if (!expected) {
    return [`Proyecto desconocido: ${project}`];
  }

  const errors = [];
  if (lockfile.lockfileVersion !== 3) {
    errors.push(`lockfileVersion debe ser 3, recibido ${lockfile.lockfileVersion}`);
  }

  const packages = lockfile.packages;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
    return [...errors, 'El lockfile no contiene un mapa packages valido'];
  }

  const observed = new Map();
  for (const [packagePath, metadata] of Object.entries(packages)) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      errors.push(`${packagePath || '<root>'}: metadata de paquete invalida`);
      continue;
    }
    validateResolvedArtifact(packagePath, metadata, errors);
    if (
      Object.hasOwn(metadata, 'hasInstallScript') &&
      typeof metadata.hasInstallScript !== 'boolean'
    ) {
      errors.push(`${packagePath}: hasInstallScript debe ser booleano`);
      continue;
    }
    if (metadata.hasInstallScript === true) {
      observed.set(packagePath, metadata.version);
    }
  }

  for (const [packagePath, version] of observed) {
    if (!Object.hasOwn(expected, packagePath)) {
      errors.push(`${packagePath}@${version}: script de instalacion no revisado`);
    } else if (expected[packagePath] !== version) {
      errors.push(
        `${packagePath}: version con script ${version} no coincide con ${expected[packagePath]}`,
      );
    }
  }

  for (const [packagePath, version] of Object.entries(expected)) {
    if (!observed.has(packagePath)) {
      errors.push(`${packagePath}@${version}: entrada esperada ausente`);
    }
  }

  return errors;
}

function checkLockfile(lockfilePath, project) {
  const absolutePath = path.resolve(lockfilePath);
  const lockfile = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const errors = inspectLockfile(lockfile, project);
  if (errors.length > 0) {
    throw new Error(`Politica npm rechazada para ${project}:\n- ${errors.join('\n- ')}`);
  }
  return { project, lockfilePath: absolutePath };
}

function main(argv = process.argv.slice(2)) {
  const [lockfilePath, project] = argv;
  if (!lockfilePath || !project || argv.length !== 2) {
    throw new Error('Uso: node check-install-scripts.cjs <package-lock.json> <backend|frontend>');
  }
  const result = checkLockfile(lockfilePath, project);
  process.stdout.write(`Politica npm verificada: ${result.project}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  INSTALL_SCRIPT_POLICY,
  checkLockfile,
  inspectLockfile,
  main,
};
