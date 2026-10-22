'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const { apiErrorHandler } = require('../src/core/http/http-security');
const defaultUpload = require('../src/config/upload');
const { createUpload } = defaultUpload;

test('upload acepta una imagen raster válida y rechaza tamaño, tipo y campo inválidos', async (context) => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-upload-'));
  const upload = createUpload({
    destination,
    env: { UPLOAD_MAX_FILE_SIZE_BYTES: '65536' }
  });
  const app = express();
  app.post('/upload', upload.single('logo'), (req, res) => {
    res.status(200).json({ filename: req.file.filename });
  });
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(destination, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const valid = await sendFile(baseUrl, 'logo', 'logo.png', 'image/png', new Uint8Array([137, 80, 78, 71]));
  assert.equal(valid.status, 200);
  assert.match((await valid.json()).filename, /^[0-9]+-[a-f0-9]{16}\.png$/);

  const tooLarge = await sendFile(
    baseUrl,
    'logo',
    'large.png',
    'image/png',
    new Uint8Array(65537)
  );
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { error: 'Upload too large' });

  const unsupported = await sendFile(baseUrl, 'logo', 'payload.html', 'text/html', '<script>1</script>');
  assert.equal(unsupported.status, 415);
  assert.deepEqual(await unsupported.json(), { error: 'Unsupported media type' });

  const spoofed = await sendFile(baseUrl, 'logo', 'payload.png', 'text/html', '<script>1</script>');
  assert.equal(spoofed.status, 415);

  const unexpected = await sendFile(baseUrl, 'avatar', 'logo.png', 'image/png', new Uint8Array([137, 80, 78, 71]));
  assert.equal(unexpected.status, 400);
  assert.deepEqual(await unexpected.json(), { error: 'Invalid upload request' });

  const malformed = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=sivoy' },
    body: '--sivoy\r\nContent-Disposition: form-data; name="logo"; filename="logo.png"\r\n'
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Invalid upload request' });
});

test('rutas reales eliminan el archivo si negocio falla y producción bloquea antes de Multer', async (context) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  console.error = () => {};
  process.env.NODE_ENV = 'development';
  const uploadDirectory = path.join(__dirname, '..', '..', 'public', 'uploads');
  const { app } = require('../server');
  const server = app.listen(0, '127.0.0.1');
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    console.error = originalConsoleError;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/empresas`;
  const before = listFiles(uploadDirectory);

  const rejectedByBusiness = await sendFile(
    endpoint,
    'logo',
    'logo.png',
    'image/png',
    new Uint8Array([137, 80, 78, 71]),
    true
  );
  assert.equal(rejectedByBusiness.status, 400);
  await waitFor(() => assert.deepEqual(listFiles(uploadDirectory), before));

  process.env.NODE_ENV = 'production';
  const blocked = await sendFile(
    endpoint,
    'logo',
    'logo.png',
    'image/png',
    new Uint8Array([137, 80, 78, 71]),
    true
  );
  assert.equal(blocked.status, 403);
  assert.deepEqual(await blocked.json(), { error: 'Operational writes are disabled' });
  assert.deepEqual(listFiles(uploadDirectory), before);
});

test('upload usa límites seguros ante overrides inválidos y acota overrides válidos', () => {
  const captured = [];
  const fakeMulter = (options) => {
    captured.push(options);
    return { single: () => {} };
  };
  fakeMulter.diskStorage = (options) => options;

  createUpload({ env: { UPLOAD_MAX_FILE_SIZE_BYTES: '1' }, multerFactory: fakeMulter });
  createUpload({ env: { UPLOAD_MAX_FILE_SIZE_BYTES: '10485760' }, multerFactory: fakeMulter });

  assert.equal(captured[0].limits.fileSize, 2097152);
  assert.equal(captured[1].limits.fileSize, 10485760);
  assert.deepEqual(captured[0].limits, {
    fileSize: 2097152,
    files: 1,
    fields: 10,
    fieldSize: 65536,
    parts: 12,
    fieldNameSize: 100,
    headerPairs: 50
  });
});

async function sendFile(baseUrl, field, filename, type, content, absoluteUrl = false) {
  const form = new FormData();
  form.append(field, new Blob([content], { type }), filename);
  return fetch(absoluteUrl ? baseUrl : `${baseUrl}/upload`, { method: 'POST', body: form });
}

function listFiles(directory) {
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
}

async function waitFor(assertion, timeoutMs = 1000) {
  const started = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - started >= timeoutMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
