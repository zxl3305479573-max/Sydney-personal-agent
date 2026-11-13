const { spawn } = require("node:child_process");

const server = spawn("node_modules/.bin/vite", ["preview", "--host", "127.0.0.1", "--port", "5173"], {
  stdio: "ignore",
});

async function run() {
  const base = "http://127.0.0.1:5173";
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error("preview server exited");
    try {
      const response = await fetch(base, {
        headers: { host: "192.0.2.10" },
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("preview server did not become ready");

  for (const path of ["/", "/login", "/reset-password"]) {
    const response = await fetch(base + path, {
      headers: { host: "192.0.2.10" },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      throw new Error(`page ${path} returned ${response.status}`);
    }
    const html = await response.text();
    const entry = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
    if (!entry) throw new Error(`page ${path} has no application entry`);
    const asset = await fetch(base + entry, {
      headers: { host: "192.0.2.10" },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!asset.ok || !(await asset.text()).length) throw new Error(`page ${path} entry unavailable`);
  }
  console.log("ip-host-web-pages-and-entry-available");
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill("SIGKILL");
  });
