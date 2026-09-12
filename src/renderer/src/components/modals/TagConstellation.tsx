import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import type { TagGraph, TagIndexSnapshot } from '@shared/types/tags'
import { noteTitle } from '@shared/paths'
import { api } from '@/lib/api'
import { Modal } from '../ui/Modal'
import { CloseIcon, SearchIcon } from '../ui/icons'

interface TagConstellationProps {
  isOpen: boolean
  onClose: () => void
  /** Called when the user clicks a file in the selected-tag drawer. */
  onOpenFile: (path: string) => void
}

// Renderable node — extends d3's SimulationNodeDatum so d3-force can
// mutate x/y/vx/vy in place during the simulation.
interface Node extends SimulationNodeDatum {
  id: string
  tag: string
  count: number
  radius: number
}

interface Link extends SimulationLinkDatum<Node> {
  weight: number
  source: string | Node
  target: string | Node
}

const VIEW_W = 1100
const VIEW_H = 720

/**
 * "Tag Constellation" — a force-directed view of tag co-occurrence.
 *
 *  - Overview: every tag in the vault.
 *  - Focus: search or click a tag and the graph filters to that tag plus
 *    its direct co-occurrence neighbours, re-laid-out cleanly.
 */
export function TagConstellation({ isOpen, onClose, onOpenFile }: TagConstellationProps) {
  const [graph, setGraph] = useState<TagGraph | null>(null)
  const [index, setIndex] = useState<TagIndexSnapshot | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<Simulation<Node, Link> | null>(null)
  const [, forceRender] = useState(0)
  const nodesRef = useRef<Node[]>([])
  const linksRef = useRef<Link[]>([])
  const transformRef = useRef(transform)
  transformRef.current = transform

  // Load graph + index when opened and whenever the index changes.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const [g, idx] = await Promise.all([api.getTagGraph(), api.getTagIndex()])
        if (cancelled) return
        setGraph(g)
        setIndex(idx)
      } catch (error) {
        console.error('Failed to load tag graph:', error)
      }
    }
    void load()
    const unsubscribe = window.api.on('tags:index-changed', () => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [isOpen])

  // Focus tag resolution: exact (case-insensitive) → startsWith → includes.
  const focusTag = useMemo<string | null>(() => {
    if (!graph) return null
    const q = searchQuery.trim().replace(/^#+/, '').toLowerCase()
    if (!q) return null
    let exact: string | null = null
    let starts: string | null = null
    let contains: string | null = null
    for (const n of graph.nodes) {
      const lc = n.tag.toLowerCase()
      if (lc === q && !exact) exact = n.tag
      else if (lc.startsWith(q) && !starts) starts = n.tag
      else if (lc.includes(q) && !contains) contains = n.tag
      if (exact) break
    }
    return exact ?? starts ?? contains
  }, [graph, searchQuery])

  // The subgraph that gets laid out: focus + neighbours (+ edges between
  // neighbours) in focus mode, everything in overview mode.
  const visibleGraph = useMemo<TagGraph | null>(() => {
    if (!graph) return null
    if (!focusTag) return graph
    const visible = new Set<string>([focusTag])
    const focusEdges: typeof graph.edges = []
    for (const e of graph.edges) {
      if (e.source === focusTag) {
        visible.add(e.target)
        focusEdges.push(e)
      } else if (e.target === focusTag) {
        visible.add(e.source)
        focusEdges.push(e)
      }
    }
    const indirectEdges = graph.edges.filter(
      (e) => e.source !== focusTag && e.target !== focusTag && visible.has(e.source) && visible.has(e.target)
    )
    return {
      nodes: graph.nodes.filter((n) => visible.has(n.tag)),
      edges: [...focusEdges, ...indirectEdges]
    }
  }, [graph, focusTag])

  // Notes shared with the focus tag per neighbour: drives size and layout.
  const sharedWithFocus = useMemo(() => {
    const map = new Map<string, number>()
    if (!focusTag || !graph) return map
    for (const e of graph.edges) {
      if (e.source === focusTag) map.set(e.target, e.weight)
      else if (e.target === focusTag) map.set(e.source, e.weight)
    }
    return map
  }, [focusTag, graph])

  // Build the force simulation whenever the visible subgraph changes.
  // Renders are throttled to one per animation frame, and nothing runs
  // while the modal is closed.
  useEffect(() => {
    if (!isOpen || !visibleGraph) return

    const maxShared = focusTag ? Math.max(1, ...Array.from(sharedWithFocus.values())) : 1

    const nodes: Node[] = visibleGraph.nodes.map((n) => {
      const isFocus = n.tag === focusTag
      let radius: number
      if (!focusTag) radius = 10 + Math.log2(1 + n.count) * 6
      else if (isFocus) radius = 14 + Math.log2(1 + n.count) * 6
      else radius = 10 + Math.log2(1 + (sharedWithFocus.get(n.tag) ?? 1)) * 10
      return {
        id: n.tag,
        tag: n.tag,
        count: n.count,
        radius,
        x: isFocus ? VIEW_W / 2 : VIEW_W / 2 + (Math.random() - 0.5) * 300,
        y: isFocus ? VIEW_H / 2 : VIEW_H / 2 + (Math.random() - 0.5) * 300,
        fx: isFocus ? VIEW_W / 2 : undefined,
        fy: isFocus ? VIEW_H / 2 : undefined
      }
    })
    const links: Link[] = visibleGraph.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight }))
    nodesRef.current = nodes
    linksRef.current = links

    const sim = forceSimulation<Node>(nodes)
      .force(
        'link',
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance((l) => (focusTag ? 260 - (l.weight / maxShared) * 170 : 140 - Math.min(100, l.weight * 7)))
          .strength((l) => (focusTag ? 0.1 + (l.weight / maxShared) * 0.5 : 0.06 + Math.min(0.5, l.weight * 0.05)))
      )
      .force('charge', forceManyBody().strength(focusTag ? -900 : -220))
      .force('center', forceCenter(VIEW_W / 2, VIEW_H / 2).strength(0.04))
      .force('collide', forceCollide<Node>().radius((d) => d.radius + (focusTag ? 14 : 6)).iterations(3))
      .alpha(1)
      .alphaDecay(0.03)

    let raf = 0
    sim.on('tick', () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        forceRender((v) => v + 1)
      })
    })

    simRef.current?.stop()
    simRef.current = sim

    // Settle small/filtered graphs quickly before the first paint.
    const maxTicks = focusTag ? 120 : 30
    for (let i = 0; i < maxTicks && sim.alpha() > sim.alphaMin(); i += 1) sim.tick()
    if (focusTag) {
      const n = nodes.find((x) => x.tag === focusTag)
      if (n) {
        n.fx = null
        n.fy = null
      }
    }
    forceRender((v) => v + 1)

    return () => {
      sim.stop()
      if (raf) cancelAnimationFrame(raf)
      if (simRef.current === sim) simRef.current = null
    }
  }, [isOpen, visibleGraph, focusTag, sharedWithFocus])

  // Reset pan/zoom when focus changes so we don't land off-screen.
  useEffect(() => {
    setTransform({ x: 0, y: 0, k: 1 })
  }, [focusTag])

  const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    if (e.ctrlKey || e.metaKey) {
      setTransform((t) => ({ ...t, k: Math.max(0.2, Math.min(3, t.k * (1 - e.deltaY * 0.002))) }))
    } else {
      setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }))
    }
  }

  const draggingRef = useRef<Node | null>(null)
  const onNodeMouseDown = useCallback((e: React.MouseEvent, n: Node): void => {
    e.stopPropagation()
    draggingRef.current = n
    simRef.current?.alphaTarget(0.3).restart()
    n.fx = n.x
    n.fy = n.y
  }, [])

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const d = draggingRef.current
    if (!d || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const t = transformRef.current
    d.fx = (((e.clientX - rect.left) / rect.width) * VIEW_W - t.x) / t.k
    d.fy = (((e.clientY - rect.top) / rect.height) * VIEW_H - t.y) / t.k
  }

  const onMouseUp = (): void => {
    const d = draggingRef.current
    if (d) {
      simRef.current?.alphaTarget(0)
      d.fx = null
      d.fy = null
    }
    draggingRef.current = null
  }

  const focusNode = useCallback((tag: string) => setSearchQuery(tag), [])
  const hoverNode = useCallback((tag: string | null) => setHovered(tag), [])

  const neighborTags = useMemo(() => {
    const anchor = hovered ?? focusTag
    if (!anchor || !graph) return null
    const set = new Set<string>([anchor])
    for (const e of graph.edges) {
      if (e.source === anchor) set.add(e.target)
      else if (e.target === anchor) set.add(e.source)
    }
    return set
  }, [hovered, focusTag, graph])

  const focusFiles = useMemo(
    () => (focusTag && index ? (index.filesByTag[focusTag] ?? []) : []),
    [focusTag, index]
  )

  const topNeighbors = useMemo(() => {
    if (!focusTag || !graph) return []
    const entries: Array<{ tag: string; weight: number }> = []
    for (const e of graph.edges) {
      if (e.source === focusTag) entries.push({ tag: e.target, weight: e.weight })
      else if (e.target === focusTag) entries.push({ tag: e.source, weight: e.weight })
    }
    entries.sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag))
    return entries
  }, [focusTag, graph])

  const handleEscape = (): void => {
    if (searchQuery) setSearchQuery('')
    else onClose()
  }

  const totalTags = graph?.nodes.length ?? 0
  const totalConnections = graph?.edges.length ?? 0
  const shownTags = visibleGraph?.nodes.length ?? 0
  const anchor = hovered ?? focusTag

  return (
    <Modal isOpen={isOpen} onClose={onClose} onEscape={handleEscape} className="w-[95vw] h-[92vh] flex">
      <div className="relative flex-1 min-w-0 overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground whitespace-nowrap">
            Tag Constellation
          </h2>
          <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md bg-muted rounded-md px-2.5 py-1 border border-border-subtle">
            <SearchIcon size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Focus a tag (e.g. NIP)…"
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {searchQuery && (
              <button
                className="p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery('')}
                title="Clear focus"
                aria-label="Clear focus"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {focusTag ? `${shownTags} related · of ${totalTags} total` : `${totalTags} tags · ${totalConnections} connections`}
          </span>
          <button
            className="ml-auto p-1.5 rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 relative">
          {searchQuery && !focusTag ? (
            <div className="h-full flex items-center justify-center text-center px-10">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No tag matches "{searchQuery}".</p>
                <button className="text-xs text-primary hover:underline" onClick={() => setSearchQuery('')}>
                  Clear and show all tags
                </button>
              </div>
            </div>
          ) : !graph || graph.nodes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center px-10">
              <p className="text-sm text-muted-foreground max-w-md">
                No tags yet. Add <code>#tag</code> markers to your notes and they'll appear here, connected by
                co-occurrence.
              </p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="w-full h-full cursor-grab"
              onWheel={onWheel}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <defs>
                <radialGradient id="nodeGlow">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.9" />
                  <stop offset="70%" stopColor="var(--color-primary)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                </radialGradient>
              </defs>

              <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
                {linksRef.current.map((l) => {
                  const s = typeof l.source === 'string' ? null : l.source
                  const t = typeof l.target === 'string' ? null : l.target
                  if (!s || !t) return null
                  const dimmed = anchor !== null && s.id !== anchor && t.id !== anchor
                  return (
                    <GraphEdge
                      key={`${s.id}|${t.id}`}
                      x1={s.x ?? 0}
                      y1={s.y ?? 0}
                      x2={t.x ?? 0}
                      y2={t.y ?? 0}
                      weight={l.weight}
                      dimmed={dimmed}
                      showLabel={focusTag !== null && shownTags <= 40 && !dimmed}
                    />
                  )
                })}

                {nodesRef.current.map((n) => {
                  const isFocus = n.id === focusTag
                  const isHovered = n.id === hovered
                  const isNeighbor = !isFocus && !isHovered && neighborTags?.has(n.id) === true
                  const dimmed = anchor !== null && !isFocus && !isHovered && !isNeighbor
                  return (
                    <GraphNode
                      key={n.id}
                      node={n}
                      x={n.x ?? 0}
                      y={n.y ?? 0}
                      isFocus={isFocus}
                      dimmed={dimmed}
                      sublabel={focusTag && !isFocus ? `${sharedWithFocus.get(n.id) ?? 0} · ${n.count}` : String(n.count)}
                      onHover={hoverNode}
                      onMouseDown={onNodeMouseDown}
                      onFocus={focusNode}
                    />
                  )
                })}
              </g>
            </svg>
          )}
        </div>

        <div className="px-4 py-1.5 border-t border-border-subtle text-[11px] text-muted-foreground flex items-center justify-between gap-4">
          <span>
            {focusTag
              ? 'Click any tag to re-focus · Esc clears the filter'
              : 'Type to focus on a tag · scroll to pan · ⌘-scroll to zoom · drag to arrange'}
          </span>
          <span className="whitespace-nowrap">
            {focusTag ? (
              <>
                Size + proximity = <span className="text-foreground/80">shared notes with #{focusTag}</span>
                {' · '}labels show <span className="font-mono">shared · total</span>
              </>
            ) : (
              <>Size = notes per tag · line thickness = shared notes</>
            )}
          </span>
        </div>
      </div>

      <aside className="w-[320px] border-l border-border flex flex-col" style={{ background: 'var(--color-sidebar-alt)' }}>
        {focusTag ? (
          <>
            <header className="px-4 py-3 border-b border-border-subtle">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Focus tag</div>
              <div className="text-lg font-semibold truncate" style={{ color: 'var(--color-primary)' }}>
                #{focusTag}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {focusFiles.length} {focusFiles.length === 1 ? 'note' : 'notes'} · {topNeighbors.length} related{' '}
                {topNeighbors.length === 1 ? 'tag' : 'tags'}
              </div>
            </header>

            {topNeighbors.length > 0 && (
              <section className="border-b border-border-subtle">
                <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                  Strongest relations
                </h3>
                <ul className="pb-2">
                  {topNeighbors.slice(0, 10).map(({ tag, weight }) => (
                    <li key={tag}>
                      <button
                        className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-sidebar-hover transition-colors text-sm"
                        onClick={() => setSearchQuery(tag)}
                        onMouseEnter={() => setHovered(tag)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <span className="truncate" style={{ color: 'var(--color-primary)' }}>
                          #{tag}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono tabular-nums ml-2">{weight}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex-1 min-h-0 flex flex-col">
              <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                Notes with #{focusTag}
              </h3>
              <ul className="flex-1 overflow-y-auto">
                {focusFiles.length === 0 ? (
                  <li className="px-4 py-4 text-xs text-muted-foreground">No notes declare this tag explicitly.</li>
                ) : (
                  focusFiles.map((path) => (
                    <li key={path}>
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-foreground/90 hover:text-foreground hover:bg-sidebar-hover border-b border-border-subtle/40 truncate"
                        onClick={() => {
                          onOpenFile(path)
                          onClose()
                        }}
                        title={path}
                      >
                        {noteTitle(path)}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </>
        ) : (
          <div className="p-4 text-sm text-muted-foreground space-y-3">
            <p className="font-medium text-foreground">Start exploring</p>
            <p>
              Type a tag in the search box above to focus on its neighbourhood. You'll see the tag plus every
              other tag it co-occurs with, cleanly laid out.
            </p>
            <p>
              Click any circle in the graph to re-focus on that tag and follow a chain of associations.
              Relations you didn't know existed tend to surface this way.
            </p>
            <p className="text-xs text-muted-foreground/70 pt-2 border-t border-border-subtle">
              Tip: the number next to each node is how many notes use that tag. Edge numbers (shown in focus
              mode) are how many notes share both endpoints.
            </p>
          </div>
        )}
      </aside>
    </Modal>
  )
}

const GraphEdge = memo(function GraphEdge({
  x1,
  y1,
  x2,
  y2,
  weight,
  dimmed,
  showLabel
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  weight: number
  dimmed: boolean
  showLabel: boolean
}) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--color-foreground)"
        strokeOpacity={dimmed ? 0.06 : 0.26}
        strokeWidth={Math.min(5, 0.8 + Math.log2(weight + 1) * 1.1)}
      />
      {showLabel && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2}
          textAnchor="middle"
          fill="var(--color-muted-foreground)"
          fontSize={9}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {weight}
        </text>
      )}
    </g>
  )
})

const GraphNode = memo(function GraphNode({
  node,
  x,
  y,
  isFocus,
  dimmed,
  sublabel,
  onHover,
  onMouseDown,
  onFocus
}: {
  node: Node
  x: number
  y: number
  isFocus: boolean
  dimmed: boolean
  sublabel: string
  onHover: (tag: string | null) => void
  onMouseDown: (e: React.MouseEvent, n: Node) => void
  onFocus: (tag: string) => void
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onMouseDown={(e) => onMouseDown(e, node)}
      onClick={(e) => {
        e.stopPropagation()
        onFocus(node.tag)
      }}
      style={{ opacity: dimmed ? 0.22 : 1, transition: 'opacity 150ms' }}
    >
      {isFocus && <circle r={node.radius * 2.4} fill="url(#nodeGlow)" pointerEvents="none" />}
      <circle
        r={node.radius}
        fill={isFocus ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 45%, var(--color-background))'}
        stroke={isFocus ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 70%, transparent)'}
        strokeWidth={isFocus ? 3 : 1.5}
      />
      <text
        y={node.radius + 14}
        textAnchor="middle"
        fill="var(--color-foreground)"
        fontSize={12 + Math.min(3, Math.log2(node.count + 1))}
        fontWeight={isFocus ? 600 : 500}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        #{node.tag}
      </text>
      <text
        y={node.radius + 27}
        textAnchor="middle"
        fill="var(--color-muted-foreground)"
        fontSize={10}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {sublabel}
      </text>
    </g>
  )
})
