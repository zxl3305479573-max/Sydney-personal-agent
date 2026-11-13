const fs = require("node:fs");
const path = require("node:path");
const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");

const TARGET = "SydneyCompanionWidget";
const FILES = ["CompanionWidget.swift", "CompanionActivityAttributes.swift"];

function withCompanionWidget(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.SydneyCompanionEnabled = true;
    mod.modResults.UIBackgroundModes = [
      ...new Set([...(mod.modResults.UIBackgroundModes ?? []), "screen-capture"]),
    ];
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const root = mod.modRequest.platformProjectRoot;
    const targetDir = path.join(root, TARGET);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(path.join(__dirname, "..", "ios-companion-widget"), targetDir, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, "..", "modules", "sydney-companion", "ios", "CompanionActivityAttributes.swift"),
      path.join(targetDir, "CompanionActivityAttributes.swift"),
    );
    const existingTarget = Object.values(project.pbxNativeTargetSection())
      .some((entry) => typeof entry === "object" && entry?.name?.replaceAll('"', "") === TARGET);
    if (!existingTarget) {
      const objects = project.hash.project.objects;
      objects.PBXTargetDependency ??= {};
      objects.PBXContainerItemProxy ??= {};
      const target = project.addTarget(
        TARGET, "app_extension", TARGET, `${mod.ios.bundleIdentifier}.companion`,
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
      const sourceFiles = FILES.map((file) => `${TARGET}/${file}`);
      const group = project.addPbxGroup([...sourceFiles, `${TARGET}/Info.plist`], TARGET);
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
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: '"1,2"',
      });
    }
    return mod;
  });
}

module.exports = withCompanionWidget;
