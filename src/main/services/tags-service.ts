import { readFileSync } from 'fs'
import { sep } from 'path'
import type {
  FileRelations,
  RemoveTagResult,
  TagGraph,
  TagGraphEdge,
  TagGraphNode,
  TagIndexSnapshot,
  TagRelations
} from '@shared/types/tags'
import type { SearchHit, SearchResults } from '@shared/types/search'
import {
  MIN_PROPAGATION_TAG_LENGTH,
  findProtectedRanges,
  findTags,
  isInsideProtected,
  mentionPattern,
  wordBoundaryPattern,
  type Range
} from '@shared/tag-core'
import { baseName, isMarkdownFile } from '@shared/paths'
import { historyService } from './history-service'
import { writeVaultFile } from './vault-files'

// In-memory index of every note in the vault. Content is cached (plus a
// lower-cased copy for search) so relations, search, and propagation
// never touch the filesystem per query.

interface FileEntry {
  content: string
  contentLower: string
  tags: Set<string>
  protectedRanges: Range[]
}

const files = new Map<string, FileEntry>()
// tag (lower) -> paths that declare it
const filesByTag = new Map<string, Set<string>>()
// tag (lower) -> first-seen display form
const displayByTag = new Map<string, string>()
// path -> tags that have already had their chance to propagate from it
const propagatedByFile = new Map<string, Set<string>>()
let vaultPath: string | null = null
let version = 0

let snapshotCache: { version: number; value: TagIndexSnapshot } | null = null
let graphCache: { version: number; value: TagGraph } | null = null

function bump(): void {
  version += 1
}

function removeFromIndex(path: string): void {
  const entry = files.get(path)
  if (!entry) return
  for (const tag of entry.tags) {
    const set = filesByTag.get(tag)
    if (!set) continue
    set.delete(path)
    if (set.size === 0) {
      filesByTag.delete(tag)
      displayByTag.delete(tag)
    }
  }
  files.delete(path)
  bump()
}

function indexFile(path: string, content: string): FileEntry {
  removeFromIndex(path)
  const protectedRanges = findProtectedRanges(content)
  const tags = new Set<string>()
  for (const match of findTags(content, protectedRanges)) {
    tags.add(match.lower)
    if (!displayByTag.has(match.lower)) displayByTag.set(match.lower, match.display)
    let set = filesByTag.get(match.lower)
    if (!set) {
      set = new Set()
      filesByTag.set(match.lower, set)
    }
    set.add(path)
  }
  const entry: FileEntry = {
    content,
    contentLower: content.toLowerCase(),
    tags,
    protectedRanges
  }
  files.set(path, entry)
  bump()
  return entry
}

function pathsUnder(prefix: string): string[] {
  return [...files.keys()].filter((p) => p === prefix || p.startsWith(prefix + sep))
}

