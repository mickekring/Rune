import { memo } from 'react'
import { baseName, parentDir } from '@shared/paths'
import { api } from '@/lib/api'
import { useAppStore } from '@/store'
import { MoonIcon, PanelIcon, SunIcon } from '../ui/icons'

function shortPath(path: string): string {
  const parent = baseName(parentDir(path))
  return parent ? `${parent}/${baseName(path)}` : baseName(path)
}

export const StatusBar = memo(function StatusBar() {
  const currentFile = useAppStore((s) => s.editor.currentFile)
  const isDirty = useAppStore((s) => s.editor.isDirty)
  const isSaving = useAppStore((s) => s.editor.isSaving)
  const cursorLine = useAppStore((s) => s.editor.cursorLine)
  const cursorColumn = useAppStore((s) => s.editor.cursorColumn)
  const notice = useAppStore((s) => s.editor.notice)
  const theme = useAppStore((s) => s.settings.theme)
  const leftVisible = useAppStore((s) => s.ui.leftSidebarVisible)
  const rightVisible = useAppStore((s) => s.ui.rightSidebarVisible)

  return (
    <div className="h-6 bg-sidebar border-t border-border-subtle flex items-center justify-between px-2 text-xs">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <button
          className="btn-ghost flex items-center justify-center p-0.5"
          onClick={() => void api.toggleLeftSidebar()}
          title={leftVisible ? 'Hide left sidebar' : 'Show left sidebar'}
          aria-label={leftVisible ? 'Hide left sidebar' : 'Show left sidebar'}
        >
          <PanelIcon side="left" active={leftVisible} />
        </button>
        {currentFile ? (
          <span className="text-muted-foreground truncate font-mono pl-1">{shortPath(currentFile)}</span>
        ) : (
          <span className="text-muted-foreground pl-1">No note open</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-4 min-w-0">
        {notice ? (
          <span
            className={`truncate ${notice.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
            title={notice.text}
          >
            {notice.text}
          </span>
        ) : isSaving ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse-subtle" />
            <span className="text-muted-foreground">Saving...</span>
          </>
        ) : isDirty ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning" />
            <span className="text-muted-foreground">Unsaved</span>
          </>
        ) : currentFile ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-muted-foreground">Saved</span>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {currentFile && (
          <span className="text-muted-foreground font-mono tabular-nums">
            Ln {cursorLine}, Col {cursorColumn}
          </span>
        )}
        <button
          className="btn-ghost flex items-center gap-1.5 py-0.5"
          onClick={() => void api.setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <SunIcon size={12} /> : <MoonIcon size={12} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button
          className="btn-ghost flex items-center justify-center p-0.5"
          onClick={() => void api.toggleRightSidebar()}
          title={rightVisible ? 'Hide right sidebar' : 'Show right sidebar'}
          aria-label={rightVisible ? 'Hide right sidebar' : 'Show right sidebar'}
        >
          <PanelIcon side="right" active={rightVisible} />
        </button>
      </div>
    </div>
  )
})
