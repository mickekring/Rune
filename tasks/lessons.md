# Lessons Learned

Rules to prevent repeat mistakes. Review at session start.

---

## 1. Always broadcast IPC state changes to the renderer

**When**: Adding a new `store:*` IPC handler that mutates persisted state.

**Mistake**: The `store:toggle-folder-expanded` handler updated the main process store but didn't call `win.webContents.send('store:state-changed', ...)`. The renderer never received the update, so folder expand/collapse didn't work.

**Rule**: After `mainStore.getState().someAction()`, always broadcast the changed slice to all windows. Use `broadcast('store:state-changed', { ui: { someField } })` from `src/main/ipc/bridge.ts`.

**Pattern**:
```typescript
handle('store:some-action', async (_, arg) => {
  mainStore.getState().someAction(arg)
  broadcast('store:state-changed', { ui: { someField: mainStore.getState().ui.someField } })
})
```

---

## 2. Register custom Electron protocols before `app.whenReady()`

**When**: Adding a custom URL scheme (e.g. `vault-media://`, `app://`) to load local files in the renderer.

**Rule**: Call `protocol.registerSchemesAsPrivileged([...])` at module top level (synchronously at startup), then call `protocol.handle(...)` inside the `app.whenReady()` callback. If you register the scheme after app ready, it won't be treated as secure/standard and the renderer may refuse to load it (CORS, mixed-content, or "not a registered protocol" errors).

---

## 3. Main-process code changes need a full dev server restart

**When**: Editing files under `src/main/` or `src/preload/`.

**Mistake**: Assumed Vite HMR would pick up main-process edits. It doesn't — HMR only applies to the renderer. Main-process changes require killing and restarting `npm run dev`.

**Rule**: After changing main or preload code, kill the dev server and restart it. If an orphan Electron window survives from the previous session, the single-instance lock can block the next boot — `pkill -9 -f "Electron.app"` clears it.

---

## 4. Debounced callbacks must read the latest state via refs, not closure

**When**: Scheduling work (auto-save, debounced side effects) from inside a React callback that depends on state.

**Mistake**: `handleSave` in `App.tsx` had deps `[currentFile, content, isDirty, writeFile]` and checked `if (!isDirty) return`. The debounce timer captured whichever `onSave` existed at the moment of the *current* keystroke. When the timer fired 1 second later, the stale closure bailed out and the edit was never saved.

**Rule**: If a callback is scheduled asynchronously, don't rely on closure-captured state. Make the callback stable and read current values from refs, or mirror the callback itself into a ref. `useEditorBuffer` is the reference implementation.

---

## 5. CodeMirror HighlightStyle uses inline properties, not CSS classes

**When**: Styling markdown tokens (headings, bold, italic, links, etc.) in CodeMirror 6.

**Mistake**: Used `class: 'cm-header-1'` in `HighlightStyle.define()` and defined `.cm-header-1` in `EditorView.theme()`. `EditorView.theme()` scopes class names, so the generated selector didn't match.

**Rule**: Use inline style properties directly on HighlightStyle entries (`fontSize`, `fontWeight`, `color`, etc.).

---

## 6. `useState(propValue)` freezes the initializer — sync with useEffect

**When**: Mirroring a prop (or store-derived value) into local state for fast, optimistic updates while still reflecting upstream changes.

**Mistake**: `AppLayout` did `useState(ui.leftSidebarWidth)` so drags felt instant, but the initializer only runs on first mount, before IPC hydration returns the persisted width. After Cmd+R the sidebar reverted to the default.

**Rule**: Pair `useState(initial)` with a `useEffect` that re-syncs when the upstream value changes.

---

## 7. Never put an early return between hooks

**When**: Any component with `if (...) return null` guards.

**Mistake**: `LeftSidebar` had a guard between hooks; toggling visibility changed the hook count and React crashed the whole tree.

**Rule**: ALL hook calls must run on every render in the same order. Put the guard after the last hook, or move it to the parent.

---

## 8. A packaged copy of Rune will silently block `npm run dev`

**When**: Developing Rune while the installed `/Applications/Rune.app` is running.

**Mistake**: `npm run dev` reached "starting electron app…" and exited cleanly with no error. The packaged app held the single-instance lock, and `if (!gotTheLock) app.quit()` quit the dev instance silently.

**Rule**: If `npm run dev` exits straight after "starting electron app…", check first:

```bash
ps aux | grep "Rune.app/Contents/MacOS/Rune" | grep -v grep
```

The `!gotTheLock` branch now logs "Another instance of Rune is already running — quitting." so this is visible in the terminal.

Second-order lesson: `./node_modules/.bin/electron ./out/main/index.js` from a VS Code terminal runs as **Node** because VS Code sets `ELECTRON_RUN_AS_NODE=1`. Prepend `unset ELECTRON_RUN_AS_NODE &&` for direct invocations.

---

## 9. Run an isolated instance with `--user-data-dir` and `RUNE_CONFIG_DIR`, never with `$HOME`

**When**: Testing a build against a throwaway vault while the real Rune.app is running (smoke tests, trying a change without touching your notes).

**Mistake**: Launched the built app with `HOME=/tmp/x` expecting a clean profile. macOS resolves `app.getPath('home')` from the system, not from `$HOME`, so the instance read the real `~/.rune/settings.json` and opened the real vault. Only a safety check in the test script prevented mutations.

**Rule**: Two switches, both required:

```bash
RUNE_CONFIG_DIR=/tmp/rune-test/.rune ./node_modules/.bin/electron \
  --user-data-dir=/tmp/rune-test/userdata --remote-debugging-port=9333 out/main/index.js
```

`--user-data-dir` gives the instance its own Electron profile and single-instance lock (so it does not collide with Rune.app); `RUNE_CONFIG_DIR` points the settings service at a scratch directory. Any script that drives the app must verify `store:get-state` reports the scratch vault before doing anything that writes. The DevTools protocol (`--remote-debugging-port`) is enough to drive the UI from a plain Node script; see the smoke test approach in the September 2026 audit.
