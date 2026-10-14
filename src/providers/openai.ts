import type { UsageWindow } from "../shared.ts";
import { asFiniteNumber, asObject, FetchError, getJson, type OAuthCredential, type Provider } from "./provider.ts";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const AUTH_CLAIM = "https://api.openai.com/auth";
const LABEL_BY_WINDOW_SECONDS: Readonly<Record<number, string>> = { 18_000: "5h", 604_800: "Week" };
const LABEL_ORDER = Object.values(LABEL_BY_WINDOW_SECONDS);

function parseResetsAt(data: Record<string, unknown> | undefined, now: number): number | undefined {
  const resetAt = asFiniteNumber(data?.reset_at);
  if (resetAt !== undefined) {
    return resetAt * 1000;
  }

  const resetAfter = asFiniteNumber(data?.reset_after_seconds);
  if (resetAfter !== undefined) {
    return now + resetAfter * 1000;
  }

  return undefined;
}

function parseWindow(value: unknown, now: number): UsageWindow | undefined {
  const data = asObject(value);
  const label = LABEL_BY_WINDOW_SECONDS[asFiniteNumber(data?.limit_window_seconds) ?? -1];
  const usedPercent = asFiniteNumber(data?.used_percent);
  if (!label || usedPercent === undefined) {
    return undefined;
  }

  return { label, usedPercent, resetsAt: parseResetsAt(data, now) };
}

function getAccountIDFromToken(access: string): string | undefined {
  const payload = access.split(".")[1];
  if (!payload) {
    return undefined;
  }

  try {
    const claims = asObject(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    const id = asObject(claims?.[AUTH_CLAIM])?.chatgpt_account_id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

export function findOpenAIAccountID(credential: OAuthCredential): string | undefined {
  const fromToken = getAccountIDFromToken(credential.access);
  if (fromToken) {
    return fromToken;
  }

  const fromMetadata = credential.metadata?.accountID ?? credential.metadata?.accountId;
  return typeof fromMetadata === "string" ? fromMetadata : undefined;
}

export function parseOpenAIUsage(body: unknown, now: number): UsageWindow[] {
  const limits = asObject(asObject(body)?.rate_limit);
  const windows = [limits?.primary_window, limits?.secondary_window].flatMap((value) => {
    const window = parseWindow(value, now);
    return window ? [window] : [];
  });
  if (windows.length === 0) {
    throw new FetchError("unavailable");
  }

  return windows.toSorted((a, b) => LABEL_ORDER.indexOf(a.label) - LABEL_ORDER.indexOf(b.label));
}

export const openai: Provider = {
  id: "openai",
  name: "OpenAI",
  integrations: ["openai", "codex", "chatgpt"],
  async fetch(credential, signal, now) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credential.access}`,
      "User-Agent": "opencode-sidebar-usage",
    };
    const accountID = findOpenAIAccountID(credential);
    if (accountID) {
      headers["ChatGPT-Account-Id"] = accountID;
    }

    const body = await getJson(USAGE_URL, headers, signal, now);
    return parseOpenAIUsage(body, now);
  },
};
