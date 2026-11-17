import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
const withCompanionWidget = require("../plugins/with-companion-widget");

const temporaryDirectories: string[] = [];
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const expoRequire = createRequire(require.resolve("expo/config-plugins"));
const xcode = expoRequire("xcode");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("isolated companion widget plugin", () => {
  it("embeds the extension in PlugIns even when the host already has a Copy Files phase", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sydney-companion-real-"));
    temporaryDirectories.push(root);
    const project = xcode.project(path.join(root, "project.pbxproj"));
    project.hash = { project: { rootObject: "ROOT", objects: {
      PBXProject: { ROOT: { mainGroup: "MAIN", targets: [{ value: "HOST", comment: "Sydney" }] } },
      PBXNativeTarget: { HOST: { name: "Sydney", buildPhases: [{ value: "OLD", comment: "Copy Files" }], dependencies: [] }, HOST_comment: "Sydney" },
      PBXGroup: { MAIN: { children: [] }, MAIN_comment: "Main", PRODUCTS: { children: [] }, PRODUCTS_comment: "Products" },
      PBXCopyFilesBuildPhase: { OLD: { files: [], dstSubfolderSpec: 7 }, OLD_comment: "Copy Files" },
      PBXBuildFile: { EXISTING_BUILD: { fileRef: "EXISTING_SWIFT" }, EXISTING_BUILD_comment: "CompanionWidget.swift in Sources" },
      PBXFileReference: {
        EXISTING_SWIFT: { path: '"CompanionWidget.swift"' }, EXISTING_SWIFT_comment: "CompanionWidget.swift",
        EXISTING_PLIST: { path: '"Info.plist"' }, EXISTING_PLIST_comment: "Info.plist",
      },
      XCBuildConfiguration: {}, XCConfigurationList: {},
    } } };
    const config = withCompanionWidget({
      name: "Sydney", slug: "sydney", ios: { bundleIdentifier: "xin.example.companion" }, version: "1.0",
    });
    await config.mods.ios.xcodeproj({ ...config, modResults: project, modRequest: { platformProjectRoot: root } });
    const objects = project.hash.project.objects;
    const extension = Object.values(objects.PBXNativeTarget).find(
      (entry: any) => entry?.name?.replaceAll('"', "") === "SydneyCompanionWidget",
    ) as { productReference: string; buildPhases: { value: string; comment: string }[] };
    const product = extension.productReference;
    const phases = objects.PBXNativeTarget.HOST.buildPhases
      .map((entry: { value: string }) => objects.PBXCopyFilesBuildPhase[entry.value])
      .filter(Boolean);
    const containing = phases.filter((phase: { files: { value: string }[] }) =>
      phase.files.some((entry) => objects.PBXBuildFile[entry.value]?.fileRef === product));
    expect(containing).toHaveLength(1);
    expect(Number(containing[0].dstSubfolderSpec)).toBe(13);
    expect(objects.PBXCopyFilesBuildPhase.OLD.files).toHaveLength(0);
    expect(objects.PBXNativeTarget.HOST.dependencies).toHaveLength(1);
    const sourcesPhase = objects.PBXSourcesBuildPhase[extension.buildPhases.find((phase) => phase.comment === "Sources")!.value];
    const sourcePaths = sourcesPhase.files.map((file: { value: string }) =>
      objects.PBXFileReference[objects.PBXBuildFile[file.value].fileRef].path.replaceAll('"', ""));
    expect(sourcePaths.sort()).toEqual([
      "SydneyCompanionWidget/CompanionActivityAttributes.swift",
      "SydneyCompanionWidget/CompanionWidget.swift",
    ]);
    const group = Object.values(objects.PBXGroup).find((entry: any) => entry?.name === "SydneyCompanionWidget") as { children: { value: string }[] };
    const groupPaths = group.children.map((entry) => objects.PBXFileReference[entry.value].path.replaceAll('"', ""));
    expect(groupPaths).toContain("SydneyCompanionWidget/Info.plist");
    expect(groupPaths).not.toContain("Info.plist");
    await config.mods.ios.xcodeproj({ ...config, modResults: project, modRequest: { platformProjectRoot: root } });
    expect(objects.PBXNativeTarget.HOST.dependencies).toHaveLength(1);
  });

  it("adds an extension once and copies matching attributes into its target", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sydney-companion-"));
    temporaryDirectories.push(root);
    const targets: { uuid: string; name: string; type: string; folder: string; bundle: string }[] = [];
    const phases: unknown[][] = [];
    const settings: { buildSettings: Record<string, string> } = {
      buildSettings: { PRODUCT_NAME: '"SydneyCompanionWidget"' },
    };
    const objects = {
      PBXCopyFilesBuildPhase: {} as Record<string, { files: { value: string }[]; dstSubfolderSpec: number }>,
      PBXBuildFile: { product: { fileRef: "product-ref" } },
    };
    const host = { buildPhases: [] as { value: string }[] };
    const project = {
      hash: { project: { objects } },
      pbxTargetByName: (name: string) => targets.find((target) => target.name === name),
      pbxNativeTargetSection: () => Object.fromEntries(targets.map((target) => [target.uuid, target])),
      addTarget: (name: string, type: string, folder: string, bundle: string) => {
        const target = { uuid: "target", name, type, folder, bundle, pbxNativeTarget: { productReference: "product-ref" } };
        targets.push(target);
        objects.PBXCopyFilesBuildPhase.copy = { files: [{ value: "product" }], dstSubfolderSpec: 13 };
        host.buildPhases.push({ value: "copy" });
        return target;
      },
      addPbxGroup: (files: string[]) => ({ uuid: "group", files }),
      addToPbxGroup: () => {},
      getFirstProject: () => ({ firstProject: { mainGroup: "main" } }),
      getFirstTarget: () => ({ firstTarget: host }),
      addBuildPhase: (...args: unknown[]) => phases.push(args),
      pbxXCBuildConfigurationSection: () => ({ configuration: settings }),
    };
    const config = withCompanionWidget({
      name: "Sydney",
      slug: "sydney",
      ios: { bundleIdentifier: "xin.example.companion", buildNumber: "5" },
      version: "2.0",
    });
    const plist = await config.mods.ios.infoPlist({ modResults: {}, modRequest: {} });
    expect(plist.modResults).toMatchObject({
      NSSupportsLiveActivities: true,
      SydneyCompanionEnabled: true,
      UIBackgroundModes: ["screen-capture"],
    });
    const run = () => config.mods.ios.xcodeproj({
      ...config,
      modResults: project,
      modRequest: { platformProjectRoot: root },
    });
    await run();
    await run();
    expect(targets).toHaveLength(1);
    expect(targets[0]?.bundle).toBe("xin.example.companion.companion");
    expect(phases).toHaveLength(2);
    expect(settings.buildSettings.INFOPLIST_FILE).toBe("SydneyCompanionWidget/Info.plist");
    expect(settings.buildSettings.CURRENT_PROJECT_VERSION).toBe("5");
    expect(fs.readFileSync(path.join(root, "SydneyCompanionWidget", "CompanionActivityAttributes.swift"), "utf8"))
      .toBe(fs.readFileSync(path.join(currentDirectory, "../modules/sydney-companion/ios/CompanionActivityAttributes.swift"), "utf8"));
  });
});
