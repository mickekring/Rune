import { useCallback, useEffect, useRef, useState } from 'react'
import { noteTitle } from '@shared/paths'
import { AppLayout } from '@/components/layout/AppLayout'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { EditableTitle } from '@/components/editor/EditableTitle'
import { WelcomeModal } from '@/components/modals/WelcomeModal'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { FolderOutlineIcon, LogoIcon } from '@/components/ui/icons'
import { useEditorBuffer } from '@/hooks/useEditorBuffer'
import { useVaultActions } from '@/hooks/useVaultActions'
import { useThemeEffects } from '@/hooks/useThemeEffects'
import { api } from '@/lib/api'
import { showNotice, useAppStore } from '@/store'

export default function App() {
  const hydrated = useAppStore((s) => s.hydrated)
  const vaultPath = useAppStore((s) => s.settings.vaultPath)
  const buffer = useEditorBuffer()
  const { doc, editorRef, openFile, closeFile, flush, save, replaceContent, getCurrentFile, getContent, handleChange, handleCursorChange } = buffer
  const actions = useVaultActions(buffer)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [restorePending, setRestorePending] = useState<string | null>(null)
  const openedVaultRef = useRef<string | null>(null)
  useThemeEffects()

  // Open the persisted vault once hydrated and reopen the last note.
  useEffect(() => {
    if (!hydrated || !vaultPath || openedVaultRef.current === vaultPath) return
    let cancelled = false
    void (async () => {
      const result = await api.openVault(vaultPath)
      if (cancelled) return
      if (!result.ok) {
        setVaultError(result.error)
        return
      }
      openedVaultRef.current = result.vaultPath
      setVaultError(null)
      const last = useAppStore.getState().ui.lastOpenedFile
      if (last) void openFile(last)
    })()
    return () => {
      cancelled = true
    }
  }, [hydrated, vaultPath, openFile])

  const changeVault = useCallback(async () => {
    const path = await api.selectVault()
    if (!path) return
    if (!(await flush())) return
    closeFile()
    const result = await api.openVault(path)
    if (!result.ok) {
      setVaultError(result.error)
      showNotice('error', `Could not open vault: ${result.error}`)
      return
    }
    openedVaultRef.current = result.vaultPath
    setVaultError(null)
  }, [closeFile, flush])

  const createSnapshot = useCallback(async () => {
    const path = getCurrentFile()
    if (!path) return
    if (!(await flush())) return
    const meta = await api.createSnapshot(path)
    if (meta) showNotice('info', 'Snapshot saved')
    else showNotice('error', 'Could not save a snapshot')
  }, [flush, getCurrentFile])

  const deleteSnapshot = useCallback(
    async (snapshotId: string) => {
      const path = getCurrentFile()
      if (!path) return
      const result = await api.deleteSnapshot(path, snapshotId)
      if (!result.ok) showNotice('error', `Could not delete snapshot: ${result.error}`)
    },
    [getCurrentFile]
  )

  const confirmRestore = useCallback(async () => {
    const snapshotId = restorePending
    setRestorePending(null)
    const path = getCurrentFile()
    if (!snapshotId || !path) return
    const result = await api.restoreSnapshot(path, snapshotId)
    if (!result.ok) {
      showNotice('error', `Could not restore snapshot: ${result.error}`)
      return
    }
    replaceContent(result.content)
    showNotice('info', 'Snapshot restored')
  }, [getCurrentFile, replaceContent, restorePending])

  const showWelcome = hydrated && (!vaultPath || vaultError !== null)

  return (
    <>
      <AppLayout
        onFileSelect={openFile}
        onNewFile={actions.createNote}
        onNewFolder={actions.createFolder}
        onDeleteNode={actions.deleteNode}
        onRenameNode={actions.renameNode}
        onMoveNode={actions.moveNode}
        onCreateSnapshot={createSnapshot}
        onRestoreSnapshot={setRestorePending}
        onDeleteSnapshot={deleteSnapshot}
        onFlushEditor={flush}
        onSave={save}
        getDocumentText={getContent}
        onChangeVault={changeVault}
      >
        {doc.path ? (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-shrink-0 max-w-4xl mx-auto w-full px-10">
              <EditableTitle value={noteTitle(doc.path)} onChange={actions.renameCurrentTitle} />
            </div>
            <div className="flex-1 max-w-4xl mx-auto w-full overflow-hidden">
              <MarkdownEditor
                key={doc.version}
                ref={editorRef}
                initialValue={doc.content}
                onChange={handleChange}
                onCursorChange={handleCursorChange}
                onDropFile={api.saveAttachment}
              />
            </div>
          </div>
        ) : (
          <EmptyState hasVault={!!vaultPath} onSelectVault={changeVault} />
        )}
      </AppLayout>

      <WelcomeModal isOpen={showWelcome} error={vaultError} onSelectVault={changeVault} />

      {restorePending !== null && (
        <ConfirmModal
          title="Restore snapshot"
          message="This will replace the current note with the snapshot. Your latest edits will be overwritten. Save a snapshot first if you want to keep them."
          confirmLabel="Restore"
          variant="destructive"
          onConfirm={confirmRestore}
          onCancel={() => setRestorePending(null)}
        />
      )}
    </>
  )
}

function EmptyState({ hasVault, onSelectVault }: { hasVault: boolean; onSelectVault: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
          <LogoIcon size={32} />
        </div>
        <h1 className="text-2xl font-semibold mb-3 text-foreground">
          {hasVault ? 'Ready to Write' : 'Welcome to Rune'}
        </h1>
        <p className="text-muted-foreground mb-6">
          {hasVault
            ? 'Select a note from the sidebar to start editing, or create a new note.'
            : 'Select a vault to get started with your workspace.'}
        </p>
        {!hasVault && (
          <button
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors"
            onClick={onSelectVault}
          >
            <FolderOutlineIcon />
            Select Vault
          </button>
        )}
      </div>
    </div>
  )
}
