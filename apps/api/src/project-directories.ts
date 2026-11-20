import {
  BindProjectDirectoryInput,
  PROJECT_DIRECTORY_PATH,
  ProjectDirectoryInput,
} from "@rakazo/contracts";
import {
  bindProjectDirectory,
  getProjectWorkspace,
  recordSecurityEvent,
  runAsSystem,
} from "@rakazo/db";
import type { Hono } from "hono";
import { readBoundedBody } from "./http-body.js";
import type { UserDeviceRouteDeps } from "./user-devices.js";

export function mountProjectDirectoryRoutes(app: Hono, deps: UserDeviceRouteDeps) {
  for (const operation of ["scope", "bind"] as const) {
    app.post(`${PROJECT_DIRECTORY_PATH}/${operation}`, async (context) => {
      if (!deps.projectDirectoriesEnabled) return context.json({ error: "Not available" }, 503);
      const origin = context.req.header("origin");
      if (origin && !deps.trustedOrigin(origin)) return context.json({ error: "Forbidden" }, 403);
      if (!context.req.header("content-type")?.startsWith("application/json"))
        return context.json({ error: "Expected JSON" }, 415);
      const session = await deps.session(context.req.raw);
      const device = await deps.hub.authenticate(context.req.header("authorization"));
      if (!session || !device || session.userId !== device.userId)
        return context.json({ error: "Unauthorized" }, 401);
      const paired = await runAsSystem("check project directory pairing session", () =>
        deps.prisma.userDevice.findFirst({
          where: {
            id: device.id,
            userId: session.userId,
            sessionId: session.sessionId,
            revokedAt: null,
          },
          select: { id: true },
        }),
      );
      if (!paired) return context.json({ error: "Unauthorized" }, 401);
      const body = await readBoundedBody(context.req.raw, 4096);
      if (body === null) return context.json({ error: "Request too large" }, 413);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return context.json({ error: "Invalid request" }, 400);
      }
      const input =
        operation === "scope"
          ? ProjectDirectoryInput.safeParse(parsed)
          : BindProjectDirectoryInput.safeParse(parsed);
      if (!input.success) return context.json({ error: "Invalid request" }, 400);
      const actor = { userId: session.userId, spaceId: input.data.spaceId };
      const project = await getProjectWorkspace(deps.prisma, actor, input.data.projectId);
      if (!project) return context.json({ error: "Not found" }, 404);
      if (operation === "scope")
        return context.json({
          ...actor,
          deviceId: device.id,
          projectId: project.id,
          projectName: project.name,
        });
      const bindingInput = BindProjectDirectoryInput.parse(input.data);
      const binding = await bindProjectDirectory(
        deps.prisma,
        actor,
        project.id,
        session.sessionId,
        {
          deviceId: device.id,
          grantId: bindingInput.grantId,
          directoryName: bindingInput.directoryName,
          intent: bindingInput.intent,
        },
      );
      if (!binding) return context.json({ error: "Project binding changed" }, 409);
      await recordSecurityEvent({
        type: "project.directory.bound",
        ...actor,
        metadata: {
          projectId: project.id,
          deviceId: device.id,
          grantId: binding.grantId,
          intent: binding.intent,
        },
      });
      return context.json(binding);
    });
  }
}
