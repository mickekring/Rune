# Rune - Dependencies

> Last updated: 2026-09-12 — after the audit pass (`npm audit`: 0 vulnerabilities across 708 packages).

## Runtime Environment

| Tool | Version | Notes |
|------|---------|-------|
| Node.js (dev tools) | 24.x (`.nvmrc`, `engines.node >= 24`) | Build, lint, tests, dev server |
| npm | 11.x | Package manager (`package-lock.json`) |
| Node.js (Electron runtime) | 24.18.0 | Bundled inside Electron 41.10.7 |
| Chromium (Electron runtime) | 146.0.7680.216 | Bundled inside Electron 41.10.7 |

Check the bundled versions with `ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -p process.versions`.

## Production Dependencies

| Package | Spec | Installed | Purpose |
|---------|------|-----------|---------|
| react | ^19.3.0 | 19.3.0 | UI library |
| react-dom | ^19.3.0 | 19.3.0 | React DOM renderer |
| zustand | ^5.0.15 | 5.0.15 | State: vanilla store in main, hook store in the renderer |
| @codemirror/autocomplete | ^6.20.3 | 6.20.3 | `closeBrackets` |
| @codemirror/commands | ^6.11.0 | 6.11.0 | Default keymap, history |
| @codemirror/lang-markdown | ^6.5.2 | 6.5.2 | Markdown language support (pulls in `@lezer/markdown` and the HTML/CSS/JS parsers) |
| @codemirror/language | ^6.12.4 | 6.12.4 | Language infrastructure, syntax highlighting |
| @codemirror/language-data | ^6.5.2 | 6.5.2 | Lazy-loaded languages for fenced code blocks |
| @codemirror/state | ^6.7.4 | 6.7.4 | Editor state |
| @codemirror/view | ^6.43.11 | 6.43.11 | Editor view / DOM layer |
| @lezer/highlight | ^1.2.3 | 1.2.3 | Highlight tags for the theme |
| @lezer/markdown | ^1.7.2 | 1.7.2 | Parser extension API (frontmatter block) |
| react-markdown | ^10.1.0 | 10.1.0 | Markdown rendering in AI chat bubbles |
| remark-gfm | ^4.0.1 | 4.0.1 | GFM extensions for react-markdown |
| d3-force | ^3.0.0 | 3.0.0 | Force-directed layout for the Tag Constellation |

## Dev Dependencies

| Package | Spec | Installed | Purpose |
|---------|------|-----------|---------|
| electron | ^41.10.7 | 41.10.7 | Desktop runtime |
| electron-vite | ^5.0.0 | 5.0.0 | Build tooling for Electron + Vite |
| electron-builder | ^26.15.3 | 26.15.3 | Packaging, fuses, signing |
| vite | ^7.3.6 | 7.3.6 | Bundler (pinned to 7 — electron-vite 5 caps) |
| typescript | ^6.0.3 | 6.0.3 | Type checking |
| vitest | ^5.0.0 | 5.0.0 | Unit tests (`npm test`) |
| tailwindcss | ^4.2.2 | 4.3.3 | Utility-first CSS |
| @tailwindcss/vite | ^4.3.3 | 4.3.3 | Tailwind Vite plugin |
| @vitejs/plugin-react | ^5.2.0 | 5.2.0 | React Fast Refresh (pinned to 5 — plugin-react 6 needs Vite 8) |
| eslint | ^9.39.5 | 9.39.5 | Linting via `eslint.config.mjs` (pinned to 9 — eslint-plugin-react 7 caps) |
| eslint-plugin-react | ^7.37.5 | 7.37.5 | React lint rules |
| @electron-toolkit/eslint-config-ts | ^3.1.0 | 3.1.0 | TypeScript ESLint flat config |
| @electron-toolkit/tsconfig | ^2.0.0 | 2.0.0 | Shared TypeScript config |
| @resvg/resvg-js | ^2.6.2 | 2.6.2 | Icon rasterising (`scripts/build-icon.mjs`) |
| @types/node | ^24.13.4 | 24.13.4 | Node type definitions (matches Electron's Node 24) |
| @types/react | ^19.3.0 | 19.3.0 | React type definitions |
| @types/react-dom | ^19.3.0 | 19.3.0 | React DOM type definitions |
| @types/d3-force | ^3.0.10 | 3.0.10 | d3-force type definitions |

## Version Pins (can't go to latest yet — compatibility)

- **`vite` pinned to `^7`** — `electron-vite@5` peer-requires vite 5/6/7, not 8. Bump both together when electron-vite supports Vite 8.
- **`@vitejs/plugin-react` pinned to `^5.2`** — version 6 needs Vite 8.
- **`eslint` pinned to `^9`** — `eslint-plugin-react@7.37` peer-requires eslint ≤ 9.
- **Deliberately not taken in the audit pass**: Electron 44, TypeScript 7. Bump one at a time with a full build, typecheck, test, and smoke run.

## How to Update

```bash
npm audit                 # vulnerability scan
npm outdated              # what is behind
npm audit fix             # non-breaking fixes
npm update --save         # semver-compatible bumps, written back to package.json
npm install <pkg>@latest --save      # prod
npm install <pkg>@latest --save-dev  # dev

# After any update, always run before committing:
npm run typecheck && npm run lint && npm test && npx electron-vite build
```

## Notes

- **Electron pins the Chromium + Node runtime** bundled in the packaged app; `@types/node` follows Electron's Node major.
- **CodeMirror packages should update together** — they share internal versioning and mismatches cause subtle bugs.
- **Tailwind CSS 4** uses the `@theme` directive and the official `@tailwindcss/vite` plugin (no PostCSS config).
- **Removed in the audit pass**: the pnpm leftovers (`pnpm-workspace.yaml`, `.npmrc`) that made npm warn on every command.
- **Electron is a devDependency by convention**, so `npm audit --omit=dev` does not cover it. Always audit with the full tree.
