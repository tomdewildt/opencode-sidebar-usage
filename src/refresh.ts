import { FetchError } from "./providers/provider.ts";
import type { ProviderUsage, UsageWindow } from "./shared.ts";

export const REFRESH_INTERVAL_MS = 5 * 60_000;
export const MAX_RETRY_DELAY_MS = 30 * 60_000;

export interface ProviderState {
  usage: ProviderUsage;
  retryAt: number;
  failures: number;
}

export function initialState(id: string, name: string): ProviderState {
  return {
    usage: {
      id,
      name,
      windows: [],
    },
    retryAt: 0,
    failures: 0,
  };
}

export function recordSuccess(state: ProviderState, windows: UsageWindow[], now: number): ProviderState {
  return {
    usage: { id: state.usage.id, name: state.usage.name, windows, fetchedAt: now },
    retryAt: now + REFRESH_INTERVAL_MS,
    failures: 0,
  };
}

export function recordFailure(state: ProviderState, error: unknown, now: number): ProviderState {
  const failures = state.failures + 1;
  const kind = error instanceof FetchError ? error.kind : "unavailable";

  return {
    usage: { ...state.usage, error: kind === "sign_in" ? "sign_in" : "unavailable" },
    retryAt: now + retryDelay(error, failures),
    failures,
  };
}

function retryDelay(error: unknown, failures: number): number {
  if (!(error instanceof FetchError) || error.kind !== "rate_limited") {
    return REFRESH_INTERVAL_MS;
  }

  const backoff = Math.min(MAX_RETRY_DELAY_MS, REFRESH_INTERVAL_MS * 2 ** (failures - 1));
  return Math.max(error.retryAfterMs ?? 0, backoff);
}
