import { describe, expect, it } from "bun:test";
import { formatBar, formatDuration, formatPercent } from "../src/format.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatBar", () => {
  it.each([
    [0, "░░░░░░░░░░"],
    [27, "███░░░░░░░"],
    [50, "█████░░░░░"],
    [100, "██████████"],
    [150, "██████████"],
    [-5, "░░░░░░░░░░"],
  ])("renders %d%% as %s", (percent, expected) => {
    expect(formatBar(percent)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [-5000, "0m"],
    [45 * MINUTE, "45m"],
    [2 * HOUR + 14 * MINUTE, "2h14m"],
    [DAY + 21 * HOUR + 30 * MINUTE, "1d21h"],
    [3 * DAY, "3d"],
    [20 * DAY + 5 * HOUR, "20d"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("formatPercent", () => {
  it("rounds and clamps to 0-100", () => {
    expect(formatPercent(17.4)).toBe("17%");
    expect(formatPercent(104)).toBe("100%");
    expect(formatPercent(-1)).toBe("0%");
  });
});
