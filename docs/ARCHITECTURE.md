# Rune - Architecture

## Overview

Rune is a local-first, single-vault Electron desktop app for markdown notes. All data lives as plain `.md` files on the user's filesystem — nothing is stored in a database or cloud service.

## Process Model

```
┌──────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                      │
│                                                              │
│  store/          Zustand store: settings, ui, fileTree       │
│  services/       vault-files, vault-walk, tags, history,     │
│                  settings, ollama, path-guard                │
│  ipc/            bridge.ts (typed handle/broadcast)          │
│                  handlers.ts (every channel)                 │
│  index.ts        window, app:// + vault-media:// protocols,  │
│                  navigation + permission guards              │
└───────────────────────────┬──────────────────────────────────┘
                            │ IPC, typed by src/shared/ipc.ts
┌───────────────────────────┴──────────────────────────────────┐
│  Preload (sandboxed)                                         │
│  window.api.invoke(channel, ...args)  — allowlist from ipc.ts│
│  window.api.on(channel, cb)           — allowlist from ipc.ts│
│  window.api.getFilePath(file)                                │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│  Renderer (React, sandboxed, CSP)                            │
│  store/          Zustand mirror of settings/ui/fileTree      │
│                  + editor status (dirty, saving, cursor…)    │
│  hooks/          useEditorBuffer (owns the open note)        │
│                  useVaultActions, useVaultData, useChat …    │
│  components/     AppLayout ─ LeftSidebar / editor / Right-   │
│                  Sidebar / StatusBar, modals, ui             │
└──────────────────────────────────────────────────────────────┘
```

## State Management

### Authoritative state (main process)

| Slice | Persisted | Storage |
|-------|-----------|---------|
| `settings` (vault path, theme, font size, accent color, `ai.model`, `ai.systemPrompt`) | Yes | `~/.rune/settings.json` |
| `ui` (sidebar visibility/widths, expanded folders, per-file expanded relations, section expand state and order, last opened note) | Yes | `~/.rune/ui-state.json` |
| `fileTree` | No | Rebuilt from disk on vault open and after every mutation |

Writes to `~/.rune/*.json` go through a sibling temp file plus rename (atomic) with mode `0600`. `RUNE_CONFIG_DIR` overrides the directory so a second profile can run alongside the real one.

### Renderer mirror

`src/renderer/src/store/index.ts` is one Zustand store. `hydrateStore()` subscribes to `store:state-changed` first, then fetches `store:get-state` once. Components read with selectors (`useAppStore((s) => s.settings.theme)`), so a change to one slice re-renders only its subscribers. The store also carries renderer-local **editor status** (`currentFile`, `isDirty`, `isSaving`, cursor, document stats, a status-bar notice) so the status bar and right sidebar update without the App component re-rendering.

### The editor buffer

`useEditorBuffer` is the only owner of the open note: its path, latest text, dirty flag, edit version, and autosave timer. Text lives in refs; a keystroke updates refs and debounces a stats update, nothing else. Rules:

- The CodeMirror view is created once per document and keyed by a `docVersion`, so opening or restoring a note remounts the editor with fresh undo history and never fires a spurious change.
- `save()` captures the edit version, awaits `file:write`, and clears the dirty flag only if no edit landed in between and the note is still the same one. A failed write keeps the note dirty and shows the error.
- Every operation that could lose text flushes first: switching notes, creating a note, renaming or moving the open note, changing vault, snapshotting, removing a tag. If the flush fails, the operation does not proceed.
- `file:external-change` (main rewrote a note during tag propagation or removal) reloads the open note only if it is clean; a dirty buffer always wins.
- The window's `blur`, `visibilitychange`, and `beforeunload` flush the buffer.

File content never lives in either store.

## IPC contract

`src/shared/ipc.ts` defines `InvokeMap` (channel → `args`, `result`) and `EventMap` (event → payload). The runtime channel lists in the same file are checked against the maps with `satisfies`, so a channel cannot exist in the types without being allowlisted, or vice versa. The preload derives its allowlists from those lists; main registers handlers through `handle()` in `ipc/bridge.ts`; the renderer calls through `lib/api.ts`. Mutating channels return `{ ok: true, ... } | { ok: false, error }` and never throw across the boundary.

