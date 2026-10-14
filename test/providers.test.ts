import { describe, expect, it } from "bun:test";
import { parseAnthropicUsage } from "../src/providers/anthropic.ts";
import { parseCopilotUsage } from "../src/providers/copilot.ts";
import { findOpenAIAccountID, parseOpenAIUsage } from "../src/providers/openai.ts";
import { FetchError, parseRetryAfter } from "../src/providers/provider.ts";

const NOW = Date.parse("2026-10-11T20:00:00Z");

describe("parseAnthropicUsage", () => {
  const body = {
    five_hour: { utilization: 27, resets_at: "2026-10-11T22:14:00.268668+00:00" },
    seven_day: { utilization: 20, resets_at: "2026-10-13T09:00:00+00:00" },
    extra_usage: { is_enabled: false },
    limits: [
      { kind: "session", percent: 27, resets_at: "2026-10-11T22:14:00+00:00", scope: null },
      { kind: "weekly_all", percent: 20, resets_at: "2026-10-13T09:00:00+00:00", scope: null },
      {
        kind: "weekly_scoped",
        percent: 2,
        resets_at: "2026-10-13T09:00:00+00:00",
        scope: { model: { id: null, display_name: "Fable" }, surface: null },
      },
    ],
  };

  it("returns 5h, week and model-specific weekly limits when all are present", () => {
    expect(parseAnthropicUsage(body)).toEqual([
      { label: "5h", usedPercent: 27, resetsAt: Date.parse("2026-10-11T22:14:00.268Z") },
      { label: "Week", usedPercent: 20, resetsAt: Date.parse("2026-10-13T09:00:00Z") },
      { label: "Fable", usedPercent: 2, resetsAt: Date.parse("2026-10-13T09:00:00Z") },
    ]);
  });

  it("returns 5h and week when the limits list is missing", () => {
    const { limits: _, ...withoutLimits } = body;
    expect(parseAnthropicUsage(withoutLimits).map((window) => window.label)).toEqual(["5h", "Week"]);
  });

  it("throws a fetch error when the shape is unexpected", () => {
    expect(() => parseAnthropicUsage({ five_hour: { utilization: 1 } })).toThrow(FetchError);
    expect(() => parseAnthropicUsage("nope")).toThrow(FetchError);
  });
});

describe("parseOpenAIUsage", () => {
  it("matches windows on their length and puts 5h first when both are present", () => {
    const body = {
      plan_type: "plus",
      rate_limit: {
        limit_reached: false,
        primary_window: { used_percent: 0, limit_window_seconds: 604_800, reset_at: 1_792_000_000 },
        secondary_window: { used_percent: 2, limit_window_seconds: 18_000, reset_after_seconds: 3600 },
      },
    };
    expect(parseOpenAIUsage(body, NOW)).toEqual([
      { label: "5h", usedPercent: 2, resetsAt: NOW + 3_600_000 },
      { label: "Week", usedPercent: 0, resetsAt: 1_792_000_000_000 },
    ]);
  });

  it("ignores windows when their length is unknown", () => {
    const body = {
      rate_limit: {
        primary_window: { used_percent: 5, limit_window_seconds: 18_000 },
        secondary_window: { used_percent: 9, limit_window_seconds: 86_400 },
      },
    };
    expect(parseOpenAIUsage(body, NOW)).toEqual([{ label: "5h", usedPercent: 5, resetsAt: undefined }]);
  });

  it("throws a fetch error when no known windows are present", () => {
    expect(() => parseOpenAIUsage({ rate_limit: null }, NOW)).toThrow(FetchError);
  });
});

describe("findOpenAIAccountID", () => {
  const jwt = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

  it("reads the account from the token when it is a jwt", () => {
    const access = jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-from-token" } });
    expect(findOpenAIAccountID({ access, refresh: "", metadata: { accountID: "acct-from-metadata" } })).toBe(
      "acct-from-token",
    );
  });

  it("falls back to the login's metadata when the token is opaque", () => {
    expect(findOpenAIAccountID({ access: "opaque", refresh: "", metadata: { accountID: "acct-1" } })).toBe("acct-1");
  });

  it("returns undefined when the account is unknown", () => {
    expect(findOpenAIAccountID({ access: "opaque", refresh: "" })).toBeUndefined();
  });
});

describe("parseCopilotUsage", () => {
  const quota = (overrides: object) => ({
    overage_count: 0,
    overage_permitted: false,
    unlimited: false,
    has_quota: true,
    token_based_billing: true,
    ...overrides,
  });
  const body = {
    copilot_plan: "individual",
    token_based_billing: true,
    quota_reset_date: "2026-11-01",
    quota_reset_date_utc: "2026-11-01T00:00:00.000Z",
    quota_snapshots: {
      chat: quota({ percent_remaining: 100, remaining: 200, entitlement: 200 }),
      completions: quota({ percent_remaining: 82.6, remaining: 1653, entitlement: 2000 }),
      premium_interactions: quota({ percent_remaining: 0, remaining: 0, entitlement: 0, has_quota: false }),
    },
  };
  const resetsAt = Date.parse("2026-11-01T00:00:00Z");

  it("returns quotas when they have an allowance", () => {
    const windows = parseCopilotUsage(body);
    expect(windows.map(({ label, resetsAt }) => ({ label, resetsAt }))).toEqual([
      { label: "Chat", resetsAt },
      { label: "Code", resetsAt },
    ]);
    expect(windows[0]?.usedPercent).toBe(0);
    expect(windows[1]?.usedPercent).toBeCloseTo(17.4, 5);
  });

  it("leaves out quotas when they are unlimited", () => {
    const unlimited = { ...body, quota_snapshots: { chat: quota({ unlimited: true, entitlement: 0 }) } };
    expect(parseCopilotUsage(unlimited)).toEqual([]);
  });

  it("returns premium requests when the plan includes them", () => {
    const pro = {
      ...body,
      quota_snapshots: { premium_interactions: quota({ percent_remaining: 75, entitlement: 300, remaining: 225 }) },
    };
    expect(parseCopilotUsage(pro)).toEqual([{ label: "Premium", usedPercent: 25, resetsAt }]);
  });

  it("throws a fetch error when quotas are missing", () => {
    expect(() => parseCopilotUsage({ copilot_plan: "individual" })).toThrow(FetchError);
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and http dates when the header is valid", () => {
    expect(parseRetryAfter("120", NOW)).toBe(120_000);
    expect(parseRetryAfter(new Date(NOW + 60_000).toUTCString(), NOW)).toBe(60_000);
    expect(parseRetryAfter(null, NOW)).toBeUndefined();
    expect(parseRetryAfter("soon", NOW)).toBeUndefined();
  });
});
