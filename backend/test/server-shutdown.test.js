const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");

const { registerShutdownHandlers } = require("../src/core/lifecycle/shutdown");

test("importar server no registra handlers globales", () => {
  const before = [
    process.listenerCount("SIGTERM"),
    process.listenerCount("SIGINT"),
  ];
  require("../server");
  assert.deepStrictEqual(
    [process.listenerCount("SIGTERM"), process.listenerCount("SIGINT")],
    before,
  );
});

test("Server shutdown tests", async (t) => {
  const createFakes = () => {
    const processRef = new EventEmitter();
    const server = new EventEmitter();

    server.close = (cb) => {
      server.closeCalled = (server.closeCalled || 0) + 1;
      server.closeCb = cb;
    };
    server.closeAllConnections = () => {
      server.closeAllConnectionsCalled =
        (server.closeAllConnectionsCalled || 0) + 1;
    };

    const logger = {
      errors: [],
      infos: [],
      error: (...args) => logger.errors.push(args),
      info: (...args) => logger.infos.push(args),
    };

    const state = {
      closeDatabaseCalled: 0,
      exitCalled: 0,
      exitCode: null,
      closeDatabaseResolve: null,
      closeDatabaseReject: null,
    };

    const closeDatabase = () => {
      state.closeDatabaseCalled++;
      return new Promise((resolve, reject) => {
        state.closeDatabaseResolve = resolve;
        state.closeDatabaseReject = reject;
      });
    };

    const exit = (code) => {
      state.exitCalled++;
      state.exitCode = code;
    };

    return { processRef, server, logger, closeDatabase, exit, state };
  };

  await t.test(
    "SIGTERM: server.close callback debe ocurrir antes de closeDatabase, exit(0) después",
    async () => {
      const { processRef, server, logger, closeDatabase, exit, state } =
        createFakes();

      registerShutdownHandlers({
        server,
        closeDatabase,
        processRef,
        logger,
        exit,
        timeoutMs: 1000,
      });

      processRef.emit("SIGTERM");

      assert.strictEqual(server.closeCalled, 1, "Llama a server.close");
      assert.strictEqual(
        state.closeDatabaseCalled,
        0,
        "No llama a closeDatabase todavía",
      );
      assert.strictEqual(state.exitCalled, 0, "No llama a exit todavía");

      // Invocar callback de server.close
      server.closeCb();
      await new Promise(setImmediate);

      assert.strictEqual(
        state.closeDatabaseCalled,
        1,
        "Llama a closeDatabase tras callback de server.close",
      );
      assert.strictEqual(state.exitCalled, 0, "No llama a exit todavía");

      // Resolver closeDatabase
      state.closeDatabaseResolve();
      await new Promise(setImmediate);

      assert.strictEqual(
        state.exitCalled,
        1,
        "Llama a exit tras resolver database",
      );
      assert.strictEqual(state.exitCode, 0, "exit(0) cuando todo sale bien");
      assert.deepStrictEqual(logger.infos, [
        ["server_shutdown_success", "none"],
      ]);
    },
  );

  await t.test(
    "SIGTERM + SIGINT concurrentes no duplican close/end",
    async () => {
      const { processRef, server, logger, closeDatabase, exit, state } =
        createFakes();

      registerShutdownHandlers({
        server,
        closeDatabase,
        processRef,
        logger,
        exit,
        timeoutMs: 1000,
      });

      processRef.emit("SIGTERM");
      processRef.emit("SIGINT");

      assert.strictEqual(server.closeCalled, 1, "No duplica server.close");

      server.closeCb();
      await new Promise(setImmediate);

      assert.strictEqual(
        state.closeDatabaseCalled,
        1,
        "No duplica closeDatabase",
      );

      state.closeDatabaseResolve();
      await new Promise(setImmediate);

      assert.strictEqual(state.exitCalled, 1, "No duplica exit");
    },
  );

  await t.test(
    "callback error y closeDatabase error registran evento/código fijo sin Error crudo y exit(1)",
    async () => {
      const { processRef, server, logger, closeDatabase, exit, state } =
        createFakes();

      registerShutdownHandlers({
        server,
        closeDatabase,
        processRef,
        logger,
        exit,
        timeoutMs: 1000,
      });

      processRef.emit("SIGTERM");

      // server.close callback con un Error crudo
      const serverErr = new Error("Raw server close error");
      server.closeCb(serverErr);
      await new Promise(setImmediate);

      assert.strictEqual(
        state.closeDatabaseCalled,
        1,
        "Sigue llamando a closeDatabase a pesar de error en server",
      );

      // closeDatabase reject con un Error crudo
      const dbErr = new Error("Raw db close error");
      state.closeDatabaseReject(dbErr);
      await new Promise(setImmediate);

      assert.strictEqual(state.exitCalled, 1, "Llama a exit");
      assert.strictEqual(
        state.exitCode,
        1,
        "exit(1) por haber ocurrido un error",
      );

      // Comprobar que los errores crudos no se registren en el log (evitar fugas de información)
      assert.deepStrictEqual(logger.errors, [
        ["server_shutdown_failed", "shutdown_error"],
      ]);
      const logsStr = JSON.stringify(logger.errors);
      assert.ok(
        !logsStr.includes("Raw server close error"),
        "No debe loguear error crudo de server",
      );
      assert.ok(
        !logsStr.includes("Raw db close error"),
        "No debe loguear error crudo de db",
      );
    },
  );

  await t.test(
    "error solo en server.close también finaliza 1 tras cerrar DB",
    async () => {
      const { processRef, server, logger, closeDatabase, exit, state } =
        createFakes();
      registerShutdownHandlers({
        server,
        closeDatabase,
        processRef,
        logger,
        exit,
        timeoutMs: 1000,
      });
      processRef.emit("SIGINT");
      server.closeCb(new Error("private socket details"));
      await new Promise(setImmediate);
      state.closeDatabaseResolve();
      await new Promise(setImmediate);
      assert.strictEqual(state.exitCode, 1);
      assert.deepStrictEqual(logger.errors, [
        ["server_shutdown_failed", "shutdown_error"],
      ]);
    },
  );

  await t.test(
    "timeout corto llama closeAllConnections después de server.close y exit(1), no llama closeDatabase",
    async () => {
      const { processRef, server, logger, closeDatabase, exit, state } =
        createFakes();

      registerShutdownHandlers({
        server,
        closeDatabase,
        processRef,
        logger,
        exit,
        timeoutMs: 20,
      });

      processRef.emit("SIGTERM");

      assert.strictEqual(server.closeCalled, 1, "Comenzó server.close");

      // Esperar al timeout
      await new Promise((resolve) => setTimeout(resolve, 30));

      assert.strictEqual(
        server.closeAllConnectionsCalled,
        1,
        "Llama a closeAllConnections tras timeout",
      );
      assert.strictEqual(
        state.closeDatabaseCalled,
        0,
        "No llama a closeDatabase debido al timeout",
      );
      assert.strictEqual(state.exitCalled, 1, "Llama a exit por timeout");
      assert.strictEqual(state.exitCode, 1, "exit(1) por timeout");
      assert.deepStrictEqual(logger.errors, [
        ["server_shutdown_failed", "shutdown_error"],
      ]);
    },
  );
});
