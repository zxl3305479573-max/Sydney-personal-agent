import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { mountWuyingAssets } from "../src/wuying-assets.js";

export function createWuyingFixtureServer(directory: string) {
  const app = new Hono();
  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    if (new URL(context.req.url).pathname !== "/wuying/sdk/ASP/container.html") {
      context.header("X-Frame-Options", "SAMEORIGIN");
    }
  });
  mountWuyingAssets(app, directory);
  app.get("/", (context) =>
    context.html(
      '<!doctype html><title>App fixture</title><iframe title="Computer screen"></iframe>',
    ),
  );
  app.get("/api/private", (context) => context.text("APP_PRIVATE_DATA"));
  return createServer(getRequestListener(app.fetch));
}
