const test = require("node:test");
const assert = require("node:assert");
const EventEmitter = require("node:events");
const {
  createMapsLinkResolver,
  isPublicIpv4,
} = require("../src/domains/mapas/maps-link-resolver");
const mapsService = require("../src/domains/mapas/mapas.service");

test("servicio público mantiene el contrato de coordenadas directas", async () => {
  assert.deepStrictEqual(
    await mapsService.resolveMapsLink(
      "https://maps.google.com/?q=13.6929,-89.2182",
    ),
    {
      lat: 13.6929,
      lng: -89.2182,
      resolvedUrl: "https://maps.google.com/?q=13.6929,-89.2182",
    },
  );
});

test("solo considera públicas las direcciones IPv4 globales", () => {
  for (const address of [
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.1.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
  ]) {
    assert.strictEqual(isPublicIpv4(address), false, address);
  }
  assert.strictEqual(isPublicIpv4("8.8.8.8"), true);
});

test("maps-link-resolver API tests", async (t) => {
  // Mock function factories
  function createFakeMocks() {
    let lookupCalled = false;
    let requestCalled = false;
    let requestCount = 0;
    let requestOptions = null;
    let lastUrl = null;
    const lookupHosts = [];

    const routeResponses = new Map();

    const lookup = async (host, options) => {
      lookupCalled = true;
      lookupHosts.push(host);
      if (
        host === "maps.app.goo.gl" ||
        host === "www.google.com" ||
        host === "maps.google.com"
      ) {
        return [{ address: "8.8.8.8", family: 4 }];
      }
      throw new Error(`ENOTFOUND ${host}`);
    };

    const request = (url, options, callback) => {
      requestCalled = true;
      requestCount++;
      requestOptions = options;
      lastUrl = typeof url === "string" ? url : url.href;

      const req = new EventEmitter();
      let aborted = false;

      req.end = () => {
        if (aborted) return;
        setTimeout(() => {
          if (aborted) return;
          const res = new EventEmitter();
          res.resume = () => {};
          res.destroy = () => {};

          let routeRes = routeResponses.get(lastUrl);
          if (!routeRes) {
            routeRes = { statusCode: 404, headers: {}, body: "" };
          }

          res.statusCode = routeRes.statusCode;
          res.headers = routeRes.headers || {};

          if (callback) callback(res);

          if (routeRes.body) {
            res.emit("data", Buffer.from(routeRes.body));
          }
          res.emit("end");
        }, 5);
      };

      req.destroy = () => {
        aborted = true;
      };

      return req;
    };

    const setRoute = (url, statusCode, headers, body) => {
      routeResponses.set(url, { statusCode, headers, body });
    };

    return {
      lookup,
      request,
      getLookupCalled: () => lookupCalled,
      getRequestCalled: () => requestCalled,
      getRequestCount: () => requestCount,
      getLookupHosts: () => lookupHosts,
      getRequestOptions: () => requestOptions,
      setRoute,
    };
  }

  await t.test(
    "URL directa de host malicioso con coords es rechazada sin lookup ni request",
    async () => {
      const mocks = createFakeMocks();
      const resolveMapsLink = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
        timeoutMs: 1000,
        maxRedirects: 3,
        maxBodyBytes: 1024,
      });

      await assert.rejects(() =>
        resolveMapsLink("https://malicious.com/maps/place/10.123,-80.456"),
      );
      assert.strictEqual(mocks.getLookupCalled(), false);
      assert.strictEqual(mocks.getRequestCalled(), false);
    },
  );

  await t.test(
    "URL Google con coordenadas no necesita DNS ni red",
    async () => {
      const mocks = createFakeMocks();
      const resolveMapsLink = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
      });
      assert.deepStrictEqual(
        await resolveMapsLink("https://maps.google.com/?q=13.6929,-89.2182"),
        {
          lat: 13.6929,
          lng: -89.2182,
          resolvedUrl: "https://maps.google.com/?q=13.6929,-89.2182",
        },
      );
      assert.strictEqual(mocks.getLookupCalled(), false);
      assert.strictEqual(mocks.getRequestCalled(), false);
    },
  );

  await t.test(
    "short Google permitido redirige a maps Google coords",
    async () => {
      const mocks = createFakeMocks();
      mocks.setRoute("https://maps.app.goo.gl/short", 302, {
        location: "https://www.google.com/maps/place/test/@10.123,-80.456,15z",
      });
      mocks.setRoute(
        "https://www.google.com/maps/place/test/@10.123,-80.456,15z",
        200,
        {},
        "<html><body>some random text</body></html>",
      );

      const resolveMapsLink = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
        timeoutMs: 1000,
        maxRedirects: 3,
        maxBodyBytes: 1024,
      });

      const result = await resolveMapsLink("https://maps.app.goo.gl/short");
      assert.deepStrictEqual(result, {
        lat: 10.123,
        lng: -80.456,
        resolvedUrl:
          "https://www.google.com/maps/place/test/@10.123,-80.456,15z",
      });
      assert.strictEqual(mocks.getRequestCount(), 1);
    },
  );

  await t.test(
    "redirigir a externo o HTTP bloquea antes de request",
    async () => {
      const mocks = createFakeMocks();

      const resolveMapsLink = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
        timeoutMs: 1000,
        maxRedirects: 3,
        maxBodyBytes: 1024,
      });

      mocks.setRoute("https://maps.app.goo.gl/to-external", 302, {
        location: "https://external.com/maps",
      });
      await assert.rejects(() =>
        resolveMapsLink("https://maps.app.goo.gl/to-external"),
      );
      assert.strictEqual(mocks.getRequestCount(), 1);

      mocks.setRoute("https://maps.app.goo.gl/to-http", 302, {
        location: "http://www.google.com/maps",
      });
      await assert.rejects(() =>
        resolveMapsLink("https://maps.app.goo.gl/to-http"),
      );
      assert.strictEqual(mocks.getRequestCount(), 2);
      assert.deepStrictEqual(mocks.getLookupHosts(), [
        "maps.app.goo.gl",
        "maps.app.goo.gl",
      ]);
    },
  );

  await t.test(
    "redirección permitida valida DNS de cada host y extrae HTML acotado",
    async () => {
      const mocks = createFakeMocks();
      mocks.setRoute("https://maps.app.goo.gl/html", 302, {
        location: "https://www.google.com/maps/place/destino",
      });
      mocks.setRoute(
        "https://www.google.com/maps/place/destino",
        200,
        {},
        '<script>{"lat":13.6929,"lng":-89.2182}</script>',
      );
      const resolveMapsLink = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
      });
      assert.deepStrictEqual(
        await resolveMapsLink("https://maps.app.goo.gl/html"),
        {
          lat: 13.6929,
          lng: -89.2182,
          resolvedUrl: "https://www.google.com/maps/place/destino",
        },
      );
      assert.strictEqual(mocks.getRequestCount(), 2);
      assert.deepStrictEqual(mocks.getLookupHosts(), [
        "maps.app.goo.gl",
        "www.google.com",
      ]);
    },
  );

  await t.test(
    "redirección relativa permitida y límite de saltos",
    async () => {
      const mocks = createFakeMocks();
      mocks.setRoute("https://maps.app.goo.gl/first", 302, {
        location: "/second",
      });
      mocks.setRoute("https://maps.app.goo.gl/second", 302, {
        location: "/third",
      });
      const resolver = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
        maxRedirects: 1,
      });
      await assert.rejects(() => resolver("https://maps.app.goo.gl/first"));
      assert.strictEqual(mocks.getRequestCount(), 2);
      assert.deepStrictEqual(mocks.getLookupHosts(), [
        "maps.app.goo.gl",
        "maps.app.goo.gl",
      ]);
    },
  );

  await t.test("DNS privado/loopback/mix privado bloqueado", async () => {
    const mocks = createFakeMocks();

    const checkBlocked = async (lookupResponse) => {
      const mockLookup = async () => lookupResponse;
      const resolver = createMapsLinkResolver({
        lookup: mockLookup,
        request: mocks.request,
        timeoutMs: 1000,
        maxRedirects: 3,
        maxBodyBytes: 1024,
      });
      await assert.rejects(() =>
        resolver("https://maps.app.goo.gl/private-test"),
      );
      assert.strictEqual(mocks.getRequestCalled(), false);
    };

    // loopback
    await checkBlocked([{ address: "127.0.0.1", family: 4 }]);
    // private internal
    await checkBlocked([{ address: "192.168.1.1", family: 4 }]);
    await checkBlocked([{ address: "10.0.0.1", family: 4 }]);
    // mix
    await checkBlocked([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
  });

  await t.test(
    "DNS IPv4 publico conectado mediante options.lookup pinned",
    async () => {
      const mocks = createFakeMocks();
      mocks.setRoute(
        "https://maps.app.goo.gl/ok",
        200,
        {},
        "content with coords 10.123,-80.456",
      );

      const resolveMapsLink = createMapsLinkResolver({
        lookup: mocks.lookup,
        request: mocks.request,
        timeoutMs: 1000,
        maxRedirects: 3,
        maxBodyBytes: 1024,
      });

      try {
        await resolveMapsLink("https://maps.app.goo.gl/ok");
      } catch (e) {
        // It might fail parsing but request must be called. We ignore parse errors here.
      }

      assert.strictEqual(mocks.getRequestCalled(), true);
      const opts = mocks.getRequestOptions();
      assert.ok(
        typeof opts.lookup === "function",
        "Debe usar un custom lookup function para pinning",
      );
      assert.strictEqual(
        opts.agent,
        false,
        "No debe reutilizar sockets anteriores al pinning",
      );

      // Evaluate pinned behavior
      let cbCalled = false;
      opts.lookup("maps.app.goo.gl", {}, (err, address, family) => {
        cbCalled = true;
        assert.strictEqual(err, null);
        assert.strictEqual(address, "8.8.8.8");
        assert.strictEqual(family, 4);
      });
      assert.ok(cbCalled);
    },
  );

  await t.test("body grande fallan", async () => {
    const mocks = createFakeMocks();
    const largeBody = "a".repeat(2048);
    mocks.setRoute("https://maps.app.goo.gl/large", 200, {}, largeBody);

    const resolveMapsLink = createMapsLinkResolver({
      lookup: mocks.lookup,
      request: mocks.request,
      timeoutMs: 1000,
      maxRedirects: 3,
      maxBodyBytes: 1024,
    });

    await assert.rejects(() =>
      resolveMapsLink("https://maps.app.goo.gl/large"),
    );
  });

  await t.test("status no-2xx y no-3xx fallan", async () => {
    const mocks = createFakeMocks();
    mocks.setRoute("https://maps.app.goo.gl/404", 404, {}, "not found");

    const resolveMapsLink = createMapsLinkResolver({
      lookup: mocks.lookup,
      request: mocks.request,
      timeoutMs: 1000,
      maxRedirects: 3,
      maxBodyBytes: 1024,
    });

    await assert.rejects(() => resolveMapsLink("https://maps.app.goo.gl/404"));
  });

  await t.test("timeout global", async () => {
    const mocks = createFakeMocks();

    const slowRequest = (url, options, callback) => {
      const req = new EventEmitter();
      req.end = () => {
        // Very slow response
        setTimeout(() => {
          const res = new EventEmitter();
          res.resume = () => {};
          res.destroy = () => {};
          if (callback) callback(res);
          res.emit("end");
        }, 100);
      };
      req.destroy = () => {};
      return req;
    };

    const resolveMapsLink = createMapsLinkResolver({
      lookup: mocks.lookup,
      request: slowRequest,
      timeoutMs: 10,
      maxRedirects: 3,
      maxBodyBytes: 1024,
    });

    await assert.rejects(() =>
      resolveMapsLink("https://maps.app.goo.gl/timeout"),
    );
  });
});
