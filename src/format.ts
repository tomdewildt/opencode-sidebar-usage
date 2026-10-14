const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const BAR_WIDTH = 10;

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}

export function formatBar(percent: number, width = BAR_WIDTH): string {
  const filled = Math.round((clampPercent(percent) / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MINUTE));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const days = Math.floor(minutes / (DAY / MINUTE));
  const hours = Math.floor((minutes % (DAY / MINUTE)) / 60);
  if (days === 0) {
    return `${hours}h${minutes % 60}m`;
  }
  if (days >= 10 || hours === 0) {
    return `${days}d`;
  }

  return `${days}d${hours}h`;
}

export function formatPercent(percent: number): string {
  return `${Math.round(clampPercent(percent))}%`;
}
