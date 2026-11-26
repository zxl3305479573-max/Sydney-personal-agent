import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    project.hash = {
      project: {
        rootObject: "ROOT",
        objects: {
          PBXProject: {
            ROOT: { mainGroup: "MAIN", targets: [{ value: "HOST", comment: "Sydney" }] },
          },
          PBXNativeTarget: {
            HOST: {
              name: "Sydney",
              buildPhases: [
                { value: "HOST_SOURCES", comment: "Sources" },
                { value: "OLD", comment: "Copy Files" },
              ],
              dependencies: [],
            },
            HOST_comment: "Sydney",
          },
          PBXSourcesBuildPhase: {
            HOST_SOURCES: { files: [] },
            HOST_SOURCES_comment: "Sources",
          },
          PBXGroup: {
            MAIN: { children: [{ value: "SYDNEY_GROUP", comment: "Sydney" }] },
            MAIN_comment: "Main",
            SYDNEY_GROUP: { children: [], name: "Sydney", path: "Sydney" },
            SYDNEY_GROUP_comment: "Sydney",
            PRODUCTS: { children: [] },
            PRODUCTS_comment: "Products",
          },
          PBXCopyFilesBuildPhase: {
            OLD: { files: [], dstSubfolderSpec: 7 },
            OLD_comment: "Copy Files",
          },
          PBXBuildFile: {
            EXISTING_BUILD: { fileRef: "EXISTING_SWIFT" },
            EXISTING_BUILD_comment: "CompanionWidget.swift in Sources",
          },
          PBXFileReference: {
            EXISTING_SWIFT: { path: '"CompanionWidget.swift"' },
            EXISTING_SWIFT_comment: "CompanionWidget.swift",
            EXISTING_PLIST: { path: '"Info.plist"' },
            EXISTING_PLIST_comment: "Info.plist",
          },
          XCBuildConfiguration: {},
          XCConfigurationList: {},
        },
      },
    };
    const config = withCompanionWidget({
      name: "Sydney",
      slug: "sydney",
      ios: { bundleIdentifier: "xin.example.companion" },
      version: "1.0",
    });
    await config.mods.ios.xcodeproj({
      ...config,
      modResults: project,
      modRequest: { platformProjectRoot: root },
    });
    const objects = project.hash.project.objects;
    const extension = Object.values(objects.PBXNativeTarget).find(
      (entry: any) => entry?.name?.replaceAll('"', "") === "SydneyCompanionWidget",
    ) as { productReference: string; buildPhases: { value: string; comment: string }[] };
    const product = extension.productReference;
    const phases = objects.PBXNativeTarget.HOST.buildPhases
      .map((entry: { value: string }) => objects.PBXCopyFilesBuildPhase[entry.value])
      .filter(Boolean);
    const containing = phases.filter((phase: { files: { value: string }[] }) =>
      phase.files.some((entry) => objects.PBXBuildFile[entry.value]?.fileRef === product),
    );
    expect(containing).toHaveLength(1);
    expect(Number(containing[0].dstSubfolderSpec)).toBe(13);
    expect(objects.PBXCopyFilesBuildPhase.OLD.files).toHaveLength(0);
    expect(objects.PBXNativeTarget.HOST.dependencies).toHaveLength(1);
    const sourcesPhase =
      objects.PBXSourcesBuildPhase[
        extension.buildPhases.find((phase) => phase.comment === "Sources")!.value
      ];
    const sourcePaths = sourcesPhase.files.map((file: { value: string }) =>
      objects.PBXFileReference[objects.PBXBuildFile[file.value].fileRef].path.replaceAll('"', ""),
    );
    expect(sourcePaths.sort()).toEqual([
      "SydneyCompanionWidget/CompanionActivityAttributes.swift",
      "SydneyCompanionWidget/CompanionLiveIntents.swift",
      "SydneyCompanionWidget/CompanionWidget.swift",
    ]);
    const hostSourcePaths = objects.PBXSourcesBuildPhase.HOST_SOURCES.files.map(
      (file: { value: string }) =>
        objects.PBXFileReference[objects.PBXBuildFile[file.value].fileRef].path.replaceAll('"', ""),
    );
    expect(hostSourcePaths.sort()).toEqual([
      "Sydney/CompanionBackgroundIntents.swift",
      "Sydney/CompanionLiveIntents.swift",
    ]);
    expect(fs.existsSync(path.join(root, "Sydney", "CompanionBackgroundIntents.swift"))).toBe(true);
    expect(fs.existsSync(path.join(root, "Sydney", "CompanionLiveIntents.swift"))).toBe(true);
    expect(
      fs.existsSync(path.join(root, "SydneyCompanionWidget", "CompanionBackgroundIntents.swift")),
    ).toBe(false);
    const group = Object.values(objects.PBXGroup).find(
      (entry: any) => entry?.name === "SydneyCompanionWidget",
    ) as { children: { value: string }[]; path?: string };
    expect("path" in group).toBe(false);
    expect(project.writeSync()).not.toContain("path = undefined");
    const groupPaths = group.children.map((entry) =>
      objects.PBXFileReference[entry.value].path.replaceAll('"', ""),
    );
    expect(groupPaths).toContain("SydneyCompanionWidget/Info.plist");
    expect(groupPaths).not.toContain("Info.plist");
    await config.mods.ios.xcodeproj({
      ...config,
      modResults: project,
      modRequest: { platformProjectRoot: root },
    });
    expect(objects.PBXNativeTarget.HOST.dependencies).toHaveLength(1);
    expect(objects.PBXSourcesBuildPhase.HOST_SOURCES.files).toHaveLength(2);
  });

  it("adds an extension once and copies matching attributes into its target", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sydney-companion-"));
    temporaryDirectories.push(root);
    const targets: { uuid: string; name: string; type: string; folder: string; bundle: string }[] =
      [];
    const phases: unknown[][] = [];
    const settings: { buildSettings: Record<string, string> } = {
      buildSettings: { PRODUCT_NAME: '"SydneyCompanionWidget"' },
    };
    const objects = {
      PBXCopyFilesBuildPhase: {} as Record<
        string,
        { files: { value: string }[]; dstSubfolderSpec: number }
      >,
      PBXBuildFile: { product: { fileRef: "product-ref" } },
    };
    const host = { buildPhases: [] as { value: string }[] };
    const project = {
      hash: { project: { objects } },
      pbxTargetByName: (name: string) => targets.find((target) => target.name === name),
      pbxNativeTargetSection: () =>
        Object.fromEntries(targets.map((target) => [target.uuid, target])),
      addTarget: (name: string, type: string, folder: string, bundle: string) => {
        const target = {
          uuid: "target",
          name,
          type,
          folder,
          bundle,
          pbxNativeTarget: { productReference: "product-ref" },
        };
        targets.push(target);
        objects.PBXCopyFilesBuildPhase.copy = {
          files: [{ value: "product" }],
          dstSubfolderSpec: 13,
        };
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
      UIBackgroundModes: ["audio", "screen-capture"],
    });
    expect(typeof plist.modResults.SydneyDefaultApiBase).toBe("string");
    const run = () =>
      config.mods.ios.xcodeproj({
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
    expect(settings.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS).toContain(
      "SYDNEY_COMPANION_WIDGET",
    );
    expect(
      fs.readFileSync(
        path.join(root, "SydneyCompanionWidget", "CompanionActivityAttributes.swift"),
        "utf8",
      ),
    ).toBe(
      fs.readFileSync(
        path.join(
          currentDirectory,
          "../modules/sydney-companion/ios/CompanionActivityAttributes.swift",
        ),
        "utf8",
      ),
    );
    const widgetPlist = fs.readFileSync(
      path.join(root, "SydneyCompanionWidget", "Info.plist"),
      "utf8",
    );
    expect(widgetPlist).toContain("NSSupportsLiveActivities");
    const widgetSwift = fs.readFileSync(
      path.join(root, "SydneyCompanionWidget", "CompanionWidget.swift"),
      "utf8",
    );
    expect(widgetSwift).toContain(".foregroundStyle(.white)");
    expect(widgetSwift).toContain(".foregroundStyle(.primary)");
    expect(widgetSwift).toContain(".activityBackgroundTint(.clear)");
    expect(widgetSwift).toContain(".activityBackgroundTint(nil)");
    expect(widgetSwift).not.toContain("islandSurface");
    expect(widgetSwift).toContain(".widgetAccentedRenderingMode(.fullColor)");
    expect(widgetSwift).toContain(".unredacted()");
    expect(widgetSwift).toContain("decodeWidgetAvatarImage");
    expect(widgetSwift).toContain("EmptyView()");
    expect(widgetSwift).not.toContain(".fixedSize(horizontal: false, vertical: true)");
    expect(widgetSwift).toContain("CompanionVoiceToggleIntent");
    expect(widgetSwift).toContain("CompanionVoiceFinishIntent");
    expect(widgetSwift).toContain("CompanionVoiceCancelIntent");
    expect(widgetSwift).toContain("CompanionVoiceStopSpeakingIntent");
    expect(widgetSwift).toContain("CompanionVoiceCycleOutputIntent");
    expect(widgetSwift).toContain("停止播报");
    expect(widgetSwift).toContain("仅文字");
    expect(widgetSwift).toContain("仅语音");
    expect(widgetSwift).toContain("文字+语音");
    expect(widgetSwift).not.toContain("GeometryReader");
    const liveIntentsSwift = fs.readFileSync(
      path.join(root, "SydneyCompanionWidget", "CompanionLiveIntents.swift"),
      "utf8",
    );
    expect(liveIntentsSwift).toContain("AudioRecordingIntent");
    expect(liveIntentsSwift).toContain("LiveActivityIntent");
    expect(liveIntentsSwift).toContain("CompanionVoiceOutputChoice");
    expect(liveIntentsSwift).toContain("CompanionVoiceStopSpeakingIntent");
    expect(liveIntentsSwift).toContain("CompanionVoiceCycleOutputIntent");
    expect(liveIntentsSwift).toContain("#if !SYDNEY_COMPANION_WIDGET");
    const backgroundIntentsSwift = fs.readFileSync(
      path.join(root, "Sydney", "CompanionBackgroundIntents.swift"),
      "utf8",
    );
    expect(backgroundIntentsSwift).toContain("internal import SydneyCompanion");
    expect(backgroundIntentsSwift).toContain("struct SydneyAskScreenshotIntent: AppIntent");
    expect(backgroundIntentsSwift).toContain("struct SydneyQuickMessageIntent: AppIntent");
    expect(backgroundIntentsSwift).toContain(
      "struct SydneyCompanionShortcuts: AppShortcutsProvider",
    );
    expect(backgroundIntentsSwift).toContain("cropDynamicIsland");
    expect(backgroundIntentsSwift).toContain("updateActiveCompanionIsland");
    expect(backgroundIntentsSwift).toContain("CompanionBackgroundVoiceManager");
    expect(backgroundIntentsSwift).toContain("CompanionVoiceOutputMode");
    expect(backgroundIntentsSwift).toContain("cycleCompanionVoiceOutputMode");
    expect(backgroundIntentsSwift).toContain("thread.progress");
    expect(backgroundIntentsSwift).toContain("正在播报");
    expect(backgroundIntentsSwift).toContain("overrideOutputAudioPort(.speaker)");
    for (const key of [
      "rakazo.session_token",
      "rakazo.api_base",
      "rakazo.space_id",
      "rakazo.server_headers",
      "rakazo.last_bot_id",
      "rakazo.last_bot_space_id",
      "sydney.mobile.companionPrefs.v1",
    ]) {
      expect(backgroundIntentsSwift).toContain(`companionSecureStoreItem("${key}")`);
    }
    const hostSwift = fs.readFileSync(
      path.join(currentDirectory, "../modules/sydney-companion/ios/SydneyCompanionModule.swift"),
      "utf8",
    );
    expect(hostSwift).toContain('Function("supportsBotNotifications")');
    expect(hostSwift).toContain('Function("getVoiceOutputMode")');
    expect(hostSwift).toContain('Function("isBackgroundVoiceActive")');
    expect(hostSwift).toContain('AsyncFunction("setVoiceOutputMode")');
    expect(hostSwift).toContain('AsyncFunction("scheduleBotNotification")');
    expect(hostSwift).toContain("CompanionVoiceBridge");
    expect(hostSwift).toContain('"正在播报"');
    expect(hostSwift).toContain("INSendMessageIntent");
    expect(hostSwift).toContain("UNNotificationAttachment");
    expect(hostSwift).toContain("renderBotNotificationAvatarPNG");
    expect(hostSwift).toContain("preferredRange = .standard");
    expect(hostSwift).toContain("jpegData(compressionQuality:");
    expect(hostSwift).not.toContain("UTType.heic");
    expect(hostSwift).toContain("cleanReplyForIsland");
    const podspec = fs.readFileSync(
      path.join(currentDirectory, "../modules/sydney-companion/ios/SydneyCompanion.podspec"),
      "utf8",
    );
    expect(podspec).toContain("'Intents'");
    expect(podspec).toContain("'UserNotifications'");
    const appJson = JSON.parse(
      fs.readFileSync(path.join(currentDirectory, "../app.json"), "utf8"),
    ) as { expo?: { ios?: { infoPlist?: { NSUserActivityTypes?: string[] } } } };
    expect(appJson.expo?.ios?.infoPlist?.NSUserActivityTypes).toContain("INSendMessageIntent");
  });
});
