const assert = require("node:assert/strict");
const { mkdtemp } = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");
const { buildSync, transformSync } = require("esbuild");
const { readFileSync } = require("node:fs");

const migrationFile = path.join(__dirname, "legacy-sidebar-density.ts");
const migration = new Module(migrationFile, module);
migration._compile(
  transformSync(readFileSync(migrationFile, "utf8"), { loader: "ts", format: "cjs" }).code,
  migrationFile,
);
const avatarMigrationFile = path.join(__dirname, "legacy-avatar-library.ts");
const avatarMigration = new Module(avatarMigrationFile, module);
avatarMigration._compile(
  buildSync({
    entryPoints: [avatarMigrationFile],
    bundle: true,
    platform: "node",
    external: ["electron"],
    write: false,
  }).outputFiles[0].text,
  avatarMigrationFile,
);

const origin = "https://legacy-storage.example.test";
const documentUrl = `${origin}/migration-probe`;

async function run() {
  app.setPath("userData", await mkdtemp(path.join(os.tmpdir(), "sydney-legacy-storage-")));
  await app.whenReady();
  const source = session.fromPartition("persist:migration-test");
  let denied = 0;
  const restrictRequests = (details, callback) => {
    const allowed = details.resourceType === "mainFrame" && details.url === documentUrl;
    if (!allowed) denied++;
    callback({ cancel: !allowed });
  };
  await source.protocol.handle("https", async (request) => {
    if (request.url === `${origin}/legacy-worker.js`) {
      return new Response(
        Buffer.from(`
        self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
        self.addEventListener("fetch", (event) => {
          if (event.request.mode === "navigate") {
            event.respondWith(new Response("<title>Legacy worker</title>", {
              headers: { "Content-Type": "text/html" },
            }));
          }
        });
      `),
        { headers: { "Content-Type": "text/javascript" } },
      );
    }
    if (request.url !== documentUrl) return new Response(null, { status: 403 });
    return new Response(Buffer.from("<!doctype html><title>Migration probe</title>"), {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy": "default-src 'none'; worker-src 'self'",
      },
    });
  });
  const open = () =>
    new BrowserWindow({
      show: false,
      webPreferences: { session: source, sandbox: true, contextIsolation: true },
    });
  const writer = open();
  await writer.loadURL(documentUrl);
  await writer.webContents.executeJavaScript(`(async () => {
    localStorage.setItem("rakazo.botsSidebarDensity", "compact");
    localStorage.setItem("rakazo.signedInUser", "synthetic-owner");
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("sydney-avatar-library", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("avatars", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("avatars", "readwrite");
        transaction.objectStore("avatars").add({
          id: "synthetic-avatar", name: "Synthetic", dataUrl: "data:image/png;base64,AA==", createdAt: 42,
        });
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("sydney-chat-appearance", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("settings");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("settings", "readwrite");
        transaction.objectStore("settings").put(
          new Blob([new Uint8Array([0, 137, 255, 10])], { type: "image/png" }), "background",
        );
        transaction.objectStore("settings").put({
          backgroundId: "synthetic-background",
          backgrounds: [{
            id: "synthetic-background", name: "Synthetic", fit: "cover", opacity: 100, overlay: 0,
            image: new Blob([new Uint8Array([0, 137, 255, 10])], { type: "image/png" }),
          }],
        }, "appearance");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    await navigator.serviceWorker.register("/legacy-worker.js");
    await navigator.serviceWorker.ready;
  })()`);
  const reader = open();
  await reader.loadURL(documentUrl);
  assert.equal(await reader.webContents.executeJavaScript("document.title"), "Legacy worker");
  writer.destroy();
  source.webRequest.onBeforeRequest(restrictRequests);
  reader.webContents.debugger.attach();
  await reader.webContents.debugger.sendCommand("Network.enable");
  await reader.webContents.debugger.sendCommand("Network.setBypassServiceWorker", { bypass: true });
  await reader.loadURL(documentUrl);
  assert.equal(await reader.webContents.executeJavaScript("document.title"), "Migration probe");
  const result = await reader.webContents.executeJavaScript(`(async () => {
    const background = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sydney-chat-appearance");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database.transaction("settings").objectStore("settings").get("background");
        read.onsuccess = () => { database.close(); resolve(read.result); };
        read.onerror = () => reject(read.error);
      };
    });
    return {
      origin: location.origin,
      density: localStorage.getItem("rakazo.botsSidebarDensity"),
      mime: background.type,
      bytes: Array.from(new Uint8Array(await background.arrayBuffer())),
    };
  })()`);
  const expectedBytes = [0, 137, 255, 10];
  assert.deepEqual(result, { origin, density: "compact", mime: "image/png", bytes: expectedBytes });
  await assert.rejects(reader.loadURL(`${origin}/outside-migration-probe`));
  const target = session.fromPartition("persist:migration-target");
  await target.protocol.handle(
    "https",
    async () =>
      new Response(Buffer.from("<title>Migration target</title>"), {
        headers: { "Content-Type": "text/html" },
      }),
  );
  const targetWindow = new BrowserWindow({
    show: false,
    webPreferences: { session: target, sandbox: true, contextIsolation: true },
  });
  const targetUrl = "https://target-storage.example.test/migration";
  await targetWindow.loadURL(targetUrl);
  reader.destroy();
  source.webRequest.onBeforeRequest(null);
  await new Promise((resolve) => setImmediate(resolve));
  source.protocol.unhandle("https");
  const migrateAvatars = (userId) =>
    avatarMigration.exports.migrateLegacyAvatars(
      source,
      origin,
      targetWindow,
      new URL(targetUrl).origin,
      userId,
    );
  await targetWindow.webContents.executeJavaScript(
    'localStorage.setItem("rakazo.signedInUser", "different-owner")',
  );
  assert.equal(await migrateAvatars("different-owner"), false);
  await targetWindow.webContents.executeJavaScript(
    'localStorage.setItem("rakazo.signedInUser", "synthetic-owner")',
  );
  assert.equal(await migrateAvatars("synthetic-owner"), true);
  assert.equal(await migrateAvatars("synthetic-owner"), false);
  const migrateAppearance = () =>
    avatarMigration.exports.migrateLegacyAppearance(
      source,
      origin,
      targetWindow,
      new URL(targetUrl).origin,
      "synthetic-owner",
    );
  await targetWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const open = indexedDB.open("sydney-chat-appearance", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("settings");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("settings", "readwrite");
      transaction.objectStore("settings").put({
        mode: "dark", backgroundId: null, backgrounds: [], chatBackgrounds: { cleared: null },
      }, "appearance");
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  })`);
  assert.equal(await migrateAppearance(), true);
  assert.equal(await migrateAppearance(), false);
  const appearance =
    await targetWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const open = indexedDB.open("sydney-chat-appearance", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const read = database.transaction("settings").objectStore("settings").get("appearance");
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = async () => {
        database.close();
        const image = read.result.backgrounds[0].image;
        resolve({
          mime: image.type, bytes: [...new Uint8Array(await image.arrayBuffer())],
          mode: read.result.mode, backgroundId: read.result.backgroundId,
          chatBackgrounds: read.result.chatBackgrounds, count: read.result.backgrounds.length,
        });
      };
    };
  })`);
  assert.deepEqual(appearance, {
    mime: "image/png",
    bytes: expectedBytes,
    mode: "dark",
    backgroundId: null,
    chatBackgrounds: { cleared: null },
    count: 1,
  });
  assert.equal(await migration.exports.readLegacySidebarDensity(source, origin), "compact");
  assert.equal(
    await migration.exports.importLegacySidebarDensity(
      targetWindow,
      new URL(targetUrl).origin,
      "compact",
    ),
    true,
  );
  assert.equal(
    await migration.exports.needsLegacySidebarDensity(targetWindow, new URL(targetUrl).origin),
    false,
  );
  assert.equal(
    await migration.exports.importLegacySidebarDensity(
      targetWindow,
      new URL(targetUrl).origin,
      "comfortable",
    ),
    false,
  );
  const restoredReader = open();
  await restoredReader.loadURL(documentUrl);
  assert.equal(
    await restoredReader.webContents.executeJavaScript("document.title"),
    "Legacy worker",
  );
  restoredReader.destroy();
  const importScript = `(async (snapshot) => {
    const key = "rakazo.botsSidebarDensity";
    if (localStorage.getItem(key) === null) localStorage.setItem(key, snapshot.density);
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open("sydney-chat-appearance", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("settings");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("settings", "readwrite");
        const store = transaction.objectStore("settings");
        const existing = store.get("background");
        existing.onsuccess = () => {
          if (existing.result === undefined) {
            store.add(new Blob([new Uint8Array(snapshot.bytes)], { type: snapshot.mime }), "background");
          }
        };
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onabort = () => { database.close(); reject(transaction.error); };
      };
    });
  })`;
  await targetWindow.webContents.executeJavaScript(`${importScript}(${JSON.stringify(result)})`);
  await targetWindow.loadURL(targetUrl);
  const conflict = { ...result, density: "comfortable", bytes: [1] };
  await targetWindow.webContents.executeJavaScript(`${importScript}(${JSON.stringify(conflict)})`);
  const imported = await targetWindow.webContents.executeJavaScript(`(async () => {
    const background = await new Promise((resolve, reject) => {
      const request = indexedDB.open("sydney-chat-appearance");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const read = database.transaction("settings").objectStore("settings").get("background");
        read.onsuccess = () => { database.close(); resolve(read.result); };
        read.onerror = () => reject(read.error);
      };
    });
    return {
      density: localStorage.getItem("rakazo.botsSidebarDensity"),
      mime: background.type,
      bytes: Array.from(new Uint8Array(await background.arrayBuffer())),
    };
  })()`);
  assert.deepEqual(imported, { density: "compact", mime: "image/png", bytes: expectedBytes });
  targetWindow.destroy();
  target.protocol.unhandle("https");
  source.webRequest.onBeforeRequest(null);
  process.stdout.write(`Offline origin storage probe passed (blocked requests: ${denied})\n`);
}

run().then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
