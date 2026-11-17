#!/usr/bin/env bash
set -euo pipefail

api_image='sha256:50863f1b5a76c9da9c8525564e1b36c42f87bfea82b0ee6afe5e54715d5af4d4'
worker_image='sha256:e4cdb8d3f16aebd8efaae0902c29b22c98d0ecda3cac4a1e6bbb7b0ae72cf16c'
postgres_image='sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6'
caddy_image='sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d'
: "${SYDNEY_CADDY_CANDIDATE_BASE64:?Use the staging runner to provide the candidate configuration}"
suffix="$(openssl rand -hex 8)"
prefix="sydney-chat-${suffix}"
scratch="$(mktemp -d /dev/shm/sydney-chat-XXXXXXXX)"
network_created=0
db_created=0
api_created=0
worker_created=0
web_created=0
caddy_created=0
recovery_created=0
cleanup() {
  local status=$?
  trap - EXIT
  if (( recovery_created )); then docker rm -f "${prefix}-recovery" >/dev/null 2>&1 || status=1; fi
  if (( caddy_created )); then docker rm -f "${prefix}-caddy" >/dev/null 2>&1 || status=1; fi
  if (( web_created )); then docker rm -f "${prefix}-web" >/dev/null 2>&1 || status=1; fi
  if (( worker_created )); then docker rm -f "${prefix}-worker" >/dev/null 2>&1 || status=1; fi
  if (( api_created )); then docker rm -f "${prefix}-api" >/dev/null 2>&1 || status=1; fi
  if (( db_created )); then docker rm -f "${prefix}-db" >/dev/null 2>&1 || status=1; fi
  if (( network_created )); then docker network rm "$prefix" >/dev/null 2>&1 || status=1; fi
  case "$scratch" in /dev/shm/sydney-chat-*) rm -rf -- "$scratch" || status=1 ;; *) status=1 ;; esac
  echo "drill-exit=$status"
  exit "$status"
}
trap cleanup EXIT
umask 077
owner_password="$(openssl rand -hex 24)"
runtime_password="$(openssl rand -hex 24)"
auth_secret="$(openssl rand -hex 32)"
encryption_key="$(openssl rand -hex 32)"
screen_secret="$(openssl rand -hex 32)"
cat >"$scratch/db.env" <<EOF
POSTGRES_USER=stage_owner
POSTGRES_PASSWORD=$owner_password
POSTGRES_DB=stage_chat
EOF
cat >"$scratch/common.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgres://stage_runtime:$runtime_password@stage-db:5432/stage_chat
ENCRYPTION_KEY=$encryption_key
SCREEN_PROXY_SECRET=$screen_secret
BETTER_AUTH_SECRET=$auth_secret
BETTER_AUTH_URL=http://127.0.0.1:5173
WEB_ORIGIN=http://127.0.0.1:5173
EXTRA_TRUSTED_ORIGINS=https://192.0.2.10
SIGNUPS_ENABLED=true
AUTH_BREACHED_PASSWORD_CHECK_ENABLED=false
API_HOST=0.0.0.0
DATA_DIR=/data
AGENT_RUNTIME=scripted
SANDBOX_PROVIDER=fake
WAKEUP_DRIVER=graphile
GRAPHILE_WORKER_CONCURRENCY=1
DB_POOL_MAX=8
EOF
cp "$scratch/common.env" "$scratch/migrate.env"
printf 'DATABASE_MIGRATION_URL=postgres://stage_owner:%s@stage-db:5432/stage_chat\n' "$owner_password" >>"$scratch/migrate.env"
docker network create --internal --label "sydney.stage=$prefix" "$prefix" >/dev/null
network_created=1
docker run -d --name "${prefix}-db" --label "sydney.stage=$prefix" --network "$prefix" --network-alias stage-db --memory 384m --cpus 1 --tmpfs /var/lib/postgresql:rw,size=256m --env-file "$scratch/db.env" "$postgres_image" >/dev/null
db_created=1
for attempt in $(seq 1 60); do
  if docker exec "${prefix}-db" pg_isready -U stage_owner -d stage_chat >/dev/null 2>&1; then break; fi
  if (( attempt == 60 )); then echo "database-not-ready"; exit 1; fi
  sleep 1
