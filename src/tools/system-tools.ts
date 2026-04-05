import { getPackageName, getPackageVersion } from "../core/package-info.js";

const NPM_REGISTRY_URL = "https://registry.npmjs.org";

type SystemInfoOptions = {
  toolNames: string[];
};

function compareSemver(a: string, b: string): number {
  const aParts = a.split(".").map((part) => parseInt(part, 10) || 0);
  const bParts = b.split(".").map((part) => parseInt(part, 10) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;
    if (aPart !== bPart) return aPart > bPart ? 1 : -1;
  }

  return 0;
}

export function systemInfo(
  options: SystemInfoOptions
): Record<string, unknown> {
  return {
    name: getPackageName(),
    version: getPackageVersion(),
    toolCount: options.toolNames.length,
    tools: [...options.toolNames].sort(),
  };
}

export async function systemCheckUpdate(): Promise<Record<string, unknown>> {
  const packageName = getPackageName();
  const currentVersion = getPackageVersion();
  const registryUrl = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}/latest`;

  try {
    const response = await fetch(registryUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        packageName,
        currentVersion,
        latestVersion: null,
        updateAvailable: null,
        checkedAt: new Date().toISOString(),
        registryUrl,
        error: `Failed to fetch npm metadata: HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as { version?: string };
    const latestVersion = payload.version ?? null;

    return {
      packageName,
      currentVersion,
      latestVersion,
      updateAvailable:
        latestVersion !== null
          ? compareSemver(currentVersion, latestVersion) < 0
          : null,
      checkedAt: new Date().toISOString(),
      registryUrl,
    };
  } catch (error) {
    return {
      packageName,
      currentVersion,
      latestVersion: null,
      updateAvailable: null,
      checkedAt: new Date().toISOString(),
      registryUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
