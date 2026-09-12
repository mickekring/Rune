# Session TODO

> Per-session scratch for live planning and progress tracking.
> Long-lived project work belongs in [docs/TODO.md](../docs/TODO.md).

## Current session — fix everything in docs/AUDIT-2026-09.md (2026-09-12)

### Chunk 0 — hygiene
- [x] `npm audit fix` + `npm update --save` (Electron 41.10.7, Vite 7.3.6, CodeMirror minors, React 19.3); 0 vulnerabilities
- [x] `build.minify` for all three targets
- [x] electron-builder: positive `files` allowlist, `extendInfo` map, `electronFuses`, no `asarUnpack`, maintainer, `publish: null`
- [x] entitlements: only `allow-jit`
- [x] deleted `pnpm-workspace.yaml` + `.npmrc`; added `engines`, `.nvmrc`, `LICENSE`
- [x] `eslint.config.mjs`; `lint` script; dropped unused `@lezer/markdown`; version 0.2.0
- [x] `APP_ICON` only in dev

### Chunk 1 — main process
- [x] `src/shared/ipc.ts`: single contract, runtime lists checked with `satisfies`, `Result` shape
- [x] preload: typed bridge, allowlists derived from the contract
- [x] `path-guard`: pure `resolveInsideRoot`; `vault-walk`: symlink-safe walker, no per-file stat
- [x] `vault-files`: change tracking, conflict copies, move/forget
- [x] `tag-core` (pure) + `tags-service`: protected ranges both sides, cached per note, new-tags-only, caret exclusion, lower-cased search cache, memoised snapshot/graph
- [x] `history-service`: id validation, auto/manual rings, follows renames/deletes
- [x] handlers: `handle`/`broadcast`, tree refresh after mutations, rename guard, Trash, root rejection, `attachment:open` allowlist, vault-root allowlist, external-change events, chunk coalescing, dead channels removed
- [x] `main/index.ts`: `app://` scheme + header CSP, strict `will-navigate`, permission handlers, unhandledRejection, bounds validation

### Chunk 2 — renderer
- [x] one zustand store + typed `api`; `useEditorBuffer` (keyed editor, edit-version guard, flush everywhere, external-change reload)
- [x] App/AppLayout/sidebars/StatusBar memoised and selector-driven; chat inside AIChatSection; resize commit on mouse-up
- [x] Constellation rAF throttle + stop on close; TagManager/Constellation refetch on light event; chat `urlTransform`
- [x] dead hooks/barrels/props/CSS removed; shared `Modal`, `useEscapeKey`, icons, `paths.ts`
- [x] inline `--editor-font-size` removed; StrictMode double-send fixed; markdownShortcuts unwrap fixed

### Chunk 3 — tests
- [x] vitest config; 46 tests across tag-core, paths, path-guard, vault-files, history-service, tags-service, markdownShortcuts

### Chunk 4 — docs
- [x] CLAUDE.md, README.md, ARCHITECTURE.md, DEPENDENCIES.md, TODO.md, AUDIT status, lessons.md

## Review

- **Verification**: `npm run typecheck`, `npm run lint`, `npm test` (46/46), `electron-vite build`, and a DevTools-protocol smoke test against a scratch vault (41/41: security guards, autosave, undo isolation, propagation rules, conflict copies, Trash, tag removal, no console errors). Lesson 9 records how to run the isolated instance.
- **Tricky**: the propagation rewrite had to re-read each target inside the loop because an earlier tag in the same run can rewrite the same note; `mentionPattern` needed a global flag to skip matches inside protected ranges; `frame-ancestors` is only honoured as a header, so the app:// handler attaches the full CSP.
- **Double-check in daily use**: first launch reopens the last note (new); "Media Vault" ordering unchanged; if a save ever fails the status bar now shows the reason instead of "Saved".
- **Deferred (documented in docs/TODO.md)**: notarization / Developer ID, app id decision, major dependency upgrades, Windows path verification, the filesystem watcher.
