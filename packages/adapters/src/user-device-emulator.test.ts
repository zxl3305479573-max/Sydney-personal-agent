import { expect, it } from "vitest";
import { UserDeviceEmulator } from "./user-device-emulator.js";

it.each(["status", "revoke"] as const)(
  "does not fabricate a local grant for emulated %s",
  async (operation) => {
    const devices = new UserDeviceEmulator();
    const values: unknown[] = [];
    for await (const value of devices.request(
      "user-a",
      {
        method: "workspaceGrant",
        operation,
        spaceId: "space-a",
        projectId: "project-a",
        grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72",
      },
      new AbortController().signal,
    ))
      values.push(value);
    expect(values).toEqual([{ state: "unavailable" }]);
    expect(devices.requests).toEqual([]);
  },
);