done
echo "database-ready"
if ! docker run --rm --label "sydney.stage=$prefix" --network "$prefix" --memory 512m --cpus 1 --user node --workdir /app/apps/api --entrypoint node --env-file "$scratch/migrate.env" "$api_image" --enable-source-maps dist/cli/migrate-database.js >"$scratch/migrate.log" 2>&1; then
  echo "migration-failed"
  sed -E "s/$owner_password/[redacted]/g;s/$runtime_password/[redacted]/g" "$scratch/migrate.log" | tail -20
  exit 1
fi
echo "migration-passed"
docker run -d --name "${prefix}-api" --label "sydney.stage=$prefix" --network "$prefix" --network-alias api --memory 448m --cpus 1 --user node --tmpfs /data:rw,uid=1000,gid=1000,size=32m --env-file "$scratch/common.env" --workdir /app/apps/api --entrypoint node "$api_image" --enable-source-maps dist/index.js >/dev/null
api_created=1
docker run -d --name "${prefix}-worker" --label "sydney.stage=$prefix" --network "$prefix" --memory 448m --cpus 1 --user node --tmpfs /data:rw,uid=1000,gid=1000,size=32m --env-file "$scratch/common.env" --workdir /app/apps/worker --entrypoint node "$worker_image" --enable-source-maps dist/index.js >/dev/null
worker_created=1
for attempt in $(seq 1 60); do
  if docker exec "${prefix}-api" node -e "fetch('http://127.0.0.1:3100/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 && docker logs "${prefix}-worker" 2>&1 | grep -q 'worker ready'; then break; fi
  if (( attempt == 60 )); then
    echo "services-not-ready"
    docker logs --tail 12 "${prefix}-api" 2>&1 | sed -E "s/$owner_password/[redacted]/g;s/$runtime_password/[redacted]/g;s/$auth_secret/[redacted]/g;s/$encryption_key/[redacted]/g;s/$screen_secret/[redacted]/g"
    docker logs --tail 12 "${prefix}-worker" 2>&1 | sed -E "s/$owner_password/[redacted]/g;s/$runtime_password/[redacted]/g;s/$auth_secret/[redacted]/g;s/$encryption_key/[redacted]/g;s/$screen_secret/[redacted]/g"
    exit 1
  fi
  sleep 1
done
echo "services-ready"
mkdir "$scratch/caddy"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$scratch/caddy/ip.key" -out "$scratch/caddy/ip.crt" -subj '/CN=192.0.2.10' -addext 'subjectAltName=IP:192.0.2.10' >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$scratch/caddy/domain.key" -out "$scratch/caddy/domain.crt" -subj '/CN=old.example.test' -addext 'subjectAltName=DNS:old.example.test' >/dev/null 2>&1
chmod 644 "$scratch/caddy/ip.crt" "$scratch/caddy/domain.crt"
LAB_CADDY_DIR="$scratch/caddy" python3 - <<'PY'
import base64
import os
from pathlib import Path

source = base64.b64decode(os.environ["SYDNEY_CADDY_CANDIDATE_BASE64"], validate=True).decode()
acme = "\ttls {\n\t\tissuer acme {$RAKAZO_IP_ACME_DIRECTORY} {\n\t\t\tprofile shortlived\n\t\t\tdisable_tlsalpn_challenge\n\t\t}\n\t}"
changes = (
    ("{\n\tdefault_sni", "{\n\tadmin off\n\tauto_https off\n\tdefault_sni"),
    (acme, "\ttls /lab/ip.crt /lab/ip.key"),
)
for before, after in changes:
    if source.count(before) != 1:
        raise SystemExit("unexpected Caddy candidate layout")
    source = source.replace(before, after)
