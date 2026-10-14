import type { UsageWindow } from "../shared.ts";
import { asFiniteNumber, asObject, asTimestamp, FetchError, getJson, type Provider } from "./provider.ts";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

function parseWindow(label: string, value: unknown, percentKey: string): UsageWindow | undefined {
  const data = asObject(value);
  const usedPercent = asFiniteNumber(data?.[percentKey]);
  if (usedPercent === undefined) {
    return undefined;
  }

  return { label, usedPercent, resetsAt: asTimestamp(data?.resets_at) };
}

function parseModelWindow(value: unknown): UsageWindow | undefined {
  const limit = asObject(value);
  const model = asObject(asObject(limit?.scope)?.model)?.display_name;
  if (limit?.kind !== "weekly_scoped" || typeof model !== "string") {
    return undefined;
  }

  return parseWindow(model, limit, "percent");
}

export function parseAnthropicUsage(body: unknown): UsageWindow[] {
  const data = asObject(body);
  const fiveHourWindow = parseWindow("5h", data?.five_hour, "utilization");
  const weekWindow = parseWindow("Week", data?.seven_day, "utilization");
  if (!fiveHourWindow || !weekWindow) {
    throw new FetchError("unavailable");
  }

  const limits = Array.isArray(data?.limits) ? data.limits : [];
  const modelWindows = limits.flatMap((limit) => {
    const window = parseModelWindow(limit);
    return window ? [window] : [];
  });

  return [fiveHourWindow, weekWindow, ...modelWindows];
}

export const anthropic: Provider = {
  id: "anthropic",
  name: "Anthropic",
  integrations: ["anthropic"],
  async fetch(credential, signal, now) {
    const headers = {
      Authorization: `Bearer ${credential.access}`,
      "anthropic-beta": "oauth-2025-04-20",
    };
    const body = await getJson(USAGE_URL, headers, signal, now);
    return parseAnthropicUsage(body);
  },
};
