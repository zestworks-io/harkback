export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.hb-card, .hb-trigger {
  --hb-bg: #ffffff; --hb-fg: #18181b; --hb-muted: #71717a; --hb-border: #e4e4e7; --hb-subtle: #f4f4f5;
  --hb-accent: #2e4bd6; --hb-accent-soft: rgba(46, 75, 214, 0.08); --hb-primary: #18181b; --hb-primary-fg: #fafafa;
  --hb-defined: #15803d; --hb-defined-soft: rgba(21, 128, 61, 0.1);
  --hb-external: #a16207; --hb-external-soft: rgba(161, 98, 7, 0.1); --hb-error: #b91c1c;
  font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--hb-fg); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .hb-card, .hb-trigger {
    --hb-bg: #18181b; --hb-fg: #fafafa; --hb-muted: #a1a1aa; --hb-border: #2f2f35; --hb-subtle: #232327;
    --hb-accent: #8ea2ff; --hb-accent-soft: rgba(142, 162, 255, 0.12); --hb-primary: #fafafa; --hb-primary-fg: #18181b;
    --hb-defined: #4ade80; --hb-defined-soft: rgba(74, 222, 128, 0.12);
    --hb-external: #facc15; --hb-external-soft: rgba(250, 204, 21, 0.12); --hb-error: #f87171;
  }
}
button:focus-visible, input:focus-visible { outline: 2px solid var(--hb-accent); outline-offset: 2px; }

.hb-card {
  position: absolute; width: 400px; max-width: calc(100vw - 16px);
  background: var(--hb-bg); border: 1px solid var(--hb-border); border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 12px 32px -8px rgba(0, 0, 0, 0.22); padding: 0;
  animation: hb-in 140ms ease-out;
}
@keyframes hb-in { from { opacity: 0; transform: translateY(4px) scale(0.985); } }
.hb-scroll { max-height: 60vh; overflow: auto; padding: 16px 18px 14px; border-radius: 14px; }
.hb-close {
  z-index: 1;
  position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 8px;
  background: none; color: var(--hb-muted); font-size: 18px; line-height: 1; cursor: pointer;
}
.hb-close:hover { background: var(--hb-subtle); color: var(--hb-fg); }
.hb-meta { color: var(--hb-muted); font-size: 12.5px; margin: 0 28px 10px 0; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
.hb-meta:empty { display: none; }
.hb-tier { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 550; }
.hb-tier::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.hb-defined_in_source { color: var(--hb-defined); background: var(--hb-defined-soft); }
.hb-external_knowledge { color: var(--hb-external); background: var(--hb-external-soft); }

.hb-body { font-size: 14.5px; line-height: 1.65; }
.hb-body p { margin: 0 0 10px; }
.hb-body p:last-child { margin-bottom: 0; }
.hb-body ul, .hb-body ol { margin: 0 0 10px; padding-left: 20px; }
.hb-body strong { font-weight: 650; }
.hb-body pre { overflow: auto; padding: 10px 12px; border-radius: 8px; background: var(--hb-subtle); }
.hb-body code, .hb-math-block { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.hb-body :not(pre) > code { background: var(--hb-subtle); border-radius: 4px; padding: 1px 5px; }
.hb-body.hb-loading { color: var(--hb-muted); animation: hb-pulse 1.4s ease-in-out infinite; }
@keyframes hb-pulse { 50% { opacity: 0.45; } }
.hb-link { color: var(--hb-accent); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.hb-note { color: var(--hb-muted); font-size: 12.5px; margin-top: 8px; }
.hb-note:empty { display: none; }
.hb-error { color: var(--hb-error); font-size: 13.5px; }

.hb-footer { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hb-border); }
.hb-footer:empty { display: none; }
.hb-ask { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
button {
  white-space: nowrap;
  font: inherit; font-size: 12.5px; font-weight: 500; color: var(--hb-fg); background: var(--hb-bg);
  border: 1px solid var(--hb-border); border-radius: 8px; padding: 4px 11px; cursor: pointer;
}
button:hover:not(:disabled) { background: var(--hb-subtle); }
button:disabled { opacity: 0.45; cursor: default; }
button.hb-chosen { border-color: var(--hb-accent); background: var(--hb-accent-soft); color: var(--hb-accent); opacity: 1; }
button.hb-primary { background: var(--hb-primary); border-color: var(--hb-primary); color: var(--hb-primary-fg); }
button.hb-primary:hover:not(:disabled) { background: var(--hb-primary); opacity: 0.88; }
button.hb-quiet { border-color: transparent; background: transparent; color: var(--hb-muted); }
button.hb-quiet:hover:not(:disabled) { color: var(--hb-fg); }
.hb-spacer { flex: 1; }

.hb-followup { margin-top: 8px; }
.hb-row { display: flex; gap: 6px; }
.hb-row input {
  flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 5px 10px; border: 1px solid var(--hb-border);
  border-radius: 8px; background: var(--hb-bg); color: var(--hb-fg);
}
.hb-row input:focus { outline: none; border-color: var(--hb-accent); box-shadow: 0 0 0 3px var(--hb-accent-soft); }
.hb-answer { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--hb-border); }
.hb-answer:empty { display: none; }

.hb-reunion { width: 360px; border-left: 3px solid var(--hb-accent); padding: 14px 18px 14px; }
.hb-reunion .hb-meta { margin-right: 0; }
.hb-reunion [data-hb="reunion-title"] { color: var(--hb-fg); font-weight: 600; }
.hb-reunion .hb-body { color: var(--hb-muted); font-size: 13.5px; }

.hb-trigger {
  position: absolute; padding: 5px 12px; font-weight: 550; background: var(--hb-primary); color: var(--hb-primary-fg);
  border: 0; border-radius: 999px; box-shadow: 0 6px 16px -4px rgba(0, 0, 0, 0.35); animation: hb-in 120ms ease-out;
  white-space: nowrap; width: max-content;
}
button.hb-trigger:hover:not(:disabled) { background: var(--hb-primary); color: var(--hb-primary-fg); opacity: 0.9; }
.hb-mark { position: absolute; height: 0; border-bottom: 2px dashed rgba(46, 75, 214, 0.6); pointer-events: none; }
@media (prefers-color-scheme: dark) { .hb-mark { border-bottom-color: rgba(142, 162, 255, 0.7); } }
@media (prefers-reduced-motion: reduce) { .hb-card, .hb-trigger, .hb-body.hb-loading { animation: none; } }
`;
