import { Plugin } from "@opencode/plugin/tui";
import { formatBar, formatDuration, formatPercent } from "./format.ts";
import { UsageRpc } from "./rpc.ts";
import { EMPTY_SNAPSHOT, isSnapshot, PLUGIN_ID, type ProviderUsage, type UsageWindow } from "./shared.ts";

const LABEL_WIDTH = 8;
const PERCENT_WIDTH = 4;
const WARNING_PERCENT = 70;
const ERROR_PERCENT = 90;
const COUNTDOWN_INTERVAL_MS = 30_000;

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    const [state, update] = context.storage.memory("usage", {
      initial: { snapshot: EMPTY_SNAPSHOT, now: Date.now() },
    });
    const show = (value: unknown) => {
      if (isSnapshot(value)) {
        update((draft) => void (draft.snapshot = value));
      }
    };

    const usage = context.client.rpc(UsageRpc);
    usage
      .snapshot({})
      .then(show)
      .catch(() => undefined);
    const stopEvents = usage.events.on("updated", (event) => show(event.data));
    const clock = setInterval(() => update((draft) => void (draft.now = Date.now())), COUNTDOWN_INTERVAL_MS);

    const theme = () => context.theme;

    const barColor = (percent: number) => {
      if (percent >= ERROR_PERCENT) {
        return theme().text.feedback.error.base;
      }
      if (percent >= WARNING_PERCENT) {
        return theme().text.feedback.warning.base;
      }
      return theme().text.base;
    };

    const statusText = (provider: ProviderUsage) => {
      if (provider.error === "sign_in") {
        return "sign in again";
      }
      if (!provider.error) {
        return undefined;
      }
      return provider.fetchedAt ? `${formatDuration(state.now - provider.fetchedAt)} old` : "unavailable";
    };

    const windowRow = (window: UsageWindow) => {
      const label = window.label.padEnd(LABEL_WIDTH);
      const bar = formatBar(window.usedPercent);
      const percent = formatPercent(window.usedPercent).padStart(PERCENT_WIDTH);
      const resetsIn = window.resetsAt === undefined ? "" : `  ${formatDuration(window.resetsAt - state.now)}`;

      return (
        <text fg={theme().text.muted}>
          {label}
          <span style={{ fg: barColor(window.usedPercent) }}>{bar}</span>
          {` ${percent}${resetsIn}`}
        </text>
      );
    };

    const providerSection = (provider: ProviderUsage) => {
      const status = statusText(provider);

      return (
        <box>
          <text fg={theme().text.base}>
            {provider.name}
            {status && <span style={{ fg: theme().text.muted }}>{` · ${status}`}</span>}
          </text>
          {provider.windows.map(windowRow)}
        </box>
      );
    };

    const disposeSlot = context.ui.slot({
      prepend: "sidebar.content",
      render: () => (
        <>
          {state.snapshot.providers.length > 0 ? (
            <box>
              <text fg={theme().text.base}>
                <b>Usage</b>
              </text>
              <box gap={1}>{state.snapshot.providers.map(providerSection)}</box>
            </box>
          ) : null}
        </>
      ),
    });

    return () => {
      stopEvents();
      clearInterval(clock);
      disposeSlot();
    };
  },
});
