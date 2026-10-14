import { describe, expect, it } from "bun:test";
import { FetchError } from "../src/providers/provider.ts";
import { initialState, MAX_RETRY_DELAY_MS, recordFailure, recordSuccess, REFRESH_INTERVAL_MS } from "../src/refresh.ts";

const NOW = 1_000_000;
const WINDOWS = [{ label: "5h", usedPercent: 27 }];

describe("recordSuccess", () => {
  it("stores the windows and schedules the next refresh when the fetch succeeds", () => {
    const state = recordSuccess(initialState("anthropic", "Anthropic"), WINDOWS, NOW);
    expect(state).toEqual({
      usage: { id: "anthropic", name: "Anthropic", windows: WINDOWS, fetchedAt: NOW },
      retryAt: NOW + REFRESH_INTERVAL_MS,
      failures: 0,
    });
  });

  it("clears the error when an earlier fetch recordFailure", () => {
    const broken = recordFailure(initialState("anthropic", "Anthropic"), new FetchError("unavailable"), NOW);
    expect(recordSuccess(broken, WINDOWS, NOW).usage.error).toBeUndefined();
  });
});

describe("recordFailure", () => {
  const good = recordSuccess(initialState("anthropic", "Anthropic"), WINDOWS, NOW);

  it("keeps the last windows when the fetch fails", () => {
    const state = recordFailure(good, new FetchError("unavailable"), NOW);
    expect(state.usage.windows).toEqual(WINDOWS);
    expect(state.usage.fetchedAt).toBe(NOW);
    expect(state.usage.error).toBe("unavailable");
    expect(state.retryAt).toBe(NOW + REFRESH_INTERVAL_MS);
  });

  it("asks to sign in again when authentication fails", () => {
    expect(recordFailure(good, new FetchError("sign_in"), NOW).usage.error).toBe("sign_in");
  });

  it("marks usage unavailable when the error is unknown", () => {
    expect(recordFailure(good, new Error("boom"), NOW).usage.error).toBe("unavailable");
  });

  it("backs off exponentially up to a maximum when rate limited", () => {
    let state = good;
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      state = recordFailure(state, new FetchError("rate_limited"), NOW);
      delays.push(state.retryAt - NOW);
    }
    expect(delays).toEqual([
      REFRESH_INTERVAL_MS,
      2 * REFRESH_INTERVAL_MS,
      4 * REFRESH_INTERVAL_MS,
      MAX_RETRY_DELAY_MS,
      MAX_RETRY_DELAY_MS,
      MAX_RETRY_DELAY_MS,
    ]);
  });

  it("honours retry-after when it is longer than the backoff", () => {
    const state = recordFailure(good, new FetchError("rate_limited", 3_600_000), NOW);
    expect(state.retryAt).toBe(NOW + 3_600_000);
  });
});
