# Rune - Claude Code Project Guide

## Project Overview
Rune is a local-first, Electron-based personal workspace app for markdown notes and project management. It features a three-panel layout with live inline markdown rendering (Obsidian-style).

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement
- After ANY correction from the user: update 'tasks/lessons.md"
with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness


### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous bug-fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to "tasks/todo.md" with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to "tasks/todo.md"
6. **Capture Lessons**: Update 'tasks/lessons.md' after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Docs Live in `docs/`**: All project documentation lives in the `docs/` folder — never scatter docs at the repo root. Always **read** the relevant doc before making related changes, and **update** it immediately after. Stale docs are worse than no docs. See [Documentation](#documentation) below for the canonical file list.
- **Verify Latest Versions**: Never trust training data for dependency versions. Before installing or recommending any dependency, verify the current stable release via web search, `npm info <pkg> version`, `bun outdated`, or similar tools. Applies to packages, runtimes, databases, and Dockerfile base images. This matters for both staying current and security.
- **Commit Regularly**: Commit and push after completing each feature or meaningful chunk of work. Don't let uncommitted work pile up. Use descriptive commit messages that explain *what* and *why*.

## Documentation

All long-form project documentation lives in `docs/`. This is the single source of truth — **read before changing, update after changing**. Do not create new docs outside this folder.

- **[README.md](README.md)** — User-facing overview (features, getting started, build). Update the features list whenever user-visible functionality is added, changed, or removed. This is what people see on GitHub; keep it accurate.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System architecture, state model, IPC design, persistence, security posture. Update when process model, state shape, IPC channels, or directory layout changes.
- **[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)** — All packages with spec + installed version, runtime environment. Update when adding, removing, or upgrading any dependency.
- **[docs/TODO.md](docs/TODO.md)** — Known issues, in-progress work, future enhancements. Update when starting new work, finding a bug, or completing a feature.
- **[docs/AUDIT-2026-09.md](docs/AUDIT-2026-09.md)** — Full code audit (data safety, security, performance, dead code, architecture, docs drift) with its resolution status. Historical record; do not add new findings here, use TODO.md.

If you add a new doc (design decisions, feature specs, debugging notes), create it inside `docs/` and link it from this list.


## Tech Stack
- **Framework**: Electron 41 + React 19 + TypeScript 6
- **Build Tool**: electron-vite 5 + Vite 7 (minified output for all three targets)
- **Styling**: TailwindCSS 4 with CSS custom properties
- **State**: Zustand in both processes — an authoritative vanilla store in main, a mirror-plus-editor-status store in the renderer with selectors
- **Editor**: CodeMirror 6 with custom markdown extensions
- **IPC**: One typed contract in `src/shared/ipc.ts` drives the preload allowlist, the main-process `handle()` helper, and `window.api`
- **Tests**: vitest for the pure and filesystem-only modules (`npm test`)
- **Lint**: ESLint 9 flat config (`eslint.config.mjs`)

## Project Structure
```
src/
├── main/                        # Electron main process
│   ├── index.ts                 # Lifecycle, window, app:// + vault-media:// protocols, navigation guards
│   ├── ipc/
│   │   ├── bridge.ts            # Typed handle() / broadcast() helpers
│   │   └── handlers.ts          # Every IPC handler
│   ├── services/
│   │   ├── history-service.ts   # Per-note snapshots (manual + automatic rings)
│   │   ├── ollama-service.ts    # Ollama HTTP client (model list, streaming chat)
│   │   ├── path-guard.ts        # Vault confinement via realpath + external URL allowlist
│   │   ├── settings-service.ts  # ~/.rune/*.json persistence (atomic writes)
│   │   ├── tags-service.ts      # Tag index, propagation, relations, graph, search
│   │   ├── vault-files.ts       # Note reads/writes, change tracking, conflict copies
│   │   └── vault-walk.ts        # Symlink-safe tree walker
│   └── store/index.ts           # Authoritative Zustand store (settings, ui, fileTree)
├── preload/
│   ├── index.ts                 # contextBridge: invoke/on with allowlists derived from the contract
│   └── index.d.ts               # window.api type
├── renderer/src/
│   ├── App.tsx                  # Vault lifecycle, editor mount, restore confirmation
│   ├── components/
│   │   ├── editor/              # MarkdownEditor, EditableTitle
│   │   ├── layout/              # AppLayout, LeftSidebar, RightSidebar, StatusBar, SearchPanel, AIChatSection, ResizeHandle
│   │   ├── modals/              # Welcome, Settings, Confirm, Input, TagManager, TagConstellation
│   │   └── ui/                  # Modal, ContextMenu, icons
│   ├── editor/                  # useCodeMirror, theme, extensions (markHiding, inlineImages, linkClicks, tagHighlight, taskList, tableStyling, markdownShortcuts)
│   ├── hooks/                   # useEditorBuffer, useVaultActions, useVaultData, useChat, useGlobalShortcuts, useThemeEffects, useEscapeKey
│   ├── lib/api.ts               # Typed wrappers around window.api
│   ├── store/index.ts           # Renderer Zustand store (main mirror + editor status)
│   └── styles/globals.css       # Theme variables, base styles
└── shared/
    ├── ipc.ts                   # THE IPC contract (channel maps + runtime lists)
    ├── constants.ts             # Folder names, schemes, autosave delay
    ├── paths.ts                 # Separator-agnostic path helpers, name sanitising
    ├── tag-core.ts              # Pure tag recognition + protected ranges
    └── types/                   # store, tags, history, search, ai
```

## Key Commands
```bash
npm run dev          # Start dev server (with ELECTRON_RUN_AS_NODE fix)
npm run build        # Build for production
npm run build:mac    # Build macOS app (both architectures); build:mac-arm for Apple Silicon only
npm run typecheck    # tsc for the node and web projects
npm run lint         # ESLint
npm test             # vitest (unit tests live next to the code as *.test.ts)
```

## Important Notes

### VS Code Terminal Fix
When running from VS Code's terminal, `ELECTRON_RUN_AS_NODE=1` is set (VS Code is Electron-based). The dev script includes `unset ELECTRON_RUN_AS_NODE &&` to fix this.

### Running a second, isolated instance
The packaged Rune.app holds the single-instance lock, so a dev instance normally quits silently (see `tasks/lessons.md`). To run one alongside it:

```bash
RUNE_CONFIG_DIR=/tmp/rune-test/.rune ./node_modules/.bin/electron --user-data-dir=/tmp/rune-test/userdata out/main/index.js
```

`RUNE_CONFIG_DIR` replaces `~/.rune` (settings, UI state, window state); `--user-data-dir` gives Electron its own profile and lock. On macOS `$HOME` is ignored by `app.getPath('home')`, which is why the env var exists.

### Native Title Bar
Uses `titleBarStyle: 'hiddenInset'` with traffic lights. Sidebars have 52px top padding to accommodate.

### State Architecture
- **Main process**: Holds the authoritative Zustand store (`settings`, `ui`, `fileTree`), persists to `~/.rune/`, and rebuilds/broadcasts the file tree after every mutation.
- **Renderer**: One Zustand store mirrors those slices (hydrated once, patched by `store:state-changed`) and adds renderer-local editor status. Components subscribe with selectors.
- **Editor buffer**: `useEditorBuffer` is the only owner of the open note's text, dirty flag, and autosave timer. Text lives in refs; nothing re-renders per keystroke. The CodeMirror view is keyed per document so undo history never crosses notes.
- **File content**: Never in any store. Read on demand via `file:read`, written via `file:write`, which detects external changes and keeps conflict copies.

### Theme System
CSS custom properties in `globals.css`. Toggle between dark/light by adding/removing `.light` class on document root.

### IPC Channels
All channels are defined once in `src/shared/ipc.ts` (`InvokeMap` and `EventMap`). Adding a channel means adding it to the map and to the runtime list in the same file; a mismatch is a compile error. Groups:
- `dialog:*`, `vault:*` — vault selection and opening
- `file:*`, `folder:*` — note and folder operations (results are `{ ok } | { ok: false, error }`)
- `attachment:*`, `shell:*` — attachments and external links
- `store:*` — settings and UI state
- `tags:*`, `search:*`, `history:*`, `ai:*` — index, search, snapshots, Ollama
- Events: `store:state-changed`, `file:external-change`, `tags:index-changed`, `history:changed`, `ai:chat-*`

## Current Status

See [docs/TODO.md](docs/TODO.md) for the current feature list, known issues, and roadmap. That file is the source of truth — don't duplicate it here.
