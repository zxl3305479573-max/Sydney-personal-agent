import type { SandboxProvider } from "@rakazo/adapter-kit";
import { SandboxKind } from "@rakazo/contracts";
import { BoatSandboxProvider } from "./boat-sandbox.js";
import { BoxdSandboxProvider } from "./boxd-sandbox.js";
import { CreateOSSandboxProvider } from "./createos-sandbox.js";
import { DaytonaSandboxProvider } from "./daytona-sandbox.js";
import { assertHostCommandsAllowed, DesktopSandboxProvider } from "./desktop-sandbox.js";
import { DockerSandboxProvider } from "./docker-sandbox.js";
import { E2BSandboxProvider } from "./e2b-sandbox.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import type { KubernetesSandboxOptions } from "./kubernetes-sandbox.js";
import { KubernetesSandboxProvider } from "./kubernetes-sandbox.js";
import { createNativeLinuxTransport, NativeLinuxSandbox } from "./native-linux-sandbox.js";
import { NoneSandboxProvider } from "./none-sandbox.js";
import { NovitaSandboxProvider } from "./novita-sandbox.js";
import { RailwaySandboxProvider } from "./railway-sandbox.js";

export interface SandboxProviderOptions {
  hostComputerUrl?: string;
  hostComputerToken?: string;
  supervisorUrl?: string;
  supervisorToken?: string;
  e2bApiKey?: string;
  novitaApiKey?: string;
  sandboxTemplate?: string;
  onUnsafeStop?: (providerRef: string) => Promise<void>;
  daytonaApiKey?: string;
  daytonaApiUrl?: string;
  daytonaTarget?: string;
  createosApiKey?: string;
  createosBaseUrl?: string;
  createosShape?: string;
  createosRootfs?: string;
  railwayApiToken?: string;
  railwayEnvironmentId?: string;
  railwayMaxWorkspaceFileBytes?: string;
  railwaySandboxRegion?: string;
  boatApiKey?: string;
  boatApiUrl?: string;
  boxdApiKey?: string;
  boxdOrg?: string;
  kubernetesNamespace?: string;
  kubernetesRuntimeClassName?: string;
  kubernetesComputerImage?: string;
  kubernetesCpuLimit?: string;
  kubernetesMemoryLimit?: string;
  kubernetesPodAnnotations?: KubernetesSandboxOptions["podAnnotations"];
  kubernetesPodLabels?: KubernetesSandboxOptions["podLabels"];
  kubernetesReadyTimeoutMs?: number;
  kubernetesHomeClaim?: string;
  kubernetesHomeColocateNamespace?: string;
  kubernetesHomeColocateLabels?: KubernetesSandboxOptions["homeColocateLabels"];
  wuyingAccessKeyId?: string;
  wuyingAccessKeySecret?: string;
  wuyingRegionId?: string;
  wuyingDesktopId?: string;
  wuyingEndUserId?: string;
  wuyingMcpUrl?: string;
  wuyingMcpToken?: string;
  dataDir?: string;
  nativeLinuxSocketPath?: string;
  nativeLinuxScreenUserId?: string;
  nativeLinuxScreenSpaceId?: string;
  nativeLinuxScreenBotId?: string;
  nativeLinuxScreenPort?: number;
}

function missingRemoteKey(
  provider: "novita" | "e2b" | "daytona" | "createos" | "boat" | "boxd" | "railway" | "wuying",
  envName: string,
): SandboxProvider {
  return new NoneSandboxProvider(
    `Computers unavailable: ${envName} is required for SANDBOX_PROVIDER=${provider}.`,
  );
}