Path(os.environ["LAB_CADDY_DIR"], "Caddyfile").write_text(source)
PY
docker run -d --name "${prefix}-web" --label "sydney.stage=$prefix" --network "$prefix" --network-alias web --memory 256m --cpus 1 --pids-limit 128 --user node --env-file "$scratch/common.env" -v "$scratch/caddy/ip.crt:/lab/ip.crt:ro" -e RAYON_NUM_THREADS=1 -e RAKAZO_HOST=192.0.2.10 -e API_PROXY_TARGET=http://api:3100 --workdir /app/apps/web --entrypoint /app/apps/web/node_modules/.bin/vite "$api_image" preview --host 0.0.0.0 --port 5173 >/dev/null
web_created=1
for attempt in $(seq 1 60); do
  if docker exec "${prefix}-web" node -e "fetch('http://127.0.0.1:5173/',{headers:{host:'192.0.2.10'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "${prefix}-web")" != true ]]; then echo "web-exited"; exit 1; fi
  if (( attempt == 60 )); then echo "web-not-ready"; exit 1; fi
  sleep 1
done
docker run -d --name "${prefix}-caddy" --label "sydney.stage=$prefix" --network "$prefix" --network-alias stage-caddy --memory 96m --cpus 1 --pids-limit 128 --log-driver none --tmpfs /data:rw,size=16m --tmpfs /config:rw,size=16m -v "$scratch/caddy:/lab:ro" -e RAKAZO_PUBLIC_IP=192.0.2.10 -e RAKAZO_HOST=old.example.test -e RAKAZO_CERT_FILE=/lab/domain.crt -e RAKAZO_KEY_FILE=/lab/domain.key --entrypoint caddy "$caddy_image" run --config /lab/Caddyfile --adapter caddyfile >/dev/null
caddy_created=1
docker exec -i "${prefix}-web" node --input-type=module <<'NODE'
import https from "node:https";
import tls from "node:tls";
import { readFileSync } from "node:fs";
const ca = readFileSync("/lab/ip.crt");
function request(path, { method = "GET", payload, cookie, spaceId, expectedIp = "192.0.2.10" } = {}) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const req = https.request({
      host: "stage-caddy", port: 443, servername: "", path, method, ca,
      checkServerIdentity: (_host, cert) => tls.checkServerIdentity(expectedIp, cert),
      headers: { host: "192.0.2.10", origin: "https://192.0.2.10",
        ...(cookie ? { cookie } : {}),
        ...(spaceId ? { "x-rakazo-space-id": spaceId } : {}),
        ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {}) },
      timeout: 10000,
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) res.destroy(new Error("response too large"));
        else chunks.push(chunk);
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await request("/")).status === 200) { ready = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready) throw new Error("Caddy HTTPS not ready");
try {
  await request("/", { expectedIp: "192.0.2.11" });
  throw new Error("wrong certificate identity accepted");
} catch (error) {
  if (error.code !== "ERR_TLS_CERT_ALTNAME_INVALID") throw error;
}
for (const path of ["/", "/login", "/reset-password"]) {
  const response = await request(path);
  if (response.status !== 200 || !response.headers["content-type"]?.includes("text/html")) throw new Error(`page ${path} failed`);
}
const caps = await request("/api/auth/capabilities");
if (caps.status !== 200 || typeof JSON.parse(caps.body).passwordReset !== "boolean") throw new Error("capabilities failed");
const health = await request("/rpc/health", { method: "POST", payload: { json: {} } });
if (health.status !== 200 || JSON.parse(health.body).json?.ok !== true) throw new Error("RPC health failed");
const signup = await request("/api/auth/sign-up/email", { method: "POST",
  payload: { email: "stage-edge@example.invalid", password: "synthetic-edge-password-2849", name: "Stage Edge" } });
