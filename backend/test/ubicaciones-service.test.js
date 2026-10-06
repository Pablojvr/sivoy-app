const test = require('node:test');
const assert = require('node:assert/strict');

test('Ubicaciones Service', async (t) => {
    const ubicacionesService = require('../src/domains/ubicaciones/ubicaciones.service');

    await t.test('exports createUbicacionesService and legacy functions', () => {
        assert.strictEqual(typeof ubicacionesService.createUbicacionesService, 'function');
        assert.strictEqual(typeof ubicacionesService.getAllLocations, 'function');
        assert.strictEqual(typeof ubicacionesService.getLocationByName, 'function');
        assert.strictEqual(typeof ubicacionesService.updateLocation, 'function');
        assert.strictEqual(typeof ubicacionesService.createAgencia, 'function');
    });

    await t.test('createUbicacionesService validates options and dependencies', () => {
        assert.throws(() => ubicacionesService.createUbicacionesService(), /Missing options/);
        assert.throws(() => ubicacionesService.createUbicacionesService({}), /Missing repo/);
        assert.throws(() => ubicacionesService.createUbicacionesService({ repo: {} }), /Missing cloudinary/);
        assert.throws(() => ubicacionesService.createUbicacionesService({ repo: {}, cloudinary: {} }), /Missing logger/);
        assert.throws(() => ubicacionesService.createUbicacionesService({ repo: {}, cloudinary: {}, logger: {} }), /logger\.warn is not a function/);
        assert.throws(() => ubicacionesService.createUbicacionesService({ repo: {}, cloudinary: {}, logger: { warn: () => {} } }), /Missing env/);
        assert.throws(() => ubicacionesService.createUbicacionesService({ repo: {}, cloudinary: {}, logger: { warn: () => {} }, env: {} }), /idClock is not a function/);
    });

    await t.test('importing/creating runtime does not call DB/network', () => {
        let called = false;
        const dummyRepo = new Proxy({}, { get: () => { called = true; return () => {}; } });
        const dummyCloudinary = new Proxy({}, { get: () => { called = true; return () => {}; } });
        
        ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: dummyCloudinary,
            logger: { warn: () => {}, error: () => {}, info: () => {} },
            env: {},
            idClock: () => 1
        });
        
        assert.strictEqual(called, false);
    });

    await t.test('updateLocation throws if location not found', async () => {
        const dummyRepo = {
            updateLocation: async () => null // not found
        };
        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        
        await assert.rejects(svc.updateLocation('loc1', { nombre_destino: 'test' }), /Location not found/);
    });

    await t.test('updateLocation throws if repo.updateLocation is missing', async () => {
        const svc = ubicacionesService.createUbicacionesService({
            repo: {}, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        
        await assert.rejects(svc.updateLocation('loc1', {}), /repo.updateLocation is not a function/);
    });
    
    await t.test('getAllLocations throws if repo.getAllLocations is missing', async () => {
        const svc = ubicacionesService.createUbicacionesService({
            repo: {}, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        
        await assert.rejects(svc.getAllLocations(), /repo.getAllLocations is not a function/);
    });

    await t.test('getLocationByName throws if repo.getLocationByName is missing', async () => {
        const svc = ubicacionesService.createUbicacionesService({
            repo: {}, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        
        await assert.rejects(svc.getLocationByName('x'), /repo.getLocationByName is not a function/);
    });

    await t.test('createAgencia throws if repo.getEmpresaNameById is missing', async () => {
        const svc = ubicacionesService.createUbicacionesService({
            repo: { createAgencia: async () => {} }, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        
        await assert.rejects(svc.createAgencia({nombre_destino: 'a', empresa_id: '1', tipo: 'b'}), /repo.getEmpresaNameById is not a function/);
    });

    await t.test('createAgencia throws if repo.createAgencia is missing', async () => {
        const svc = ubicacionesService.createUbicacionesService({
            repo: { getEmpresaNameById: async () => {} }, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        
        await assert.rejects(svc.createAgencia({nombre_destino: 'a', empresa_id: '1', tipo: 'b'}), /repo.createAgencia is not a function/);
    });

    await t.test('updateLocation validates cloudinary.uploader.upload exists before uploading', async () => {
        const dummyRepo = { updateLocation: async () => true };
        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo, cloudinary: {}, logger: { warn: () => {} }, env: { CLOUDINARY_URL: 'yes' }, idClock: () => 1
        });
        
        await assert.rejects(svc.updateLocation('loc1', { imagen_referencia: 'data:image/png;base64,123' }), /cloudinary.uploader.upload is not a function/);
    });
    
    await t.test('createAgencia validates cloudinary.uploader.upload exists before uploading', async () => {
        const dummyRepo = { getEmpresaNameById: async () => 'emp', createAgencia: async () => {} };
        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo, cloudinary: {}, logger: { warn: () => {} }, env: { CLOUDINARY_URL: 'yes' }, idClock: () => 1
        });
        
        await assert.rejects(svc.createAgencia({ nombre_destino: 'x', empresa_id: '1', tipo: 'y', imagen_referencia: 'data:image/png;base64,123' }), /cloudinary.uploader.upload is not a function/);
    });

    await t.test('Isolation: process.env has CLOUDINARY_URL but injected env does not -> no upload and warning', async (t) => {
        const originalEnv = process.env.CLOUDINARY_URL;
        process.env.CLOUDINARY_URL = 'global-yes';
        
        t.after(() => {
            if (originalEnv === undefined) delete process.env.CLOUDINARY_URL;
            else process.env.CLOUDINARY_URL = originalEnv;
        });

        let loggedEvent, loggedCode;
        let updateChanges;
        const dummyRepo = {
            updateLocation: async (id, changes) => {
                updateChanges = changes;
                return true;
            }
        };
        const dummyLogger = {
            warn: (event, code) => {
                loggedEvent = event;
                loggedCode = code;
            }
        };
        const dummyEnv = {}; // Injected env has no CLOUDINARY_URL

        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: { uploader: { upload: async () => { throw new Error('Should not call upload'); } } },
            logger: dummyLogger,
            env: dummyEnv,
            idClock: () => 123
        });

        const res = await svc.updateLocation('loc1', { imagen_referencia: 'data:image/png;base64,123' });
        assert.strictEqual(res, true);
        assert.strictEqual(loggedEvent, 'cloudinary_config_missing');
        assert.strictEqual(loggedCode, 'configuration_missing');
        assert.strictEqual(updateChanges.imagen_referencia, 'data:image/png;base64,123'); // Should preserve raw base64
    });

    await t.test('Isolation: process.env lacks value but injected env has it -> upload', async (t) => {
        const originalEnv = process.env.CLOUDINARY_URL;
        delete process.env.CLOUDINARY_URL; // process.env lacks value
        
        t.after(() => {
            if (originalEnv !== undefined) process.env.CLOUDINARY_URL = originalEnv;
        });

        let uploadedImage, uploadOptions, updateChanges;
        const dummyRepo = {
            updateLocation: async (id, changes) => {
                updateChanges = changes;
                return true;
            }
        };
        const dummyCloudinary = {
            uploader: {
                upload: async (img, opts) => {
                    uploadedImage = img;
                    uploadOptions = opts;
                    return { secure_url: 'https://secure.url/image2.png' };
                }
            }
        };
        const dummyEnv = { CLOUDINARY_URL: 'local-yes' }; // injected has value

        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: dummyCloudinary,
            logger: { warn: () => {} },
            env: dummyEnv,
            idClock: () => 123
        });

        const res = await svc.updateLocation('loc1', { imagen_referencia: 'data:image/png;base64,123' });
        assert.strictEqual(res, true);
        assert.strictEqual(uploadedImage, 'data:image/png;base64,123');
        assert.deepStrictEqual(uploadOptions, { folder: 'sivoy_agencias' });
        assert.strictEqual(updateChanges.imagen_referencia, 'https://secure.url/image2.png');
    });

    await t.test('createAgencia upload success and exact repo arguments', async () => {
        let uploadedImage, uploadOptions, createdId, createdPayload;
        const dummyRepo = {
            getEmpresaNameById: async (id) => id + '-name',
            createAgencia: async (id, payload) => {
                createdId = id;
                createdPayload = payload;
            }
        };
        const dummyCloudinary = {
            uploader: {
                upload: async (img, opts) => {
                    uploadedImage = img;
                    uploadOptions = opts;
                    return { secure_url: 'https://secure.url/agencia.png' };
                }
            }
        };
        
        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: dummyCloudinary,
            logger: { warn: () => {} },
            env: { CLOUDINARY_URL: 'yes' },
            idClock: () => 999
        });

        const payload = {
            nombre_destino: 'Mi Agencia!',
            empresa_id: 'emp1',
            tipo: 'Agencia',
            departamento: 'Dep',
            municipio: 'Mun',
            direccion_referencia: 'Dir',
            maps_url: 'http',
            lat: 10,
            lng: 20,
            horarios: [{ day: 'Mon' }],
            imagen_referencia: 'data:image/png;base64,abc'
        };

        const id = await svc.createAgencia(payload);
        assert.strictEqual(id, 'mi_agencia__999');
        assert.strictEqual(createdId, 'mi_agencia__999');
        assert.strictEqual(uploadedImage, 'data:image/png;base64,abc');
        assert.deepStrictEqual(uploadOptions, { folder: 'sivoy_agencias' });
        assert.deepStrictEqual(createdPayload, {
            nombre_destino: 'Mi Agencia!',
            tipo: 'Agencia',
            empresa_id: 'emp1',
            empresaNombre: 'emp1-name',
            departamento: 'Dep',
            municipio: 'Mun',
            direccion_referencia: 'Dir',
            maps_url: 'http',
            lat: 10,
            lng: 20,
            imagen_referencia: 'https://secure.url/agencia.png',
            horariosArr: [{ day: 'Mon' }]
        });
    });

    await t.test('createAgencia invalid JSON logging and array parity', async () => {
        let loggedEvent, loggedCode, createdPayload;
        const dummyRepo = {
            getEmpresaNameById: async () => 'empresa1',
            createAgencia: async (id, payload) => {
                createdPayload = payload;
            }
        };
        const dummyLogger = {
            warn: (event, code) => {
                loggedEvent = event;
                loggedCode = code;
            }
        };

        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: {},
            logger: dummyLogger,
            env: {},
            idClock: () => 999
        });

        const payload = {
            nombre_destino: 'Destino2',
            empresa_id: 'emp1',
            tipo: 'Agencia',
            horarios: 'invalid-json'
        };

        await svc.createAgencia(payload);
        assert.strictEqual(loggedEvent, 'horarios_parse_failed');
        assert.strictEqual(loggedCode, 'invalid_schedule_data');
        assert.deepStrictEqual(createdPayload.horariosArr, []); // paridad
    });
    
    await t.test('logger failures do not alter service result', async () => {
        let createdPayload;
        const dummyRepo = {
            getEmpresaNameById: async () => 'empresa1',
            createAgencia: async (id, payload) => {
                createdPayload = payload;
            }
        };
        const dummyLogger = {
            warn: () => { throw new Error('Logger failure'); }
        };

        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: {},
            logger: dummyLogger,
            env: {},
            idClock: () => 111
        });

        const payload = {
            nombre_destino: 'Destino3',
            empresa_id: 'emp1',
            tipo: 'Agencia',
            horarios: 'invalid-json',
            imagen_referencia: 'data:image/png;base64,123'
        };

        const id = await svc.createAgencia(payload);
        assert.strictEqual(id, 'destino3_111');
        assert.deepStrictEqual(createdPayload.horariosArr, []);
        assert.strictEqual(createdPayload.imagen_referencia, 'data:image/png;base64,123');
    });

    await t.test('updateLocation complete payload preserves original and maps arguments exactly', async () => {
        let capturedArgs;
        const dummyRepo = {
            updateLocation: async (id, changes, horarios) => {
                capturedArgs = { id, changes, horarios };
                return { success: true, id };
            }
        };

        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo,
            cloudinary: {},
            logger: { warn: () => {} },
            env: {},
            idClock: () => 1
        });

        const originalPayload = {
            nombre_destino: 'nd',
            empresa: 'emp',
            tipo: 'tp',
            maps_url: 'http://maps',
            ubicacion: JSON.stringify({
                departamento: 'dep',
                municipio: 'mun',
                direccion_referencia: 'dir',
                lat: 10,
                lng: 20
            }),
            horarios: JSON.stringify([{ day: 'Monday' }]),
            imagen_referencia: 'https://images.com/img.png'
        };
        const payloadClone = JSON.parse(JSON.stringify(originalPayload));

        const result = await svc.updateLocation('loc_123', originalPayload);

        assert.deepStrictEqual(result, { success: true, id: 'loc_123' });

        assert.strictEqual(capturedArgs.id, 'loc_123');
        assert.deepStrictEqual(capturedArgs.changes, {
            nombre_destino: 'nd',
            empresa: 'emp',
            tipo: 'tp',
            maps_url: 'http://maps',
            departamento: 'dep',
            municipio: 'mun',
            direccion_referencia: 'dir',
            lat: 10,
            lng: 20,
            imagen_referencia: 'https://images.com/img.png'
        });
        assert.deepStrictEqual(capturedArgs.horarios, [{ day: 'Monday' }]);

        assert.deepStrictEqual(originalPayload, payloadClone);
    });

    await t.test('updateLocation handles empty horarios, omitted horarios, and normalizes empty maps_url to null', async () => {
        const calls = [];
        const dummyRepo = {
            updateLocation: async (id, changes, horarios) => {
                calls.push({ id, changes, horarios });
                return true;
            }
        };
        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });

        await svc.updateLocation('loc_1', { horarios: '[]', maps_url: '' });
        await svc.updateLocation('loc_2', { nombre_destino: 'nd' });

        assert.deepStrictEqual(calls[0].horarios, []);
        assert.strictEqual(calls[0].changes.maps_url, null);
        assert.strictEqual(calls[1].horarios, undefined);
        assert.strictEqual('maps_url' in calls[1].changes, false);
    });

    await t.test('getAllLocations and getLocationByName proxy properly', async () => {
        const dummyRepo = {
            getAllLocations: async () => ['loc1'],
            getLocationByName: async (name) => name + '-found'
        };
        const svc = ubicacionesService.createUbicacionesService({
            repo: dummyRepo, cloudinary: {}, logger: { warn: () => {} }, env: {}, idClock: () => 1
        });
        assert.deepStrictEqual(await svc.getAllLocations(), ['loc1']);
        assert.strictEqual(await svc.getLocationByName('test'), 'test-found');
    });
});
