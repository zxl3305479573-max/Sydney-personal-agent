import { ORPCError } from "@orpc/server";

export async function reportNativeControlRefusal<T>(
  kind: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (
      kind === "native-linux" &&
      error instanceof Error &&
      error.message === "native_driver_generation_changed"
    ) {
      throw new ORPCError("CONFLICT", {
        message: "云电脑连接已发生变化，暂时无法接管，请联系管理员检查并恢复连接。",
        cause: error,
      });
    }
    if (
      kind === "native-linux" &&
      error instanceof Error &&
      error.message === "Native desktop refused the operation; inspect its result before retrying"
    ) {
      throw new ORPCError("CONFLICT", {
        message: "无法确认云电脑控制状态，请联系管理员检查驱动及电脑连接后重试。",
        cause: error,
      });
    }
    throw error;
  }
}
