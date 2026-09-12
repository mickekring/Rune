// Small path helpers that work on both `/` and `\` separators. The
// renderer builds vault paths as strings and never has Node's `path`
// module, so everything it needs lives here.

function lastSeparator(p: string): number {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
}

/** Final path segment: `/a/b/c.md` → `c.md`. */
export function baseName(p: string): string {
  const i = lastSeparator(p)
  return i >= 0 ? p.slice(i + 1) : p
}

/** Everything before the final segment: `/a/b/c.md` → `/a/b`. */
export function parentDir(p: string): string {
  const i = lastSeparator(p)
  if (i < 0) return ''
  return i === 0 ? p.slice(0, 1) : p.slice(0, i)
}

export function joinPath(dir: string, name: string): string {
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + name
  return `${dir}/${name}`
}

export function isMarkdownFile(nameOrPath: string): boolean {
  return /\.md$/i.test(nameOrPath)
}

export function stripMarkdownExtension(name: string): string {
  return name.replace(/\.md$/i, '')
}

/** Display title of a note path: `/a/b/Note.md` → `Note`. */
export function noteTitle(p: string): string {
  return stripMarkdownExtension(baseName(p))
}

/** True when `p` equals `dir` or lives somewhere below it. */
export function isInsideDir(dir: string, p: string): boolean {
  if (p === dir) return true
  const base = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir
  return p.startsWith(`${base}/`) || p.startsWith(`${base}\\`)
}

// Separators, characters Windows forbids, and control characters.
// eslint-disable-next-line no-control-regex -- control characters are exactly what must go
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

/**
 * Make a user-typed note or folder name safe as a single path segment:
 * strips separators, characters that are illegal on Windows and control
 * characters, leading dots (hidden files) and trailing dots/spaces.
 * Returns '' if nothing usable remains — callers treat that as "no name".
 */
export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(UNSAFE_NAME_CHARS, '-')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
}