Channels:

- `dialog:select-vault`, `vault:open` — the dialog result is remembered in main; `vault:open` only accepts roots that came from the dialog or the persisted settings, realpath-resolves them, and refuses `/`, the home folder, top-level folders, and volume roots.
- `file:read|write|create|delete|rename`, `folder:create|delete` — every path is confined to the vault (`path-guard.ts`). Deletes go to the OS Trash. Renames refuse to overwrite an existing target (case-only renames of the same file are allowed). Main rebuilds and broadcasts the tree after each mutation.
- `attachment:save`, `attachment:open`, `shell:open-external`.
- `store:*` — settings and UI state setters; each broadcasts the changed slice.
- `tags:get-index|get-relations|get-graph|remove-tag`, `search:query`.
- `history:list|create-snapshot|restore|delete-snapshot`.
- `ai:list-models|chat-start|chat-abort`.

Events: `store:state-changed` (partial slices), `file:external-change` (paths main rewrote), `tags:index-changed` (`{ version }` only; consumers fetch what they need), `history:changed`, `ai:chat-chunk|done|error` (chunks are coalesced in main every 40 ms).

## Persistence Paths

| Path | Purpose |
|------|---------|
| `~/.rune/settings.json` | App settings |
| `~/.rune/ui-state.json` | UI state |
| `~/.rune/window-state.json` | Window bounds (validated against connected displays on launch) |
| `{vault}/.rune/config.json` | Per-vault metadata (version, creation date) |
| `{vault}/**/*.md` | User notes |
| `{vault}/vault_media/` | Attachments dropped into notes |
| `{vault}/.rune/history/{relative-path}/{id}.md` | Snapshots; `id` is a timestamp, with an `-auto` suffix for automatic ones |
| `{note} (conflict YYYY-MM-DD HH.mm).md` | The on-disk version preserved when a save found the note changed externally |

## Vault files (`vault-files.ts`)

- **Hash-guarded writes**: a write whose content already matches the disk is skipped.
- **fsync before close**, **direct overwrite** (no temp-plus-rename, which breaks iCloud and pCloud).
- **Change tracking**: the mtime/size seen at the last read or write is remembered per path. An editor save (`file:write`) that finds the file changed underneath it writes the on-disk version to a conflict copy next to the note, then writes the editor's content. Internal rewrites (propagation, tag removal) do not conflict-check because they operate on freshly indexed content.
- The tree walker (`vault-walk.ts`) uses `withFileTypes`, skips symlinks, dotfiles, and sync junk (`~$*`, `*.crdownload`, `*.part`, `*.tmp`), lists non-markdown files only under `vault_media/`, and never stats per file.

## Tag engine

`src/shared/tag-core.ts` (pure, shared with the editor highlighter):

- Tag recognition: `(?<=^|[^\w#])#((?=[\p{L}\p{N}_-]*\p{L})[\p{L}\p{N}_-]{2,})` — at least 2 characters, at least one letter (no hex colors), Unicode letters (å, ä, ö).
- **Protected ranges**: YAML frontmatter, fenced code (an unclosed fence protects to end of file), inline code, link destinations, autolinks, bare URLs. Tags are neither recognised nor inserted inside them, and words inside them do not count as mentions.

`tags-service.ts` keeps, per note, the content, a lower-cased copy (search), the tag set, and the protected ranges. Derived views (`getSnapshot`, `getTagGraph`) are memoised per index version.

### Propagation (auto-tagging)

After a changed `file:write` or `file:create`, `propagateTags(path, caretOffset)` inserts `#` before the first unprotected, whole-word, untagged occurrence of each candidate tag in every other note. A tag is a candidate only if:

- it is at least 3 characters long,
- it has not propagated from this note before in this session (every tag present when the vault was opened counts as already propagated, so opening a vault never rewrites anything), and
- the caret is not inside it — the renderer passes the caret offset with every save, so `#the` on the way to `#theory` is never propagated.

