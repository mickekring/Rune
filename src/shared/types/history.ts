// Per-file snapshot history. Stored under
// {vault}/.rune/history/{relative-path}/{id}.md on disk.

/**
 * `manual` snapshots are created by the user from the History panel.
 * `auto` snapshots are taken by the app before it rewrites a note
 * (tag propagation, tag removal). The two kinds are pruned separately
 * so automatic ones can never evict the user's own.
 */
export type SnapshotKind = 'manual' | 'auto'

export interface SnapshotMeta {
  // Filename-safe timestamp id, e.g. "2026-04-18T14-23-56-123Z" for a
  // manual snapshot or "2026-04-18T14-23-56-123Z-auto" for an automatic one.
  id: string
  kind: SnapshotKind
  // Milliseconds since epoch.
  timestamp: number
  // File size in bytes, for display.
  size: number
}

export interface FileHistory {
  filePath: string
  snapshots: SnapshotMeta[] // newest first
}

// Cap on kept snapshots per file and kind. Older ones are pruned.
export const HISTORY_MAX_SNAPSHOTS = 10
