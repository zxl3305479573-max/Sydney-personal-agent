import { USER_DEVICE_PATH, userDeviceListSchema } from "@rakazo/contracts";
import { cancelResponseBody, readBoundedJsonResponse, withAbort } from "@rakazo/core";
import { captureApiRequestContext, currentApiBase } from "./api";
import { fetchServer } from "./server-headers";
import { currentSessionGeneration } from "./session";

export class DeviceListError extends Error {
  constructor(readonly kind: "auth" | "unavailable" | "network" | "timeout" | "invalid") {
    super(kind);
  }
}

export async function listUserDevices(signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DeviceListError("timeout")), 8_000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const context = await withAbort(captureApiRequestContext(null), controller.signal);
    if (!context.headers.authorization) throw new DeviceListError("auth");
    let response: Response;
    try {
      response = await withAbort(
        fetchServer(
          `${context.apiBase}${USER_DEVICE_PATH}`,
          { headers: context.headers, signal: controller.signal, redirect: "error" },
          context.apiBase,
        ),
        controller.signal,
        "Request cancelled",
      );
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new DeviceListError("network");
    }
    if (!response.ok) {
      cancelResponseBody(response);
      throw new DeviceListError(
        response.status === 401 ? "auth" : response.status === 404 ? "unavailable" : "invalid",
      );
    }
    const body = await readBoundedJsonResponse<unknown>(response, 64 * 1024, controller.signal);
    const devices = userDeviceListSchema.parse(body).devices;
    if (
      controller.signal.aborted ||
      context.apiBase !== currentApiBase() ||
      context.sessionGeneration !== currentSessionGeneration()
    )
      throw new Error("Session changed");
    return devices;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof DeviceListError) throw error;
    throw new DeviceListError("invalid");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
