# Rune - TODO

## Known Issues

_None open. The "last character not saved when switching files" issue (on hold since April) was traced to `handleSave` clearing the dirty flag after an async write even when keystrokes had arrived in the meantime; the editor buffer now uses an edit-version guard. See [AUDIT-2026-09.md](AUDIT-2026-09.md)._

## In progress / decisions pending

- **Distribution signing** — builds are signed with an Apple Development identity and not notarized, so other Macs reject the DMG. Needs a Developer ID certificate and `notarize: true` with credentials in the environment.
- **App id** — `com.rune.app` is not a domain we control. Changing it resets TCC grants and the single-instance identity, so decide before a public release.
- **Major dependency upgrades** — Electron 44, Vite 8 (needs electron-vite support), TypeScript 7, ESLint 10 are available but were not taken in the audit pass. Bump deliberately, one at a time.

## Completed

- [x] Project scaffolding with electron-vite
- [x] Store & persistence layer (Zustand)
- [x] Theme system + three-panel layout
- [x] Vault selection & file tree
- [x] CodeMirror 6 markdown editor
- [x] Document stats (word count, reading time)
- [x] Welcome modal for first-time vault selection
- [x] File tree with collapsible folders, persisted expand state
- [x] Resizable sidebars, toggles in the status bar, persisted widths/visibility
- [x] Dark/light theme toggle, accent color, font size (persisted)
- [x] Auto-save (2.5 s debounce) with eager flush on blur / hide / quit / Cmd+S / note switch
- [x] New note / new folder creation, rename, delete, drag-and-drop move
- [x] Single instance lock
- [x] System fonts (offline)
- [x] Documentation folder (`docs/`)
- [x] Inline markdown rendering — marks hidden on inactive lines (Obsidian-style live preview)
- [x] Folder context menu
- [x] Drag-and-drop attachments into `{vault}/vault_media/`, inline images via `vault-media://`
- [x] Dedicated "Media Vault" section in the left sidebar
- [x] Window size + position persisted
- [x] Hashtag-based internal linking with an in-memory tag index
- [x] Relations section (Also tagged / Mentioned)
- [x] Automatic tag propagation
- [x] Per-(file, tag) relation group expand/collapse state persisted
- [x] Collapsible, reorderable right-sidebar sections (Document Info, Relations, History, AI Chat)
- [x] Per-file history snapshots with Save / Restore / Delete
- [x] Full-text search across the vault (⌘K)
- [x] Security hardening, April 2026 (path guard, preload allowlist, CSP, sandbox, navigation guard)
- [x] Tag Constellation (⌘⇧G)
- [x] Local AI chat via Ollama with markdown rendering
- [x] Interactive task-list checkboxes, GFM table styling, Cmd+B / Cmd+I
- [x] Cloud-sync friendliness: hash-guarded writes, fsync, direct overwrite, junk-file filter
- [x] Tag Manager (⌘⇧T)
- [x] Live preview polish (2026-09-12): heading text flush with body text, hanging indents for wrapped list items and block quotes, YAML frontmatter rendered as a metadata block instead of a heading
- [x] **Audit fixes, September 2026** — see [AUDIT-2026-09.md](AUDIT-2026-09.md) for the findings; in short:
  - Data safety: edit-version save guard (fixes the lost-keystroke bug), failed saves surface in the status bar and keep the note dirty, per-document editor instances (no cross-note undo), renames refuse to overwrite, deletes go to the Trash, conflict copies when a note changed on disk, flush before every destructive operation, last opened note reopens on launch.
  - Tag propagation: protected ranges apply on both sides, only new tags propagate, never the tag under the caret, automatic snapshots in their own ring so manual ones are never evicted, mentions ignore code/links.
  - Security: `attachment:open` extension allowlist, symlink-free walker and guard, `app://` scheme with a strict navigation guard and header CSP, validated snapshot ids, vault roots restricted to dialog-chosen folders, deny-all permission handlers, Electron fuses, trimmed entitlements, packaged asar limited to `out/` + `package.json`, Electron 41.10 (advisories fixed).
  - Performance: no full vault rescans after mutations (main patches and broadcasts the tree), incremental propagation with cached protected ranges, no per-keystroke React re-render, chat owned by its section with coalesced chunks, sidebar resize committed on mouse-up, cached lower-cased search text, throttled constellation rendering, minified bundles.
  - Structure: one typed IPC contract, one renderer store with selectors, an editor-buffer hook that owns saving, shared Modal/Escape/icon modules, ~1,000 lines of dead code removed, ESLint flat config, vitest suite (46 tests), docs rewritten.

## Future Enhancements

- [ ] Layer 2 cloud-sync: a filesystem watcher (`fs.watch` / chokidar) so external edits reload clean notes immediately and the tree/index update without any user action; a Conflicts panel listing `(conflict …)` siblings with compare/merge actions
- [ ] Make the Ollama base URL configurable in Settings → AI
- [ ] GFM table rendering (proper table layout via widget decorations)
- [ ] Frontmatter / metadata editing
- [ ] Backlinks / wiki-style `[[links]]`
- [ ] Templates for folders
- [ ] Export to PDF/HTML
- [ ] Keyboard shortcuts panel
- [ ] Recent files list
- [ ] Windows: verify path handling end-to-end (renderer helpers accept both separators, but the Windows build has not been exercised)
