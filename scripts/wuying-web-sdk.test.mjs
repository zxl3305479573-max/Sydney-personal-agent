import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkSdk, prepareSdk } from "./wuying-web-sdk.mjs";

const vendor = {
  "WuyingWebSDK.js": Buffer.from("synthetic SDK"),
  "sdk/ASP/container.html": Buffer.from("<html><head></head><body>synthetic</body></html>"),
};
const manifest = Object.fromEntries(
  Object.entries(vendor).map(([file, content]) => [
    file,
    createHash("sha256").update(content).digest("hex"),
  ]),
);

async function fixture(context) {
  const root = await mkdtemp(path.join(tmpdir(), "sydney-sdk-"));
  context.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith("sydney-sdk-"));
    await rm(root, { recursive: true, force: true });
  });
  const directories = [path.join(root, "api"), path.join(root, "web")];
  for (const directory of directories) {
    await mkdir(directory);
    for (const file of ["screen.html", "screen.js", "storage.js"])
      await writeFile(path.join(directory, file), "owned");
  }
  const fetchImpl = async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    const file = new URL(url).pathname.slice(1);
    return new Response(vendor[file]);
  };
  return { directories, manifest, base: "https://sdk.invalid/", fetchImpl };
}

test("prepares identical verified resources in both targets and checks offline", async (context) => {
  const options = await fixture(context);
  await prepareSdk(options);
  await checkSdk(options);
  for (const file of Object.keys(vendor)) {
    const first = await readFile(path.join(options.directories[0], file));
    assert.deepEqual(first, await readFile(path.join(options.directories[1], file)));
    if (file.endsWith(".html"))
      assert.ok(first.includes('<head><script src="../../storage.js"></script>'));
  }
  assert.equal(
    (await readdir(options.directories[0])).some((file) => file.endsWith(".tmp")),
    false,
  );
});

for (const failure of ["http", "checksum", "timeout", "head"]) {
  test(`${failure} in the second download leaves existing resources intact`, async (context) => {
    const options = await fixture(context);
    for (const directory of options.directories)
      await writeFile(path.join(directory, "WuyingWebSDK.js"), "existing");
    const originalFetch = options.fetchImpl;
    const noHead = Buffer.from("<html></html>");
    if (failure === "head") {
      options.manifest = {
        ...manifest,
        "sdk/ASP/container.html": createHash("sha256").update(noHead).digest("hex"),
      };
    }
    options.fetchImpl = async (url, init) => {
      if (!new URL(url).pathname.endsWith(".html")) return originalFetch(url, init);
      if (failure === "http") return new Response("unavailable", { status: 503 });
      if (failure === "timeout") throw new DOMException("deadline", "TimeoutError");
      if (failure === "head") return new Response(noHead);
      return new Response("corrupted");
    };
    await assert.rejects(prepareSdk(options), failure === "head" ? /head element/ : undefined);
    for (const directory of options.directories) {
      assert.equal(await readFile(path.join(directory, "WuyingWebSDK.js"), "utf8"), "existing");
      assert.equal(
        (await readdir(directory)).some((file) => file.endsWith(".tmp")),
        false,
      );
    }
  });
}

test("offline check rejects missing resources, unpatched HTML and modified bytes", async (context) => {
  const options = await fixture(context);
  await assert.rejects(checkSdk(options), /ENOENT/);
  await prepareSdk(options);
  const container = path.join(options.directories[0], "sdk/ASP/container.html");
  await writeFile(container, vendor["sdk/ASP/container.html"]);
  await assert.rejects(checkSdk(options), /missing storage shim/);
  await prepareSdk(options);
  await writeFile(path.join(options.directories[0], "WuyingWebSDK.js"), "corrupted");
  await assert.rejects(checkSdk(options), /checksum/);
  await prepareSdk(options);
  await rm(path.join(options.directories[0], "storage.js"));
  await assert.rejects(checkSdk(options), /ENOENT/);
});

test("staging failure preserves both installed sets and removes temporary files", async (context) => {
  const options = await fixture(context);
  for (const directory of options.directories) {
    await writeFile(path.join(directory, "WuyingWebSDK.js"), "existing");
  }
  await writeFile(path.join(options.directories[1], "sdk"), "blocks directory creation");
  await assert.rejects(prepareSdk(options));
  for (const directory of options.directories) {
    assert.equal(await readFile(path.join(directory, "WuyingWebSDK.js"), "utf8"), "existing");
    assert.equal(
      (await readdir(directory, { recursive: true })).some((file) => file.endsWith(".tmp")),
      false,
    );
  }
});
