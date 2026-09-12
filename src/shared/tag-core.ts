// Pure tag logic shared by the main-process index and the editor
// highlighter. No I/O, no Electron — safe to unit test directly.

export type Range = readonly [start: number, end: number]

// #Tag recognition rules:
// - Preceded by start-of-line or a non-word / non-hash character (avoids
//   matching inside URLs, emails, and `##` heading runs).
// - At least 2 characters, at least one letter (excludes `#000000`).
// - Unicode letters/digits so Swedish words with å/ä/ö work.
const TAG_SOURCE = '(?<=^|[^\\w#])#((?=[\\p{L}\\p{N}_-]*\\p{L})[\\p{L}\\p{N}_-]{2,})'

/** A fresh global regex — never share instances, `lastIndex` is stateful. */
export function createTagRegex(): RegExp {
  return new RegExp(TAG_SOURCE, 'gu')
}

/** Tags shorter than this are recognised locally but never propagated. */
export const MIN_PROPAGATION_TAG_LENGTH = 3

export interface TagMatch {
  /** Tag text as written, without the `#`. */
  display: string
  /** Lower-cased tag text used as the index key. */
  lower: string
  /** Offset of the `#` character. */
  start: number
  /** Exclusive offset just past the last tag character. */
  end: number
}

/**
 * Byte ranges where tags must be neither recognised nor inserted:
 * YAML frontmatter, fenced code (an unclosed fence runs to end of file),
 * inline code, link destinations, autolinks, and bare URLs.
 */
export function findProtectedRanges(content: string): Range[] {
  const ranges: Range[] = []

  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const closeIdx = content.indexOf('\n---', 3)
    if (closeIdx > 0) ranges.push([0, closeIdx + 4])
  }

  // Fenced code blocks, scanned line by line so an unclosed fence
  // protects the rest of the document instead of nothing.
  let fenceStart = -1
  let fenceMarker = ''
  let lineStart = 0
  while (lineStart <= content.length) {
    let lineEnd = content.indexOf('\n', lineStart)
    if (lineEnd < 0) lineEnd = content.length
    const line = content.slice(lineStart, lineEnd)
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const marker = fence[1]
      if (fenceStart < 0) {
        fenceStart = lineStart
        fenceMarker = marker
      } else if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
        ranges.push([fenceStart, lineEnd])
        fenceStart = -1
      }
    }
    if (lineEnd >= content.length) break
    lineStart = lineEnd + 1
  }
  if (fenceStart >= 0) ranges.push([fenceStart, content.length])

  const patterns = [
    /`[^`\n]+`/g, // inline code
    /\]\([^)\n]*\)/g, // markdown link destination
    /<(?:https?:\/\/[^>\s]+|[^>\s@]+@[^>\s]+)>/g, // autolinks
    /\bhttps?:\/\/\S+/g // bare URLs
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      ranges.push([m.index, m.index + m[0].length])
    }
  }

  return ranges
}

export function isInsideProtected(pos: number, ranges: readonly Range[]): boolean {
  for (const [start, end] of ranges) {
    if (pos >= start && pos < end) return true
  }
  return false
}

/** Every tag in `content` that is not inside a protected range. */
export function findTags(
  content: string,
  ranges: readonly Range[] = findProtectedRanges(content)
): TagMatch[] {
  const out: TagMatch[] = []
  const re = createTagRegex()
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (isInsideProtected(m.index, ranges)) continue
    const display = m[1]
    out.push({
      display,
      lower: display.toLowerCase(),
      start: m.index,
      end: m.index + 1 + display.length
    })
  }
  return out
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whole-word, case-insensitive matcher for a tag word that is not
 * already prefixed with `#`. Used when inserting `#` into other notes.
 */
export function wordBoundaryPattern(word: string): RegExp {
  return new RegExp(
    `(?<=^|[^\\p{L}\\p{N}_#])(${escapeRegex(word)})(?=[^\\p{L}\\p{N}_]|$)`,
    'giu'
  )
}

/** Whole-word, case-insensitive test used for "mentioned in" relations. */
export function mentionPattern(word: string, flags = 'iu'): RegExp {
  return new RegExp(
    `(?<=^|[^\\p{L}\\p{N}_])${escapeRegex(word)}(?=[^\\p{L}\\p{N}_]|$)`,
    flags
  )
}