if (signup.status !== 200) throw new Error(`signup status ${signup.status}`);
const cookie = signup.headers["set-cookie"]?.map((value) => value.split(";")[0]).join("; ");
if (!cookie) throw new Error("signup cookie missing");
const me = await request("/rpc/me", { method: "POST", payload: { json: {} }, cookie });
if (me.status !== 200 || !JSON.parse(me.body).json?.userId) throw new Error("session unavailable");
const actor = JSON.parse(me.body).json;
async function rpc(path, input = {}, spaceId = actor.spaceId, session = cookie) {
  const response = await request(`/rpc/${path}`, {
    method: "POST", payload: { json: input }, cookie: session, spaceId,
  });
  const result = JSON.parse(response.body);
  if (response.status !== 200 || result.error) throw new Error(`${path} status ${response.status}`);
  return result.json;
}
const bot = await rpc("bots/create", { name: "Edge Bot", title: "Edge Bot", description: "", instructions: "", notifyOnFinish: false });
const peer = await rpc("bots/create", { name: "Edge Peer", title: "Edge Peer", description: "", instructions: "", notifyOnFinish: false });
const group = await rpc("groups/create", { name: "Edge Group", botIds: [bot.id, peer.id] });
const direct = await rpc("threads/send", { botId: bot.id, text: "hello edge direct" });
const groupSend = await rpc("threads/send", { groupId: group.id, text: "hello edge group", mentions: [{ kind: "bot", id: bot.id }] });
for (const [target, text, runId] of [
  [{ botId: bot.id }, "hello edge direct", direct.runId],
  [{ groupId: group.id }, "hello edge group", groupSend.runId],
]) {
  if (!runId) throw new Error("chat run missing");
  let completed = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    const snapshot = await rpc("threads/get", target);
    const recent = await rpc("runs/list", { filter: "recent" });
    const run = recent.runs.find((item) => item.runId === runId);
    if (run?.status === "failed" || run?.status === "cancelled") throw new Error(`run ${run.status}`);
    const userMessage = snapshot.messages.some((message) => message.role === "user" && message.blocks.some((block) => block.kind === "text" && block.text === text));
    const botMessage = snapshot.messages.some((message) => message.role === "bot" && message.runId === runId && message.blocks.some((block) => block.kind === "text" && block.text));
    if (run?.status === "completed" && userMessage && botMessage) { completed = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!completed) throw new Error("HTTPS chat timed out");
}
const otherSpace = await rpc("spaces/create", { name: "Edge Other" });
const denied = await request("/rpc/threads/get", {
  method: "POST", payload: { json: { groupId: group.id } }, cookie, spaceId: otherSpace.id,
});
if (denied.status !== 404) throw new Error(`cross-space group status ${denied.status}`);
const signin = await request("/api/auth/sign-in/email", { method: "POST",
  payload: { email: "stage-edge@example.invalid", password: "synthetic-edge-password-2849" } });