export async function createSandboxProvider(
  kind: string,
  opts: SandboxProviderOptions,
): Promise<SandboxProvider> {
  if (kind === "") return new NoneSandboxProvider();
  const parsed = SandboxKind.safeParse(kind);
  if (!parsed.success) {
    throw new Error(
      `Unknown SANDBOX_PROVIDER "${kind}". Use none | docker | native-linux | e2b | novita | daytona | createos | boat | boxd | railway | kubernetes | wuying | desktop | fake.`,
    );
  }
  const sandboxKind = parsed.data;
  switch (sandboxKind) {
    case "none":
      return new NoneSandboxProvider();
    case "e2b":
      if (!opts.e2bApiKey?.trim()) return missingRemoteKey("e2b", "E2B_API_KEY");
      return new E2BSandboxProvider(opts.e2bApiKey);
    case "novita":
      if (!opts.novitaApiKey?.trim()) return missingRemoteKey("novita", "NOVITA_API_KEY");
      return new NovitaSandboxProvider({
        apiKey: opts.novitaApiKey,
        template: opts.sandboxTemplate,
        onUnsafeStop: opts.onUnsafeStop,
      });
    case "daytona":
      if (!opts.daytonaApiKey?.trim()) return missingRemoteKey("daytona", "DAYTONA_API_KEY");
      return new DaytonaSandboxProvider({
        apiKey: opts.daytonaApiKey,
        apiUrl: opts.daytonaApiUrl,
        target: opts.daytonaTarget,
      });
    case "createos":
      if (!opts.createosApiKey?.trim())
        return missingRemoteKey("createos", "CREATEOS_SANDBOX_API_KEY");
      return new CreateOSSandboxProvider({
        apiKey: opts.createosApiKey,
        baseUrl: opts.createosBaseUrl,
        shape: opts.createosShape,
        rootfs: opts.createosRootfs,
      });
    case "boat":
      if (!opts.boatApiKey?.trim()) return missingRemoteKey("boat", "BOAT_API_KEY");
      return new BoatSandboxProvider({ apiKey: opts.boatApiKey, apiUrl: opts.boatApiUrl });
    case "boxd":
      if (!opts.boxdApiKey?.trim()) return missingRemoteKey("boxd", "BOXD_API_KEY");
      return new BoxdSandboxProvider({ apiKey: opts.boxdApiKey, org: opts.boxdOrg });
    case "railway":
      if (!opts.railwayApiToken?.trim()) return missingRemoteKey("railway", "RAILWAY_API_TOKEN");
      if (!opts.railwayEnvironmentId?.trim())
        return missingRemoteKey("railway", "RAILWAY_ENVIRONMENT_ID");
      return new RailwaySandboxProvider({
        token: opts.railwayApiToken,
        environmentId: opts.railwayEnvironmentId,
        maxWorkspaceFileBytes: opts.railwayMaxWorkspaceFileBytes,
        region: opts.railwaySandboxRegion,
      });
    case "kubernetes":
      return new KubernetesSandboxProvider({
        namespace: opts.kubernetesNamespace,
        runtimeClassName: opts.kubernetesRuntimeClassName,
        computerImage: opts.kubernetesComputerImage,
        cpuLimit: opts.kubernetesCpuLimit,
        memoryLimit: opts.kubernetesMemoryLimit,
        podAnnotations: opts.kubernetesPodAnnotations,
        podLabels: opts.kubernetesPodLabels,
        readyTimeoutMs: opts.kubernetesReadyTimeoutMs,
        homeClaim: opts.kubernetesHomeClaim,
        homeColocateNamespace: opts.kubernetesHomeColocateNamespace,
        homeColocateLabels: opts.kubernetesHomeColocateLabels,
      });
    case "wuying": {
      const required = {
        WUYING_ACCESS_KEY_ID: opts.wuyingAccessKeyId,
        WUYING_ACCESS_KEY_SECRET: opts.wuyingAccessKeySecret,
        WUYING_DESKTOP_ID: opts.wuyingDesktopId,
        WUYING_END_USER_ID: opts.wuyingEndUserId,
        WUYING_MCP_URL: opts.wuyingMcpUrl,
        WUYING_MCP_TOKEN: opts.wuyingMcpToken,
      };
      const missing = Object.entries(required).find(([, value]) => !value?.trim());
      if (missing) return missingRemoteKey("wuying", missing[0]);
      const { WuyingSandboxProvider } = await import("./wuying-sandbox.js");
      return WuyingSandboxProvider.fromOptions({
        accessKeyId: opts.wuyingAccessKeyId ?? "",
        accessKeySecret: opts.wuyingAccessKeySecret ?? "",
        regionId: opts.wuyingRegionId,
        desktopId: opts.wuyingDesktopId ?? "",
        endUserId: opts.wuyingEndUserId ?? "",
        mcpUrl: opts.wuyingMcpUrl ?? "",
        mcpToken: opts.wuyingMcpToken ?? "",
      });
    }
    case "docker":
      return new DockerSandboxProvider(
        opts.supervisorUrl ?? "http://127.0.0.1:7091",
        opts.supervisorToken,
      );
    case "desktop":
      assertHostCommandsAllowed();
      return new DesktopSandboxProvider({
        root: opts.dataDir,
      });
    case "native-linux":
      if (!opts.nativeLinuxSocketPath?.trim()) {
        return new NoneSandboxProvider(
          "Native Linux computer is unavailable: SYDNEY_NATIVE_DRIVER_SOCKET is not configured.",
        );
      }
      {
        return new NativeLinuxSandbox(
          async (context) => {
            const lease = context.nativeRunLease;
            if (
              !lease ||
              !context.runId ||
              !lease.owner ||
              !Number.isInteger(lease.fence) ||
              lease.fence < 1 ||
              typeof lease.validate !== "function"
            ) {
              return null;
            }
            return lease.validate();
          },
          createNativeLinuxTransport(opts.nativeLinuxSocketPath),
          opts.nativeLinuxScreenUserId &&
          opts.nativeLinuxScreenSpaceId &&
          opts.nativeLinuxScreenPort
            ? {
                userId: opts.nativeLinuxScreenUserId,
                spaceId: opts.nativeLinuxScreenSpaceId,
                ...(opts.nativeLinuxScreenBotId
                  ? { botId: opts.nativeLinuxScreenBotId }
                  : {}),
                port: opts.nativeLinuxScreenPort,
              }
            : undefined,
        );
      }
    case "fake":
      return new FakeSandboxProvider();
    default: {
      const _exhaustive: never = sandboxKind;
      throw new Error(
        `Unknown SANDBOX_PROVIDER "${_exhaustive}". Use none | docker | e2b | novita | daytona | createos | boat | boxd | railway | kubernetes | wuying | desktop | fake.`,
      );
    }
  }
}
