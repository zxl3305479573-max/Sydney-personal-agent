import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { mountNativePasswordReset } from "../src/native-password-reset.js";
import { mountApiRequestBodyLimits } from "../src/request-body-limit.js";

export function createPasswordResetFixtureServer() {
  const app = new Hono();
  mountApiRequestBodyLimits(app);
  mountNativePasswordReset(app);
  let attempts = 0;
  let consumed = false;
  app.post("/api/auth/reset-password", async (context) => {
    attempts++;
    const body = await context.req.json();
    if (attempts === 1) return context.json({ message: "Synthetic rate limit" }, 429);
    if (
      consumed ||
      body.token !== "abcdefghijklmnop123456" ||
      body.newPassword !== "offline-password34"
    ) {
      return context.json({ message: "Invalid request" }, 400);
    }
    consumed = true;
    return context.json({ status: true });
  });
  return { server: createServer(getRequestListener(app.fetch)), attempts: () => attempts };
}