if (signin.status !== 200) throw new Error(`second signin status ${signin.status}`);
const secondCookie = signin.headers["set-cookie"]?.map((value) => value.split(";")[0]).join("; ");
if (!secondCookie || secondCookie === cookie) throw new Error("second session missing");
const secondActor = await rpc("me", {}, actor.spaceId, secondCookie);
if (secondActor.userId !== actor.userId) throw new Error("second session user differs");
for (const [target, text, runId] of [
  [{ botId: bot.id }, "hello edge direct", direct.runId],
  [{ groupId: group.id }, "hello edge group", groupSend.runId],
]) {
  const snapshot = await rpc("threads/get", target, actor.spaceId, secondCookie);
  if (!snapshot.messages.some((message) => message.role === "user" && message.blocks.some((block) => block.kind === "text" && block.text === text))) {
    throw new Error("second session cannot read HTTPS message");
  }
  if (!snapshot.messages.some((message) => message.role === "bot" && message.runId === runId && message.blocks.some((block) => block.kind === "text" && block.text))) {
    throw new Error("second session cannot read HTTPS bot response");
  }
}
console.log("candidate-caddy-ip-tls-real-web-api-session-passed");
console.log("candidate-caddy-https-chat-and-isolation-passed");
NODE
docker exec -i "${prefix}-web" node --input-type=module <<'NODE'
const base = "http://127.0.0.1:5173";
const headers = { host: "192.0.2.10", origin: "http://127.0.0.1:5173" };
for (const path of ["/", "/login", "/reset-password"]) {
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`web page ${path} status ${response.status}`);
  }
}
const capabilities = await fetch(`${base}/api/auth/capabilities`, { headers, signal: AbortSignal.timeout(10000) });
if (!capabilities.ok || typeof (await capabilities.json()).passwordReset !== "boolean") {
  throw new Error("proxied auth capabilities unavailable");
}
const health = await fetch(`${base}/rpc/health`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ json: {} }),
  signal: AbortSignal.timeout(10000),
});
if (!health.ok || (await health.json()).json?.ok !== true) throw new Error("proxied RPC health unavailable");
const signup = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ email: "stage-web@example.invalid", password: "synthetic-web-password-2849", name: "Stage Web" }),
  signal: AbortSignal.timeout(10000),
});
if (!signup.ok) throw new Error(`proxied signup status ${signup.status}`);
const cookie = signup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
if (!cookie) throw new Error("proxied signup missing cookie");
const me = await fetch(`${base}/rpc/me`, {
  method: "POST",
  headers: { ...headers, cookie, "content-type": "application/json" },
  body: JSON.stringify({ json: {} }),
  signal: AbortSignal.timeout(10000),
});
if (!me.ok || !(await me.json()).json?.userId) throw new Error("proxied session unavailable");
console.log("real-web-proxied-api-and-session-passed");
NODE
if [[ "${SYDNEY_STAGING_BROWSER_CHECK:-0}" == 1 ]]; then
  browser_web_ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${prefix}-web")"
  [[ "$browser_web_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
  echo "browser-probe-ready=$browser_web_ip,$prefix"
  browser_completed=0
  for attempt in $(seq 1 50); do
    if docker exec "${prefix}-web" test -f /tmp/sydney-browser-probe-finished; then
      browser_completed=1
      break
    fi
    sleep 2
  done
  if (( ! browser_completed )); then echo "browser-probe-timeout"; exit 1; fi
fi
docker rm -f "${prefix}-caddy" >/dev/null
caddy_created=0
docker rm -f "${prefix}-web" >/dev/null
web_created=0
docker exec -i "${prefix}-api" node --input-type=module <<'NODE'
const base = "http://127.0.0.1:3100";
const origin = "http://127.0.0.1:5173";
const signup = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email: "stage-chat@example.invalid", password: "synthetic-chat-password-2849", name: "Stage Chat" }),
});
if (!signup.ok) throw new Error(`signup status ${signup.status}`);
const cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
if (!cookie) throw new Error("missing session cookie");
async function request(path, body = {}, spaceId, session = cookie) {
  const response = await fetch(`${base}/rpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: session, ...(spaceId ? { "x-rakazo-space-id": spaceId } : {}) },
    body: JSON.stringify({ json: body }),
  });
  const result = await response.json();
  return { response, result };
}
async function rpc(path, body = {}, spaceId, session = cookie) {
  const { response, result } = await request(path, body, spaceId, session);
  if (!response.ok || result.error) throw new Error(`${path} status ${response.status}: ${JSON.stringify(result.error ?? result)}`);
  return result.json;
}
const bot = await rpc("bots/create", { name: "Stage Bot", title: "Stage Bot", description: "", instructions: "", notifyOnFinish: false });
const sent = await rpc("threads/send", { botId: bot.id, text: "hello staging chat" });
if (!sent.runId) throw new Error("send returned no run id");
let completed = false;
for (let attempt = 0; attempt < 120; attempt++) {
  const snapshot = await rpc("threads/get", { botId: bot.id });
  const recent = await rpc("runs/list", { filter: "recent" });
  const run = recent.runs.find(item => item.runId === sent.runId);
  const userMessage = snapshot.messages.some(message => message.role === "user" && message.blocks.some(block => block.kind === "text" && block.text === "hello staging chat"));
  const assistantMessage = snapshot.messages.some(message => message.role === "bot" && message.runId === sent.runId && message.blocks.some(block => block.kind === "text" && block.text));
  if (run?.status === "failed" || run?.status === "cancelled") throw new Error(`run ${run.status}`);
  if (userMessage && assistantMessage && run?.status === "completed") {
    completed = true;
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!completed) throw new Error("chat processing timed out");
console.log("synthetic-chat-completed");
const actor = await rpc("me");
if (!actor.userId || !actor.spaceId) throw new Error("missing actor identity");
const secondBot = await rpc("bots/create", { name: "Stage Peer", title: "Stage Peer", description: "", instructions: "", notifyOnFinish: false }, actor.spaceId);
const group = await rpc("groups/create", { name: "Stage Group", botIds: [bot.id, secondBot.id] }, actor.spaceId);
const groupSent = await rpc("threads/send", { groupId: group.id, text: "hello staging group", mentions: [{ kind: "bot", id: bot.id }] }, actor.spaceId);
if (!groupSent.runId) throw new Error("group send returned no run id");
let groupCompleted = false;
for (let attempt = 0; attempt < 120; attempt++) {
  const snapshot = await rpc("threads/get", { groupId: group.id }, actor.spaceId);
  const recent = await rpc("runs/list", { filter: "recent" }, actor.spaceId);
  const run = recent.runs.find(item => item.runId === groupSent.runId);
  const userMessage = snapshot.messages.some(message => message.role === "user" && message.blocks.some(block => block.kind === "text" && block.text === "hello staging group"));
  const botMessage = snapshot.messages.some(message => message.role === "bot" && message.runId === groupSent.runId && message.blocks.some(block => block.kind === "text" && block.text));
  if (run?.status === "failed" || run?.status === "cancelled") throw new Error(`group run ${run.status}`);
  if (userMessage && botMessage && run?.status === "completed") {
    groupCompleted = true;
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!groupCompleted) throw new Error("group chat processing timed out");
const otherSpace = await rpc("spaces/create", { name: "Stage Other" });
const denied = await request("threads/get", { groupId: group.id }, otherSpace.id);
if (denied.response.status !== 404) throw new Error(`cross-space group access status ${denied.response.status}`);
console.log("synthetic-group-completed cross-space-denied");
const signin = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email: "stage-chat@example.invalid", password: "synthetic-chat-password-2849" }),
});
if (!signin.ok) throw new Error(`second sign-in status ${signin.status}`);
const secondCookie = signin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
if (!secondCookie || secondCookie === cookie) throw new Error("second session is not independent");
async function readSession(sessionCookie) {
  const response = await fetch(`${base}/api/auth/get-session`, { headers: { origin, cookie: sessionCookie } });
  if (!response.ok) throw new Error(`session status ${response.status}`);
  return response.json();
}
const firstSession = await readSession(cookie);
const secondSession = await readSession(secondCookie);
if (!firstSession?.session?.id || !secondSession?.session?.id ||
    firstSession.session.id === secondSession.session.id ||
    firstSession.user?.id !== actor.userId || secondSession.user?.id !== actor.userId) {
  throw new Error("session identities do not match expected independent logins");
}
const secondActor = await rpc("me", {}, actor.spaceId, secondCookie);
if (secondActor.userId !== actor.userId) throw new Error("second session user differs");
for (const [target, text, runId] of [
  [{ botId: bot.id }, "hello staging chat", sent.runId],
  [{ groupId: group.id }, "hello staging group", groupSent.runId],
]) {
  const snapshot = await rpc("threads/get", target, actor.spaceId, secondCookie);
  if (!snapshot.messages.some(message => message.role === "user" && message.blocks.some(block => block.kind === "text" && block.text === text))) {
    throw new Error("second session cannot read user message");
  }
  if (!snapshot.messages.some(message => message.role === "bot" && message.runId === runId && message.blocks.some(block => block.kind === "text" && block.text))) {
    throw new Error("second session cannot read bot response");
  }
}
console.log("independent-session-chat-read-passed");
NODE
docker rm -f "${prefix}-worker" >/dev/null
worker_created=0
docker rm -f "${prefix}-api" >/dev/null
api_created=0
docker run -d --name "${prefix}-recovery" --label "sydney.stage=$prefix" --network "$prefix" --memory 448m --cpus 1 --user node --tmpfs /data:rw,uid=1000,gid=1000,size=32m --env-file "$scratch/common.env" -e NODE_ENV=development -e EMAIL_EMULATOR=true -e API_HOST=127.0.0.1 -e WEB_ORIGIN=https://old.example.test -e BETTER_AUTH_URL=https://old.example.test -e EXTRA_TRUSTED_ORIGINS=https://192.0.2.10 -e AUTH_PUBLIC_LINK_ORIGIN=https://192.0.2.10 --workdir /app/apps/api --entrypoint node "$api_image" --enable-source-maps dist/index.js >/dev/null
recovery_created=1
for attempt in $(seq 1 60); do
  if docker exec "${prefix}-recovery" node -e "fetch('http://127.0.0.1:3100/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  if (( attempt == 60 )); then echo "recovery-api-not-ready"; exit 1; fi
  sleep 1
done
docker exec -i "${prefix}-recovery" node --input-type=module <<'NODE'
const base = "http://127.0.0.1:3100";
const ipOrigin = "https://192.0.2.10";
const oldOrigin = "https://old.example.test";
const email = "stage-recovery@example.invalid";
const oldPassword = "synthetic-old-password-2849";
const newPassword = "synthetic-new-password-2849";
async function request(path, body, origin = ipOrigin, redirect = "follow") {
  return fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { origin, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect,
    signal: AbortSignal.timeout(10000),
  });
}
async function expectOk(response, label) {
  if (!response.ok) throw new Error(`${label} status ${response.status}`);
}
async function mailLink(index) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await request("/api/dev/emails");
    await expectOk(response, "emulator");
    const messages = await response.json();
    if (messages.length > index) {
      const match = messages[index].text.match(/https:\/\/[^\s]+/);
      if (!match) throw new Error("missing synthetic email link");
      return new URL(match[0]);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("synthetic email timed out");
}
const capsResponse = await request("/api/auth/capabilities");
await expectOk(capsResponse, "capabilities");
const caps = await capsResponse.json();
if (!caps.passwordReset || caps.resetUrl !== `${ipOrigin}/reset-password` || caps.passkeyRpId !== "old.example.test") {
  throw new Error("unexpected IP recovery capabilities");
}
await expectOk(await request("/api/auth/sign-up/email", { email, password: oldPassword, name: "Stage Recovery" }), "signup");
const verification = await mailLink(0);
if (verification.origin !== ipOrigin || verification.pathname !== "/api/auth/verify-email") {
  throw new Error("unexpected verification link origin or path");
}
const verifyResponse = await request(verification.pathname + verification.search, undefined, ipOrigin, "manual");
if (verifyResponse.status !== 302 || new URL(verifyResponse.headers.get("location")).origin !== ipOrigin) {
  throw new Error(`verification redirect status ${verifyResponse.status}`);
}
await expectOk(await request("/api/auth/sign-in/email", { email, password: oldPassword }, oldOrigin), "old origin sign-in");
await expectOk(await request("/api/auth/request-password-reset", { email, redirectTo: caps.resetUrl }), "request reset");
const resetLink = await mailLink(1);
if (resetLink.origin !== ipOrigin || !resetLink.pathname.startsWith("/api/auth/reset-password/")) {
  throw new Error("unexpected reset link origin or path");
}
const redirectResponse = await request(resetLink.pathname + resetLink.search, undefined, ipOrigin, "manual");
if (redirectResponse.status !== 302) throw new Error(`reset redirect status ${redirectResponse.status}`);
const redirect = new URL(redirectResponse.headers.get("location"));
if (redirect.origin !== ipOrigin || redirect.pathname !== "/reset-password") throw new Error("unexpected reset destination");
const token = redirect.searchParams.get("token");
if (!token) throw new Error("reset token missing");
await expectOk(await request("/api/auth/reset-password", { token, newPassword }), "reset");
const previous = await request("/api/auth/sign-in/email", { email, password: oldPassword });
if (previous.ok) throw new Error("old password still accepted");
await expectOk(await request("/api/auth/sign-in/email", { email, password: newPassword }), "new password sign-in");
console.log("synthetic-ip-recovery-passed old-origin-login-and-passkey-rp-passed");
NODE
