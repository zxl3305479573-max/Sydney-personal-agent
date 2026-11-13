const { createHash } = require("node:crypto");
const chunks = [];
let bytes = 0;
process.stdin.on("data", (chunk) => {
  bytes += chunk.length;
  if (bytes > 16384) process.exit(1);
  chunks.push(chunk);
});
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const base = "http://127.0.0.1:3100";
    const headers = { authorization: `Bearer ${input.bearer}` };
    const signedOut = await fetch(`${base}/api/auth/get-session`);
    if (!signedOut.ok || await signedOut.json() !== null) throw new Error("signed out");
    const invalid = await fetch(`${base}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${input.bearer}invalid` },
    });
    if (!invalid.ok || await invalid.json() !== null) throw new Error("invalid session");
    const session = await fetch(`${base}/api/auth/get-session`, { headers });
    if (!session.ok) throw new Error("session status");
    const sessionData = await session.json();
    if (sessionData?.user?.id !== input.userId) throw new Error("session identity");
    console.log("isolated_signed_session=ok");
    const rpc = async (route, payload, authenticated = true) => {
      const response = await fetch(`${base}/rpc/${route}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authenticated ? { ...headers, "x-rakazo-space-id": input.spaceId } : {}),
        },
        body: JSON.stringify({ json: payload }),
      });
      if (!authenticated) return response.status;
      if (!response.ok) throw new Error(`rpc ${route} status ${response.status}`);
      const body = await response.json();
      return body.json;
    };
    if (input.transition?.auth) {
      const { email, password, operation } = input.transition.auth;
      if (typeof email !== "string" || !/^restore-[a-f0-9]{32}@example\.invalid$/.test(email) ||
          typeof password !== "string" || password.length < 16 ||
          !["signup", "signin"].includes(operation)) {
        throw new Error("invalid synthetic authentication request");
      }
      const path = operation === "signup" ? "sign-up/email" : "sign-in/email";
      const response = await fetch(`${base}/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
        body: JSON.stringify({ email, password, ...(operation === "signup" ? { name: "Restore Synthetic" } : {}) }),
      });
      console.log(`synthetic_password_${operation}_http=${response.status}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = body?.code;
        console.log(`synthetic_auth_error_code=${typeof code === "string" && /^[A-Z_]{1,64}$/.test(code) ? code : "unavailable"}`);
        throw new Error("synthetic password authentication failed");
      }
      const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
      console.log(`synthetic_password_cookie_present=${cookie ? 1 : 0}`);
      if (!cookie) throw new Error("synthetic session cookie missing");
      const syntheticSession = await fetch(`${base}/api/auth/get-session`, { headers: { cookie } });
      console.log(`synthetic_password_session_http=${syntheticSession.status}`);
      if (!syntheticSession.ok || (await syntheticSession.json())?.user?.email !== email) {
        throw new Error("synthetic password session mismatch");
      }
      if (operation === "signin") {
        const rejected = await fetch(`${base}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
          body: JSON.stringify({ email, password: `${password}-invalid` }),
        });
        if (rejected.status !== 401) throw new Error("incorrect password accepted");
      }
      console.log(`synthetic_password_${operation}=ok`);
    }
    const unauthenticated = await rpc("bots/list", null, false);
    if (unauthenticated !== 401) throw new Error("unauthenticated access");
    console.log("unauthenticated_rpc=401");
    const bots = await rpc("bots/list", null);
    if (!Array.isArray(bots) || !bots.some((bot) => bot.id === input.botId)) {
      throw new Error("restored bot missing");
    }
    console.log(`restored_bots_visible=${bots.length}`);
    if (input.transition?.personality === true) {
      const personalities = await rpc("personalities/list", null);
      if (!Array.isArray(personalities) || !personalities.length ||
          typeof personalities[0].instructions !== "string" || !personalities[0].instructions) {
        throw new Error("restored personality unavailable");
      }
      const created = await rpc("bots/create", {
        name: "Restore Synthetic Personality Bot",
        title: "Restore Synthetic Personality Bot",
        description: "",
        instructions: personalities[0].instructions,
        notifyOnFinish: false,
      });
      if (!created?.id) throw new Error("personality bot create failed");
      console.log("restored_personality_read_and_bot_created=1");
    }
    const groups = await rpc("groups/list", null);
    if (!Array.isArray(groups)) throw new Error("groups response");
    console.log(`restored_groups_visible=${groups.length}`);
    if (input.transition?.verify) {
      const botIds = bots.map((bot) => bot.id).sort().slice(0, 2);
      if (botIds.length !== 2 || botIds[0] === botIds[1] ||
          !Array.isArray(input.transition.verify) ||
          input.transition.verify.length > 2) {
        throw new Error("invalid transition");
      }
      const matches = (group, name) =>
        group.name === name && Array.isArray(group.members) &&
        JSON.stringify(group.members.map((member) => member.botId).sort()) === JSON.stringify(botIds);
      for (const name of input.transition.verify) {
        if (groups.filter((group) => matches(group, name)).length !== 1) {
          throw new Error("cross-version group missing");
        }
      }
      console.log(`cross_version_groups_verified=${input.transition.verify.length}`);
      if (input.transition.create) {
        if (groups.some((group) => group.name === input.transition.create)) {
          throw new Error("transition group already exists");
        }
        const created = await rpc("groups/create", { name: input.transition.create, botIds });
        if (!matches(created, input.transition.create)) throw new Error("group create mismatch");
        const after = await rpc("groups/list", null);
        if (!Array.isArray(after) || after.filter((group) => matches(group, input.transition.create)).length !== 1) {
          throw new Error("created group not visible");
        }
        console.log("synthetic_group_created=1");
      }
    }
    if (input.transition?.artifactVerify) {
      if (!Array.isArray(input.transition.artifactVerify) ||
          input.transition.artifactVerify.length > 2) {
        throw new Error("invalid artifact transition");
      }
      const verifyArtifact = async (name) => {
        const listed = await rpc("artifacts/list", { botId: input.botId });
        const matching = listed.filter((artifact) => artifact.name === `${name}.txt`);
        if (matching.length !== 1) throw new Error("cross-version artifact missing");
        const artifact = await rpc("artifacts/getById", { artifactId: matching[0].id });
        const expected = Buffer.from(`synthetic rollback artifact:${name}`).toString("base64");
        if (artifact.contentBase64 !== expected) throw new Error("cross-version artifact mismatch");
      };
      for (const name of input.transition.artifactVerify) await verifyArtifact(name);
      console.log(`cross_version_artifacts_verified=${input.transition.artifactVerify.length}`);
      if (input.transition.artifactCreate) {
        const name = input.transition.artifactCreate;
        await rpc("artifacts/create", {
          botId: input.botId,
          name: `${name}.txt`,
          mimeType: "text/plain",
          contentBase64: Buffer.from(`synthetic rollback artifact:${name}`).toString("base64"),
        });
        await verifyArtifact(name);
        console.log("synthetic_artifact_created=1");
      }
    }
    const page = await rpc("threads/messages", {
      botId: input.botId, around: { messageId: input.messageId },
    });
    if (!Array.isArray(page?.messages) || page.messages.length === 0) {
      throw new Error("restored messages missing");
    }
    const selected = page.messages.find((message) => message.id === input.messageId);
    if (!selected || !Array.isArray(selected.blocks) || selected.blocks.length === 0) {
      throw new Error("selected encrypted message missing");
    }
    const blocks = page.messages.flatMap((message) => Array.isArray(message.blocks) ? message.blocks : []);
    if (!blocks.length || blocks.some((block) => block && typeof block === "object" && "$sealed" in block)) {
      throw new Error("message blocks not opened");
    }
    console.log(`restored_messages_visible=${page.messages.length}`);
    if (!Array.isArray(input.artifacts) || input.artifacts.length > 3) {
      throw new Error("invalid artifact sample");
    }
    for (const artifact of input.artifacts) {
      const result = await rpc("artifacts/getById", { artifactId: artifact.id });
      const encoded = result?.contentBase64;
      if (typeof encoded !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error("invalid artifact encoding");
      }
      const content = Buffer.from(encoded, "base64");
      if (content.toString("base64") !== encoded || content.length !== artifact.size ||
          createHash("sha256").update(content).digest("hex") !== artifact.hash) {
        throw new Error("artifact mismatch");
      }
    }
    console.log(`restored_artifacts_verified=${input.artifacts.length}`);
    if (!input.outsider?.userId || !input.outsider?.bearer) {
      throw new Error("missing synthetic outsider");
    }
    const outsiderHeaders = { authorization: `Bearer ${input.outsider.bearer}` };
    const outsiderSession = await fetch(`${base}/api/auth/get-session`, { headers: outsiderHeaders });
    if (!outsiderSession.ok || (await outsiderSession.json())?.user?.id !== input.outsider.userId) {
      throw new Error("synthetic outsider session invalid");
    }
    const deniedRoutes = [
      ["bots/list", null],
      ["groups/list", null],
      ["threads/messages", { botId: input.botId, around: { messageId: input.messageId } }],
      ...input.artifacts.map((artifact) => ["artifacts/getById", { artifactId: artifact.id }]),
    ];
    for (const [route, payload] of deniedRoutes) {
      const response = await fetch(`${base}/rpc/${route}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...outsiderHeaders,
          "x-rakazo-space-id": input.spaceId,
        },
        body: JSON.stringify({ json: payload }),
      });
      if (![401, 403, 404].includes(response.status)) throw new Error("outsider access not denied");
    }
    console.log(`authenticated_outsider_denied=${deniedRoutes.length}`);
  } catch {
    console.error("Isolated authentication smoke failed.");
    process.exitCode = 1;
  }
});
