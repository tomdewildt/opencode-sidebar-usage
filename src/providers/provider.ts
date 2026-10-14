import type { UsageWindow } from "../shared.ts";

export interface OAuthCredential {
  access: string;
  refresh: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export type FetchErrorKind = "sign_in" | "rate_limited" | "unavailable";

export class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    readonly retryAfterMs?: number,
  ) {
    super(kind);
  }
}

export interface Provider {
  id: string;
  name: string;
  integrations: readonly string[];
  fetch(credential: OAuthCredential, signal: AbortSignal, now: number): Promise<UsageWindow[]>;
}

export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export async function getJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  now: number,
): Promise<unknown> {
  const response = await fetch(url, { headers, signal }).catch(() => {
    throw new FetchError("unavailable");
  });
  if (response.status === 401 || response.status === 403) {
    throw new FetchError("sign_in");
  }
  if (response.status === 429) {
    throw new FetchError("rate_limited", parseRetryAfter(response.headers.get("retry-after"), now));
  }
  if (!response.ok) {
    throw new FetchError("unavailable");
  }

  return response.json().catch(() => {
    throw new FetchError("unavailable");
  });
}

export function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

export function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function asTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}
