# Rune

A local-first, Obsidian-inspired personal workspace for markdown notes.
Your notes stay as plain `.md` files on your own disk — no cloud, no
lock-in, no sign-up.

Built with Electron, React, TypeScript, and CodeMirror 6.

## Features

- **Vault-based notes** — pick any folder on your disk, everything inside
  becomes your workspace. Files and folders can be created, renamed,
  deleted (to the Trash, never permanently), and drag-dropped between
  folders from a three-panel layout. Renames never overwrite an existing
  note. Attachments live in a dedicated **Media Vault** section.
- **Live markdown preview** — headings, bold, italic, links, and inline
  images render as you type. The raw `#`, `**`, `[…](…)` marks hide on
  inactive lines and reappear when you click in to edit, like Obsidian.
  Headings sit flush with body text, wrapped list items and quotes keep
  a hanging indent aligned with the text after the marker, and YAML
  frontmatter at the top of a note renders as a quiet metadata block.
- **Task lists & tables** — GFM `- [ ]` / `- [x]` render as clickable
  checkboxes; pipe tables get monospaced columns with dimmed delimiters
  so they read as tables while staying plain-text editable.
- **Markdown shortcuts** — **⌘B** toggles bold, **⌘I** toggles italic
  around the selection (wraps, unwraps, or inserts an empty pair at the
  caret).
- **Cloud-sync friendly** — put your vault inside pCloud, OneDrive,
  iCloud, Proton Drive, Dropbox, or Syncthing. Rune skips no-op writes,
  fsyncs before closing the file, never rename-over-temps, and uses a
  2.5s autosave debounce. If a note changed on disk while you were
  editing it (another device, another app), your text wins and the other
  version is kept next to it as `Name (conflict …).md` instead of being
  silently overwritten.
- **Drag-and-drop attachments** — drop any file onto a note; images
  render inline, other files become Cmd/Ctrl-click-openable links. All
  attachments are copied into a `vault_media/` folder inside your vault.
  Only document, image, and media types are handed to the OS; anything
  else is revealed in Finder instead of launched.
- **Full-text search** — click the magnifying glass in the left
  sidebar header (or press **⌘K** / **Ctrl+K**) to search across every
  note in the vault. Results are grouped into "Filenames" and
  "Matches" with highlighted snippets. Click a result to open the
  note.
- **Hashtag-based linking + auto-tagging** — write `#Topic` anywhere and
  the app tags every other note in the vault that mentions "Topic" as
  plain text (first untagged occurrence, word-boundary, case-insensitive,
  ≥3 chars). A tag only propagates once you have finished typing it, and
  never from or into code blocks, links, URLs, or frontmatter. The right
  sidebar's collapsible **Relations** section lists all connected notes,
  split into "Also tagged" and "Mentioned" groups. Click any entry to
  open it.
- **Collapsible, reorderable right-sidebar sections** — Document
  Info (stats), Relations, History, and AI Chat each have a section
  heading with its own chevron. Grab the handle on the left of any
  heading to drag a section into a new position; drop onto another
  section to insert before it. Toggle state and section order both
  persist globally across files and restarts.
- **Tag Manager** — press **⌘⇧T** (or click the tag icon in the
  sidebar header) for a flat, filterable list of every tag in the
  vault with note counts. Delete any tag and Rune strips just the
  leading `#` from every occurrence across every note — the words
  themselves stay put. Each modified note gets an automatic History
  snapshot so the change is reversible per file.
- **Tag Constellation** — press **⌘⇧G** (or click the constellation
  icon in the sidebar header) to see every tag in your vault as a
  force-directed graph. Circles sized by how many notes carry each
  tag, lines between tags that co-occur in at least one note,
  thickness proportional to how many notes they share. Click a tag
  to see its notes in a side drawer; click a note to jump to it.
- **Per-file history snapshots** — "Save snapshot" creates a
  point-in-time copy of the current note. Rune also takes an automatic
  snapshot before it rewrites a note itself (tag propagation, tag
  removal, restore). Manual and automatic snapshots are kept in two
  separate rings of 10, so the app can never push out your own.
  Snapshots live inside the vault at `.rune/history/{path}/` so they
  travel with it, and they follow the note through renames.
- **Local AI chat (Ollama)** — the right sidebar's AI Chat section
  talks to a locally-running Ollama instance. The current note is
  injected into the system prompt automatically, so you can ask
  questions grounded in whatever you're reading/writing. Pick any
  installed Ollama model, edit the system prompt in Settings → AI,
  and stream responses with full markdown rendering. Links in answers
  open in your browser, never inside the app.
- **Always-safe auto-save** — debounced auto-save after you stop typing,
  plus eager save on window blur and before quit. Cmd/Ctrl+S also works.
  A save that fails (disk unplugged, permission denied) keeps the note
  marked unsaved and says why in the status bar; the app never reports
  "Saved" for text that did not reach the disk.
- **Document stats** — live word count, character count, paragraph
  count, and estimated reading time in the right panel.
- **Dark and light themes** — with a customizable accent color and
  five-step font size control that also scales the editor.
- **Collapsible, resizable sidebars** — both left (file tree) and right
  panels can be dragged to resize or toggled from the status bar.
- **Session memory** — folder expansion, sidebar widths and visibility,
  sidebar section collapse state and order, per-file relation group
  expansion, window size and on-screen position, the last opened note,
  theme, accent color, and font size are all remembered across restarts.
- **Offline-first** — no telemetry, no fonts loaded from the internet,
  and the only network traffic is to Ollama on `localhost`. Nothing
  leaves your machine.

## Tech stack

- **Electron 41** — desktop runtime, sandboxed renderer served over a
  private `app://` scheme with a strict CSP and hardened Electron fuses
- **React 19 + TypeScript 6** — UI
- **CodeMirror 6** — editor, with a custom live-preview extension layer
- **Zustand** — main-process authoritative state mirrored into the
  renderer over a single typed IPC contract
- **TailwindCSS 4** — styling via CSS custom properties
- **vitest** — unit tests for the tag engine, path guards, history, and
  file service

## Getting started

```bash
# Clone and install
git clone https://github.com/mickekring/Rune.git
cd Rune
npm install

# Run in dev mode (HMR for the renderer)
npm run dev

# Checks
npm run typecheck
npm run lint
npm test
```

On first launch you'll be prompted to pick a vault folder. Choose any
directory — it becomes the root of your notes.

## Building

```bash
npm run build:mac      # macOS DMG (arm64 + x64)
npm run build:mac-arm  # macOS DMG (Apple Silicon only)
npm run build:win      # Windows NSIS installer
npm run build:linux    # Linux AppImage
```

macOS builds are signed with whatever identity electron-builder finds
but are not notarized. To distribute to other Macs, sign with a
Developer ID certificate and set `notarize: true` in
`electron-builder.yml` with the Apple credentials in the environment.

## Documentation

Longer-form project docs live in [`docs/`](./docs):

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — process model, state
  architecture, IPC contract, persistence, tag engine, security posture.
- [DEPENDENCIES.md](./docs/DEPENDENCIES.md) — every package with its
  version pin and purpose.
- [TODO.md](./docs/TODO.md) — roadmap, completed work, known issues.
- [AUDIT-2026-09.md](./docs/AUDIT-2026-09.md) — the September 2026 code
  audit and what was done about it.

## License

MIT — see [LICENSE](./LICENSE).
