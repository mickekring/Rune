import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type RendererApi } from '@shared/ipc'

// The allowlists are derived from the shared contract, so a channel that
// exists in the type map is reachable and nothing else is. A compromised
// renderer can never reach a channel main did not intend to expose.
const allowedInvoke = new Set<string>(INVOKE_CHANNELS)
const allowedEvents = new Set<string>(EVENT_CHANNELS)

const api: RendererApi = {
  invoke: (channel, ...args) => {
    if (!allowedInvoke.has(channel)) {
      return Promise.reject(new Error(`IPC channel "${channel}" is not in the allowlist.`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel, callback) => {
    if (!allowedEvents.has(channel)) {
      console.error(`IPC event "${channel}" is not in the allowlist.`)
      return () => {}
    }
    const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as never)
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  getFilePath: (file) => webUtils.getPathForFile(file)
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose API:', error)
}
