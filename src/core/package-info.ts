import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type PackageJson = {
  name?: string;
  version?: string;
};

let cachedPackageInfo: PackageJson | null = null;

function loadPackageInfo(): PackageJson {
  if (cachedPackageInfo) return cachedPackageInfo;

  const packageJsonPath = fileURLToPath(
    new URL("../../package.json", import.meta.url)
  );
  const raw = readFileSync(packageJsonPath, "utf-8");
  cachedPackageInfo = JSON.parse(raw) as PackageJson;
  return cachedPackageInfo;
}

export function getPackageName(): string {
  return loadPackageInfo().name ?? "tlc-portal-mcp";
}

export function getPackageVersion(): string {
  return loadPackageInfo().version ?? "0.0.0";
}
