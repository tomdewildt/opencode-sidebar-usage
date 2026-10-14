export const PLUGIN_ID = "tomdewildt.sidebar.usage";

export type UsageWindow = {
  label: string;
  usedPercent: number;
  resetsAt?: number;
};

export type UsageError = "sign_in" | "unavailable";

export type ProviderUsage = {
  id: string;
  name: string;
  windows: UsageWindow[];
  fetchedAt?: number;
  error?: UsageError;
};

export type Snapshot = {
  providers: ProviderUsage[];
};

export const EMPTY_SNAPSHOT: Snapshot = { providers: [] };

function isUsageWindow(value: unknown): value is UsageWindow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const window = value as Record<string, unknown>;
  return (
    typeof window.label === "string" &&
    typeof window.usedPercent === "number" &&
    (window.resetsAt === undefined || typeof window.resetsAt === "number")
  );
}

function isProviderUsage(value: unknown): value is ProviderUsage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const provider = value as Record<string, unknown>;
  return (
    typeof provider.id === "string" &&
    typeof provider.name === "string" &&
    Array.isArray(provider.windows) &&
    provider.windows.every(isUsageWindow)
  );
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const providers = (value as Record<string, unknown>).providers;
  return Array.isArray(providers) && providers.every(isProviderUsage);
}
