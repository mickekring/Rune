import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { historyService } from './history-service'
import { tagsService } from './tags-service'

let vault: string
const paths: Record<string, string> = {}

function write(name: string, content: string): string {
  const p = join(vault, name)
  writeFileSync(p, content)
  paths[name] = p
  return p
}

beforeEach(() => {
  for (const key of Object.keys(paths)) delete paths[key]
  vault = realpathSync(mkdtempSync(join(tmpdir(), 'rune-tags-')))
  mkdirSync(join(vault, 'Projects'))
  write('Source.md', '# Source\n\nAbout #Sky and the #Sea.')
  write('Plain.md', 'The sky is blue and the sea is wide.')
  write('Coded.md', 'Nothing here.\n\n```\nsky inside code\n```\n')
  write('Projects/Tagged.md', 'Already #sky tagged, sea too.')
  historyService.setVaultPath(vault)
  tagsService.scanVault(vault, Object.values(paths))
})

describe('index', () => {
  it('indexes tags with first-seen display casing', () => {
    expect(tagsService.getSnapshot().allTags).toEqual(['Sea', 'Sky'])
    expect(tagsService.getSnapshot().filesByTag['Sky'].sort()).toEqual(
      [paths['Source.md'], paths['Projects/Tagged.md']].sort()
    )
  })

  it('treats tags present at scan time as already propagated', () => {
    expect(tagsService.propagateTags(paths['Source.md'])).toEqual([])
    expect(readFileSync(paths['Plain.md'], 'utf8')).not.toContain('#')
  })
})

describe('propagateTags', () => {
  it('propagates only new tags, skipping the tag under the caret, code, and already-tagged notes', () => {
    const source = paths['Source.md']
    const content = '# Source\n\nAbout #Sky and the #Sea and #Blue.'
    tagsService.updateFile(source, content)

    // Caret sits right after "#Blue": still being typed, so nothing happens.
    expect(tagsService.propagateTags(source, content.length - 1)).toEqual([])
    expect(readFileSync(paths['Plain.md'], 'utf8')).not.toContain('#blue')

    // Caret elsewhere: #Blue propagates to the one note that mentions blue.
    expect(tagsService.propagateTags(source, 0)).toEqual([paths['Plain.md']])
    expect(readFileSync(paths['Plain.md'], 'utf8')).toBe('The sky is #blue and the sea is wide.')
    // Sky/Sea were present at scan time, so Plain.md did not get them.
    expect(readFileSync(paths['Plain.md'], 'utf8')).not.toContain('#sky')
    expect(readFileSync(paths['Coded.md'], 'utf8')).not.toContain('#')

    // A second save does nothing more.
    expect(tagsService.propagateTags(source, 0)).toEqual([])
    expect(historyService.list(paths['Plain.md']).snapshots[0]?.kind).toBe('auto')
  })

  it('never propagates tags shorter than three characters or from protected ranges', () => {
    const source = paths['Source.md']
    tagsService.updateFile(source, 'Tags: #Is #Sky\n```\n#Wide\n```')
    expect(tagsService.propagateTags(source, 0)).toEqual([])
    expect(readFileSync(paths['Plain.md'], 'utf8')).not.toContain('#')
  })

  it('does not match inside words or protected ranges of the target', () => {
    write('Target.md', 'Skyline skyward https://sky.example/#sky `sky` [x](sky) sky!')
    tagsService.updateFile(paths['Target.md'])
    const source = paths['Source.md']
    tagsService.updateFile(source, '#Sky #Rocket')
    tagsService.propagateTags(source, 0)
    expect(readFileSync(paths['Target.md'], 'utf8')).toBe(
      'Skyline skyward https://sky.example/#sky `sky` [x](sky) sky!'
    )
    tagsService.updateFile(paths['Target.md'], 'the rocket flies')
    tagsService.updateFile(source, '#Sky #Rocket #Moon')
    expect(tagsService.propagateTags(source, 0)).toEqual([])
    tagsService.updateFile(source, '#Sky #Rocket #Moon #Flies')
    expect(tagsService.propagateTags(source, 0)).toEqual([paths['Target.md']])
    expect(readFileSync(paths['Target.md'], 'utf8')).toBe('the rocket #flies')
  })
})

describe('removeTag', () => {
  it('strips the # from unprotected occurrences and snapshots first', () => {
    const result = tagsService.removeTag('#SKY')
    expect(result.filesModified.sort()).toEqual([paths['Source.md'], paths['Projects/Tagged.md']].sort())
    expect(result.occurrencesRemoved).toBe(2)
    expect(readFileSync(paths['Source.md'], 'utf8')).toBe('# Source\n\nAbout Sky and the #Sea.')
    expect(tagsService.getSnapshot().allTags).toEqual(['Sea'])
    expect(historyService.list(paths['Source.md']).snapshots[0]?.kind).toBe('auto')
  })
})

describe('relations, search, renames', () => {
  it('reports strong and weak relations', () => {
    const rel = tagsService.getRelations(paths['Source.md'])
    const sky = rel.tags.find((t) => t.tag === 'Sky')!
    expect(sky.taggedIn).toEqual([paths['Projects/Tagged.md']])
    expect(sky.mentionedIn).toEqual([paths['Plain.md']])
  })

  it('searches filenames and content with a cap', () => {
    const res = tagsService.search('sky', 1)
    expect(res.filenameHits).toHaveLength(0)
    expect(res.contentHits).toHaveLength(1)
    expect(res.totalContentMatches).toBe(4)
    expect(res.contentHits[0].snippet).toMatch(/sky/i)
    expect(tagsService.search('tagged', 10).filenameHits[0].relativePath).toBe('Projects/Tagged.md')
  })

  it('follows folder renames and removals', () => {
    const from = join(vault, 'Projects')
    const to = join(vault, 'Archive')
    renameSync(from, to)
    tagsService.renamePath(from, to)
    expect(tagsService.getSnapshot().filesByTag['Sky']).toContain(join(to, 'Tagged.md'))
    expect(tagsService.getSnapshot().filesByTag['Sky']).not.toContain(join(from, 'Tagged.md'))
    tagsService.removePath(to)
    expect(tagsService.getSnapshot().filesByTag['Sky']).toEqual([paths['Source.md']])
  })

  it('builds a co-occurrence graph', () => {
    const graph = tagsService.getTagGraph()
    expect(graph.nodes.map((n) => n.tag)).toEqual(['Sea', 'Sky'])
    expect(graph.edges).toEqual([{ source: 'Sea', target: 'Sky', weight: 1 }])
  })
})
