import { ORPCError } from "@orpc/server";
import { expect, it, vi } from "vitest";
import { reportNativeControlRefusal } from "./native-computer-refusal.js";

it("reports a refused native control operation without retrying it", async () => {
  const cause = new Error(
    "Native desktop refused the operation; inspect its result before retrying",
  );
  const action = vi.fn().mockRejectedValue(cause);
  await expect(reportNativeControlRefusal("native-linux", action)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "无法确认云电脑控制状态，请联系管理员检查驱动及电脑连接后重试。",
    cause,
  });
  expect(action).toHaveBeenCalledOnce();
});

it("reports a changed driver generation without replaying the operation", async () => {
  const cause = new Error("native_driver_generation_changed");
  const action = vi.fn().mockRejectedValue(cause);
  await expect(reportNativeControlRefusal("native-linux", action)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "云电脑连接已发生变化，暂时无法接管，请联系管理员检查并恢复连接。",
    cause,
  });
  expect(action).toHaveBeenCalledOnce();
});

it("preserves other providers' errors and unexpected failures", async () => {
  const refusal = new Error(
    "Native desktop refused the operation; inspect its result before retrying",
  );
  const unexpected = new Error("database failure");
  await expect(
    reportNativeControlRefusal("fake", async () => Promise.reject(refusal)),
  ).rejects.toBe(refusal);
  await expect(
    reportNativeControlRefusal("native-linux", async () => Promise.reject(unexpected)),
  ).rejects.toBe(unexpected);
  await expect(
    reportNativeControlRefusal("native-linux", async () => {
      throw new ORPCError("FORBIDDEN");
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