Each rewritten note gets one automatic snapshot per run before the rewrite, and main broadcasts `file:external-change` so an open, clean note reloads.

### Tag removal

`removeTag(tag)` strips the leading `#` from every unprotected occurrence across the vault, snapshotting each note first (`auto`). The Tag Manager flushes the editor before invoking it.

## History (`history-service.ts`)

Snapshots are full copies. Ids are timestamps (`2026-04-18T14-23-56-123Z`, `…Z-auto`) and are validated against that exact shape before any path is built from them. `manual` and `auto` kinds are pruned as two separate rings of `HISTORY_MAX_SNAPSHOTS` (10). An automatic snapshot is skipped when the newest snapshot already holds the same content. Snapshot folders follow renames and are removed with their note or folder.

## Attachments and the `vault-media://` scheme

Dropped files are copied into `{vault}/vault_media/` with collision-safe names (symlinks and non-regular files are refused). Images render through `vault-media://local/<path>`; the handler resolves the decoded path against `vault_media/`, realpath-resolves it, and refuses anything that escapes. `attachment:open` accepts vault-relative paths only, confines them to the vault, hands only known document/image/media extensions to `shell.openPath`, and reveals anything else in the file manager.

## The `app://` scheme

In packaged builds the renderer is served from `out/renderer` over `app://rune/` (confined to that directory, with the full CSP attached as a response header). A real origin makes the `will-navigate` guard meaningful — `file://` pages all share the opaque `null` origin — and lets the `GrantFileProtocolExtraPrivileges` fuse be disabled. In development the Vite dev server URL is used instead.

## AI chat (Ollama)

`ollama-service.ts` talks to `http://localhost:11434` (`OLLAMA_BASE_URL`, not yet configurable): `listModels()` with a 3 s timeout, `streamChat()` with per-request abort, a 60 s stall timeout, and a bounded line buffer. Handlers cap concurrent streams at 5, reject duplicate request ids, and coalesce deltas into 40 ms batches. `useChat` lives inside `AIChatSection` (which stays mounted while collapsed) and reads the note text at send time. Model output is rendered with react-markdown; only `http(s)`/`mailto` links survive and they open in the default browser.

## Theme System

CSS custom properties in `globals.css`; dark is the default and `.light` on the root element switches palettes. `useThemeEffects` applies theme, accent color, and font size (`--font-size-base`, `--editor-font-size`, and the root `font-size` so rem-based sizing scales).

## Editor

CodeMirror 6 with markdown support, a custom theme, and extensions for mark hiding on inactive lines (the space after a heading's `#` is hidden with it), hanging indents for list items and block quotes (the marker prefix is measured in the editor font via canvas `measureText` and applied as `padding-left` plus negative `text-indent`), inline images, tag highlighting (same rules as the index, skipping headings and code), task-list checkboxes, GFM table styling, link clicks (Cmd/Ctrl-click), and Cmd+B / Cmd+I. Autosave is 2.5 s after the last keystroke with eager flushes on blur, hide, quit, Cmd+S, and every note switch.

## Security posture

- Renderer: `sandbox`, `contextIsolation`, no `nodeIntegration`, `webviewTag: false`, `will-attach-webview` blocked, deny-all permission handlers, `setWindowOpenHandler` denies everything (safe URLs go to the browser).
- Navigation: only the app's own URL is allowed; anything else is blocked and, if `http(s)`/`mailto`, opened externally.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vault-media:; object-src 'none'; base-uri 'self'; form-action 'none'` plus `frame-ancestors 'none'` in the header.
- IPC: allowlists derived from the contract; every path argument confined to the vault through realpath; snapshot ids validated; vault roots restricted to dialog-chosen folders.
- Symlinks are skipped by the walker and rejected by the guard, so a synced vault cannot point the indexer or propagation outside itself.
- Packaged builds: Electron fuses disable `RunAsNode`, `NODE_OPTIONS`, `--inspect`, and file-protocol privileges, enable asar integrity validation and cookie encryption; the hardened runtime keeps only `allow-jit`; `app.asar` contains just `out/` and `package.json`.
- `~/.rune/*.json` are written atomically with mode `0600`.
