import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const withSydneyCompanionAutolinking = require("../plugins/with-sydney-companion-autolinking");
const directories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it("excludes the companion in ordinary iOS builds and restores it for the experiment", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sydney-autolinking-"));
  directories.push(directory);
  const podfile = path.join(directory, "Podfile");
  fs.writeFileSync(podfile, "target 'Sydney' do\n  use_expo_modules!\nend\n");
  const config = withSydneyCompanionAutolinking({ name: "Sydney", slug: "sydney" });
  const run = () =>
    config.mods.ios.dangerous({
      ...config,
      modRequest: { platformProjectRoot: directory },
    });

  vi.stubEnv("SYDNEY_COMPANION_EXPERIMENT", "0");
  await run();
  await run();
  expect(fs.readFileSync(podfile, "utf8")).toContain(
    'use_expo_modules!(exclude: ["sydney-companion"])',
  );
  vi.stubEnv("SYDNEY_COMPANION_EXPERIMENT", "1");
  await run();
  expect(fs.readFileSync(podfile, "utf8")).toContain("use_expo_modules!\n");
  expect(fs.readFileSync(podfile, "utf8")).not.toContain("sydney-companion");
});

it("rejects an unfamiliar Podfile call instead of corrupting it", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sydney-autolinking-"));
  directories.push(directory);
  const podfile = path.join(directory, "Podfile");
  const source = "target 'Sydney' do\n  use_expo_modules!(custom: true)\nend\n";
  fs.writeFileSync(podfile, source);
  vi.stubEnv("SYDNEY_COMPANION_EXPERIMENT", "0");
  const config = withSydneyCompanionAutolinking({ name: "Sydney", slug: "sydney" });
  await expect(
    config.mods.ios.dangerous({
      ...config,
      modRequest: { platformProjectRoot: directory },
    }),
  ).rejects.toThrow("bare use_expo_modules!");
  expect(fs.readFileSync(podfile, "utf8")).toBe(source);
});
