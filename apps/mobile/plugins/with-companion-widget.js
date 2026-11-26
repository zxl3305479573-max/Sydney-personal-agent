const fs = require("node:fs");
const path = require("node:path");
const { IOSConfig, withInfoPlist, withXcodeProject } = require("expo/config-plugins");

const TARGET = "SydneyCompanionWidget";
const WIDGET_SOURCE_FILES = [
  "CompanionWidget.swift",
  "CompanionActivityAttributes.swift",
  "CompanionLiveIntents.swift",
];
const HOST_INTENT_FILES = ["CompanionLiveIntents.swift", "CompanionBackgroundIntents.swift"];
const WIDGET_SOURCE_DIR = path.join(__dirname, "..", "ios-companion-widget");

function resolveHostName(mod, project) {
  const firstTarget = project.getFirstTarget?.()?.firstTarget;
  const fromTarget = firstTarget?.name?.replaceAll('"', "");
  if (fromTarget && fromTarget !== TARGET) return fromTarget;
  if (mod.modRequest?.projectRoot) {
    try {
      return IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    } catch {
      // Fall through to app config name in synthetic test fixtures.
    }
  }
  return mod.name || "Sydney";
}

function withCompanionWidget(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.SydneyCompanionEnabled = true;
    mod.modResults.SydneyDefaultApiBase =
      process.env.EXPO_PUBLIC_API_URL ?? "https://124.221.182.39";
    mod.modResults.UIBackgroundModes = [
      ...new Set([...(mod.modResults.UIBackgroundModes ?? []), "audio", "screen-capture"]),
    ];
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const root = mod.modRequest.platformProjectRoot;
    const hostName = resolveHostName(mod, project);
    const hostDir = path.join(root, hostName);
    fs.mkdirSync(hostDir, { recursive: true });
    const hostTargetUuid = project.getFirstTarget?.()?.uuid;
    for (const file of HOST_INTENT_FILES) {
      fs.copyFileSync(path.join(WIDGET_SOURCE_DIR, file), path.join(hostDir, file));
      const filepath = `${hostName}/${file}`;
      if (
        typeof project.hasFile === "function" &&
        typeof project.pbxGroupByName === "function" &&
        project.pbxGroupByName(hostName) &&
        !project.hasFile(filepath)
      ) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath,
          groupName: hostName,
          project,
          targetUuid: hostTargetUuid,
        });
      }
    }

    const targetDir = path.join(root, TARGET);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of ["CompanionWidget.swift", "CompanionLiveIntents.swift", "Info.plist"]) {
      fs.copyFileSync(path.join(WIDGET_SOURCE_DIR, file), path.join(targetDir, file));
    }
    fs.copyFileSync(
      path.join(
        __dirname,
        "..",
        "modules",
        "sydney-companion",
        "ios",
        "CompanionActivityAttributes.swift",
      ),
      path.join(targetDir, "CompanionActivityAttributes.swift"),
    );
    const existingTarget = Object.values(project.pbxNativeTargetSection()).some(
      (entry) => typeof entry === "object" && entry?.name?.replaceAll('"', "") === TARGET,
    );
    if (!existingTarget) {
      const objects = project.hash.project.objects;
      objects.PBXTargetDependency ??= {};
      objects.PBXContainerItemProxy ??= {};
      const target = project.addTarget(
        TARGET,
        "app_extension",
        TARGET,
        `${mod.ios.bundleIdentifier}.companion`,
      );
      const host = project.getFirstTarget().firstTarget;
      const copyPhases = host.buildPhases
        .map((entry) => objects.PBXCopyFilesBuildPhase?.[entry.value])
        .filter(Boolean);
      const destination = copyPhases[copyPhases.length - 1];
      const productRef = target.pbxNativeTarget.productReference;
      let productBuildFile;
      for (const phase of copyPhases) {
        phase.files = phase.files.filter((file) => {
          if (objects.PBXBuildFile[file.value]?.fileRef !== productRef) return true;
          productBuildFile ??= file;
          return false;
        });
      }
      if (!destination || !productBuildFile || String(destination.dstSubfolderSpec) !== "13") {
        throw new Error("Cannot embed the companion extension in the app PlugIns directory.");
      }
      destination.files.push(productBuildFile);
      const sourceFiles = WIDGET_SOURCE_FILES.map((file) => `${TARGET}/${file}`);
      const group = project.addPbxGroup([...sourceFiles, `${TARGET}/Info.plist`], TARGET, "");
      if (group.pbxGroup) delete group.pbxGroup.path;
      project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
      project.addBuildPhase(sourceFiles, "PBXSourcesBuildPhase", "Sources", target.uuid);
      project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
    }
    for (const entry of Object.values(project.pbxXCBuildConfigurationSection())) {
      if (entry.buildSettings?.PRODUCT_NAME?.replaceAll('"', "") !== TARGET) continue;
      Object.assign(entry.buildSettings, {
        APPLICATION_EXTENSION_API_ONLY: "YES",
        CODE_SIGN_STYLE: "Automatic",
        CURRENT_PROJECT_VERSION: mod.ios?.buildNumber ?? "1",
        GENERATE_INFOPLIST_FILE: "NO",
        INFOPLIST_FILE: `${TARGET}/Info.plist`,
        IPHONEOS_DEPLOYMENT_TARGET: "16.4",
        MARKETING_VERSION: mod.version ?? "1.0",
        SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"$(inherited) SYDNEY_COMPANION_WIDGET"',
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: '"1,2"',
      });
    }
    return mod;
  });
}

module.exports = withCompanionWidget;
