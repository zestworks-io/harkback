export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.hb-card, .hb-trigger {
  --hb-bg: #ffffff; --hb-fg: #1f2328; --hb-muted: #59636e; --hb-border: #d1d9e0; --hb-accent: #0969da;
  --hb-defined: #1a7f37; --hb-external: #9a6700; --hb-error: #cf222e;
  font: 14px/1.55 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--hb-fg);
}
@media (prefers-color-scheme: dark) {
  .hb-card, .hb-trigger {
    --hb-bg: #1f2328; --hb-fg: #e6edf3; --hb-muted: #9198a1; --hb-border: #3d444d; --hb-accent: #4493f8;
    --hb-defined: #3fb950; --hb-external: #d29922; --hb-error: #f85149;
  }
}
.hb-card {
  position: absolute; width: 380px; max-width: calc(100vw - 16px); max-height: 60vh; overflow: auto;
  background: var(--hb-bg); border: 1px solid var(--hb-border); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); padding: 12px 14px;
}
.hb-close { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: var(--hb-muted); font-size: 18px; cursor: pointer; }
.hb-meta { color: var(--hb-muted); font-size: 12px; margin: 0 24px 6px 0; }
.hb-tier { display: inline-block; padding: 0 6px; border-radius: 999px; border: 1px solid currentColor; font-size: 11px; }
.hb-defined_in_source { color: var(--hb-defined); }
.hb-external_knowledge { color: var(--hb-external); }
.hb-body p { margin: 0 0 8px; }
.hb-body ul, .hb-body ol { margin: 0 0 8px; padding-left: 20px; }
.hb-body pre { overflow: auto; padding: 8px; border-radius: 6px; background: rgba(127, 127, 127, 0.12); }
.hb-body code, .hb-math-block { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.hb-link { color: var(--hb-accent); text-decoration: underline; cursor: pointer; }
.hb-note { color: var(--hb-muted); font-size: 12px; margin-top: 6px; }
.hb-error { color: var(--hb-error); }
.hb-footer { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.hb-ask { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
button {
  font: inherit; font-size: 12.5px; color: var(--hb-fg); background: var(--hb-bg);
  border: 1px solid var(--hb-border); border-radius: 6px; padding: 3px 10px; cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: default; }
button.hb-chosen { border-color: var(--hb-accent); color: var(--hb-accent); }
.hb-followup { margin-top: 8px; }
.hb-row { display: flex; gap: 6px; }
.hb-row input { flex: 1; font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--hb-border); border-radius: 6px; background: var(--hb-bg); color: var(--hb-fg); }
.hb-answer { margin-top: 6px; }
.hb-trigger { position: absolute; padding: 2px 10px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18); }
.hb-mark { position: absolute; height: 0; border-bottom: 2px dashed rgba(9, 105, 218, 0.55); pointer-events: none; }
`;
