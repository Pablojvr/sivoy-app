'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  INSTALL_SCRIPT_POLICY,
  checkLockfile,
  inspectLockfile,
} = require('./check-install-scripts.cjs');

function lockfileFor(project) {
  const packages = { '': {} };
  for (const [packagePath, version] of Object.entries(INSTALL_SCRIPT_POLICY[project])) {
    packages[packagePath] = {
      version,
      resolved: `https://registry.npmjs.org/example/-/example-${version}.tgz`,
      integrity: 'sha512-fixture',
      hasInstallScript: true,
    };
  }
  return { lockfileVersion: 3, packages };
}

function firstApprovedPackage(project) {
  return Object.keys(INSTALL_SCRIPT_POLICY[project])[0];
}

test('acepta los dos lockfiles reales del repositorio', () => {
  const root = path.resolve(__dirname, '..');
  assert.doesNotThrow(() => checkLockfile(path.join(root, 'backend/package-lock.json'), 'backend'));
  assert.doesNotThrow(() => checkLockfile(path.join(root, 'frontend/package-lock.json'), 'frontend'));
});

test('rechaza scripts nuevos, faltantes o con otra version', () => {
  for (const project of ['backend', 'frontend']) {
    const approvedPackage = firstApprovedPackage(project);
    const extra = lockfileFor(project);
    extra.packages['node_modules/unreviewed'] = {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/unreviewed/-/unreviewed-1.0.0.tgz',
      integrity: 'sha512-Zml4dHVyZQ==',
      hasInstallScript: true,
    };
    assert.match(inspectLockfile(extra, project).join('\n'), /no revisado/);

    const missing = lockfileFor(project);
    delete missing.packages[approvedPackage];
    assert.match(inspectLockfile(missing, project).join('\n'), /entrada esperada ausente/);

    const changed = lockfileFor(project);
    changed.packages[approvedPackage].version = '999.0.0';
    assert.match(inspectLockfile(changed, project).join('\n'), /no coincide/);
  }
});

test('rechaza fuentes externas, HTTP, credenciales e integridad distinta de SHA-512', () => {
  for (const project of ['backend', 'frontend']) {
    const approvedPackage = firstApprovedPackage(project);
    const external = lockfileFor(project);
    external.packages[approvedPackage].resolved = 'https://packages.example/package.tgz';
    assert.match(inspectLockfile(external, project).join('\n'), /origen no permitido/);

    const insecure = lockfileFor(project);
    insecure.packages[approvedPackage].resolved = 'http://registry.npmjs.org/package.tgz';
    assert.match(inspectLockfile(insecure, project).join('\n'), /origen no permitido/);

    const customPort = lockfileFor(project);
    customPort.packages[approvedPackage].resolved =
      'https://registry.npmjs.org:8443/package.tgz';
    assert.match(inspectLockfile(customPort, project).join('\n'), /origen no permitido/);

    for (const integrity of [undefined, '', 'sha1-fixture', 'sha512-']) {
      const invalidIntegrity = lockfileFor(project);
      invalidIntegrity.packages[approvedPackage].integrity = integrity;
      assert.match(inspectLockfile(invalidIntegrity, project).join('\n'), /integridad SHA-512/);
    }

    const credentials = lockfileFor(project);
    credentials.packages[approvedPackage].resolved =
      'https://user:secret@registry.npmjs.org/package.tgz';
    assert.match(inspectLockfile(credentials, project).join('\n'), /origen no permitido/);

    const missingOrigin = lockfileFor(project);
    delete missingOrigin.packages[approvedPackage].resolved;
    assert.match(inspectLockfile(missingOrigin, project).join('\n'), /falta origen resuelto/);
  }
});

test('rechaza metadata malformada y paquetes regulares sin procedencia', () => {
  for (const project of ['backend', 'frontend']) {
    const malformed = lockfileFor(project);
    malformed.packages['node_modules/malformed'] = null;
    assert.match(inspectLockfile(malformed, project).join('\n'), /metadata de paquete invalida/);

    const nonBooleanScript = lockfileFor(project);
    nonBooleanScript.packages['node_modules/unreviewed'] = {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/unreviewed/-/unreviewed-1.0.0.tgz',
      integrity: 'sha512-Zml4dHVyZQ==',
      hasInstallScript: 'true',
    };
    assert.match(inspectLockfile(nonBooleanScript, project).join('\n'), /debe ser booleano/);

    const missingOrigin = lockfileFor(project);
    missingOrigin.packages['node_modules/regular'] = {
      version: '1.0.0',
      integrity: 'sha512-Zml4dHVyZQ==',
    };
    assert.match(inspectLockfile(missingOrigin, project).join('\n'), /falta origen resuelto/);
  }
});

test('rechaza proyecto, formato o argumentos desconocidos', () => {
  assert.deepEqual(inspectLockfile({}, 'otro'), ['Proyecto desconocido: otro']);
  assert.match(inspectLockfile({ lockfileVersion: 2 }, 'backend').join('\n'), /lockfileVersion/);
  assert.throws(
    () => require('./check-install-scripts.cjs').main([]),
    /Uso:/,
  );
});
