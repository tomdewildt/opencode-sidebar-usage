import type { UsageWindow } from "../shared.ts";
import { asFiniteNumber, asObject, asTimestamp, FetchError, getJson, type Provider } from "./provider.ts";

const USAGE_URL = "https://api.github.com/copilot_internal/user";
const LABEL_BY_QUOTA: Readonly<Record<string, string>> = {
  chat: "Chat",
  completions: "Code",
  premium_interactions: "Premium",
};

function hasAllowance(quota: Record<string, unknown>): boolean {
  const entitlement = asFiniteNumber(quota.entitlement) ?? 0;
  return quota.unlimited !== true && quota.has_quota !== false && entitlement > 0;
}

function parseQuota(label: string, value: unknown, resetsAt: number | undefined): UsageWindow | undefined {
  const quota = asObject(value);
  if (!quota || !hasAllowance(quota)) {
    return undefined;
  }

  const percentRemaining = asFiniteNumber(quota.percent_remaining);
  if (percentRemaining === undefined) {
    return undefined;
  }

  return { label, usedPercent: 100 - percentRemaining, resetsAt };
}

export function parseCopilotUsage(body: unknown): UsageWindow[] {
  const data = asObject(body);
  const quotas = asObject(data?.quota_snapshots);
  if (!quotas) {
    throw new FetchError("unavailable");
  }

  const resetsAt = asTimestamp(data?.quota_reset_date_utc) ?? asTimestamp(data?.quota_reset_date);
  return Object.entries(LABEL_BY_QUOTA).flatMap(([key, label]) => {
    const window = parseQuota(label, quotas[key], resetsAt);
    return window ? [window] : [];
  });
}

export const copilot: Provider = {
  id: "copilot",
  name: "GitHub Copilot",
  integrations: ["github-copilot"],
  async fetch(credential, signal, now) {
    const headers = {
      Accept: "application/json",
      Authorization: `token ${credential.access || credential.refresh}`,
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "X-GitHub-Api-Version": "2025-04-01",
    };
    const body = await getJson(USAGE_URL, headers, signal, now);
    return parseCopilotUsage(body);
  },
};