export const tagsService = {
  getVersion(): number {
    return version
  },

  /**
   * Rebuild the index from scratch. Every tag that already exists on disk
   * is treated as having propagated already, so opening a vault never
   * triggers a wave of rewrites.
   */
  scanVault(root: string, notePaths: string[]): void {
    files.clear()
    filesByTag.clear()
    displayByTag.clear()
    propagatedByFile.clear()
    vaultPath = root
    for (const path of notePaths) {
      try {
        const entry = indexFile(path, readFileSync(path, 'utf-8'))
        propagatedByFile.set(path, new Set(entry.tags))
      } catch (error) {
        console.error(`tags: failed to read ${path}`, error)
      }
    }
    bump()
  },

  /** Refresh one note (after save/create/restore). Reads from disk if no content is given. */
  updateFile(path: string, content?: string): void {
    if (!isMarkdownFile(path)) return
    try {
      indexFile(path, content ?? readFileSync(path, 'utf-8'))
    } catch (error) {
      console.error(`tags: failed to update ${path}`, error)
    }
  },

  /** Drop a note, or every note below a folder. */
  removePath(path: string): void {
    for (const p of pathsUnder(path)) {
      removeFromIndex(p)
      propagatedByFile.delete(p)
    }
  },

  /** Carry index entries across a rename or move of a note or folder. */
  renamePath(oldPath: string, newPath: string): void {
    for (const p of pathsUnder(oldPath)) {
      const entry = files.get(p)
      const propagated = propagatedByFile.get(p)
      removeFromIndex(p)
      propagatedByFile.delete(p)
      const next = newPath + p.slice(oldPath.length)
      if (!isMarkdownFile(next) || !entry) continue
      indexFile(next, entry.content)
      if (propagated) propagatedByFile.set(next, propagated)
    }
    if (!files.has(newPath) && isMarkdownFile(newPath)) {
      // A non-note became a note (rename foo.txt -> foo.md).
      this.updateFile(newPath)
    }
  },

  /**
   * Auto-tag other notes. For every tag in `sourcePath` that is new since
   * the note was indexed, of at least MIN_PROPAGATION_TAG_LENGTH characters,
   * and not currently under the caret, insert `#` before the first
   * unprotected, untagged occurrence of the word in every other note.
   * Each tag propagates at most once per note per session, so steady-state
   * saves cost nothing.
   *
   * Returns the paths that were rewritten.
   */
  propagateTags(sourcePath: string, caretOffset?: number): string[] {
    const entry = files.get(sourcePath)
    if (!entry || entry.tags.size === 0) return []

    let propagated = propagatedByFile.get(sourcePath)
    if (!propagated) {
      propagated = new Set()
      propagatedByFile.set(sourcePath, propagated)
    }

    const underCaret = new Set<string>()
    if (typeof caretOffset === 'number') {
      for (const match of findTags(entry.content, entry.protectedRanges)) {
        if (caretOffset >= match.start && caretOffset <= match.end) underCaret.add(match.lower)
      }
    }

    const candidates = [...entry.tags].filter(
      (tag) =>
        tag.length >= MIN_PROPAGATION_TAG_LENGTH && !propagated.has(tag) && !underCaret.has(tag)
    )
    if (candidates.length === 0) return []

    const modified = new Set<string>()
    const snapshotted = new Set<string>()
    const targets = [...files.keys()].filter((p) => p !== sourcePath)

    for (const tagLower of candidates) {
      const display = displayByTag.get(tagLower) ?? tagLower
      const pattern = wordBoundaryPattern(display)

      for (const otherPath of targets) {
        // Re-read per iteration: an earlier tag in this run may have
        // rewritten the same note.
        const other = files.get(otherPath)
        if (!other || other.tags.has(tagLower)) continue

        pattern.lastIndex = 0
        let found: RegExpExecArray | null = null
        let match: RegExpExecArray | null
        while ((match = pattern.exec(other.content)) !== null) {
          if (!isInsideProtected(match.index, other.protectedRanges)) {
            found = match
            break
          }
        }
        if (!found) continue

        const next = other.content.slice(0, found.index) + '#' + other.content.slice(found.index)
        try {
          if (!snapshotted.has(otherPath)) {
            historyService.createSnapshot(otherPath, 'auto')
            snapshotted.add(otherPath)
          }
          writeVaultFile(otherPath, next)
          indexFile(otherPath, next)
          modified.add(otherPath)
        } catch (error) {
          console.error(`tags: failed to propagate to ${otherPath}`, error)
        }
      }
      propagated.add(tagLower)
    }

    return [...modified]
  },

  /**
   * Strip the leading `#` from every unprotected occurrence of a tag
   * across the vault. Words are preserved; each rewritten note gets an
   * automatic snapshot first.
   */
  removeTag(tag: string): RemoveTagResult {
    const tagLower = tag.toLowerCase().replace(/^#/, '')
    const set = tagLower ? filesByTag.get(tagLower) : undefined
    if (!set || set.size === 0) return { filesModified: [], occurrencesRemoved: 0 }

    const filesModified: string[] = []
    let occurrencesRemoved = 0

    for (const path of [...set]) {
      const entry = files.get(path)
      if (!entry) continue
      const positions = findTags(entry.content, entry.protectedRanges)
        .filter((m) => m.lower === tagLower)
        .map((m) => m.start)
      if (positions.length === 0) continue

      let next = ''
      let cursor = 0
      for (const idx of positions) {
        next += entry.content.slice(cursor, idx)
        cursor = idx + 1
      }
      next += entry.content.slice(cursor)

      try {
        historyService.createSnapshot(path, 'auto')
        if (!writeVaultFile(path, next).changed) continue
        indexFile(path, next)
        filesModified.push(path)
        occurrencesRemoved += positions.length
      } catch (error) {
        console.error(`tags: failed to remove tag from ${path}`, error)
      }
    }

    return { filesModified, occurrencesRemoved }
  },

  /** All tags with the notes that declare each. Cached per index version. */
  getSnapshot(): TagIndexSnapshot {
    if (snapshotCache && snapshotCache.version === version) return snapshotCache.value
    const byTag: Record<string, string[]> = {}
    for (const [tag, set] of filesByTag) {
      byTag[displayByTag.get(tag) ?? tag] = [...set].sort()
    }
    const allTags = Object.keys(byTag).sort((a, b) => a.localeCompare(b))
    const value = { allTags, filesByTag: byTag }
    snapshotCache = { version, value }
    return value
  },

  /**
   * For one note: every tag it declares with the notes that also declare
   * it (strong) and the notes that merely mention the word (weak).
   */
  getRelations(filePath: string): FileRelations {
    const entry = files.get(filePath)
    if (!entry || entry.tags.size === 0) return { filePath, tags: [] }

    const tags: TagRelations[] = []
    for (const tagLower of entry.tags) {
      const display = displayByTag.get(tagLower) ?? tagLower
      const declared = filesByTag.get(tagLower) ?? new Set<string>()
      const taggedIn = [...declared].filter((p) => p !== filePath).sort()

      const pattern = mentionPattern(tagLower, 'giu')
      const mentionedIn: string[] = []
      for (const [otherPath, other] of files) {
        if (otherPath === filePath || declared.has(otherPath)) continue
        // Cheap substring pre-check on the cached lower-cased text before
        // the word-boundary regex. A word inside code, a link, or a URL is
        // not a mention.
        if (!other.contentLower.includes(tagLower)) continue
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(other.content)) !== null) {
          if (!isInsideProtected(match.index, other.protectedRanges)) {
            mentionedIn.push(otherPath)
            break
          }
        }
      }
      mentionedIn.sort()
      tags.push({ tag: display, taggedIn, mentionedIn })
    }

    tags.sort((a, b) => a.tag.localeCompare(b.tag))
    return { filePath, tags }
  },

  /** Tag co-occurrence graph derived from the index. Cached per version. */
  getTagGraph(): TagGraph {
    if (graphCache && graphCache.version === version) return graphCache.value

    const nodes: TagGraphNode[] = []
    for (const [tagLower, set] of filesByTag) {
      nodes.push({ tag: displayByTag.get(tagLower) ?? tagLower, count: set.size })
    }

    const edgeWeights = new Map<string, number>()
    for (const entry of files.values()) {
      if (entry.tags.size < 2) continue
      const arr = [...entry.tags].sort()
      for (let i = 0; i < arr.length; i += 1) {
        for (let j = i + 1; j < arr.length; j += 1) {
          const key = `${arr[i]}|${arr[j]}`
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1)
        }
      }
    }

    const edges: TagGraphEdge[] = []
    for (const [key, weight] of edgeWeights) {
      const [a, b] = key.split('|')
      edges.push({
        source: displayByTag.get(a) ?? a,
        target: displayByTag.get(b) ?? b,
        weight
      })
    }

    nodes.sort((a, b) => a.tag.localeCompare(b.tag))
    edges.sort((a, b) =>
      `${a.source}|${a.target}`.localeCompare(`${b.source}|${b.target}`)
    )

    const value = { nodes, edges }
    graphCache = { version, value }
    return value
  },

  /**
   * Case-insensitive substring search over filenames and content using
   * the cached lower-cased text. Filename hits are listed first and never
   * repeated in the content group.
   */
  search(query: string, limit: number): SearchResults {
    const result: SearchResults = {
      query,
      filenameHits: [],
      contentHits: [],
      totalContentMatches: 0
    }
    const q = query.trim()
    if (!q) return result
    const qLower = q.toLowerCase()
    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 40

    const makeRelative = (p: string): string =>
      vaultPath && p.startsWith(vaultPath + sep) ? p.slice(vaultPath.length + 1) : p

    const byFilename: SearchHit[] = []
    const byContent: SearchHit[] = []

    for (const [filePath, entry] of files) {
      if (baseName(filePath).toLowerCase().includes(qLower)) {
        byFilename.push({ filePath, relativePath: makeRelative(filePath) })
        continue
      }

      const idx = entry.contentLower.indexOf(qLower)
      if (idx < 0) continue
      result.totalContentMatches += 1
      if (byContent.length >= cap) continue

      const content = entry.content
      const start = Math.max(0, idx - 40)
      const end = Math.min(content.length, idx + q.length + 60)
      let snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()
      let snippetOffset = idx - start
      if (start > 0) {
        snippet = '… ' + snippet
        snippetOffset += 2
      }
      if (end < content.length) snippet += ' …'

      byContent.push({
        filePath,
        relativePath: makeRelative(filePath),
        snippet,
        snippetOffset,
        matchLength: q.length
      })
    }

    byFilename.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    byContent.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    result.filenameHits = byFilename.slice(0, cap)
    result.contentHits = byContent
    return result
  }
}
