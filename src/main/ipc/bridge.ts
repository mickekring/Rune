import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  EventChannel,
  EventData,
  InvokeArgs,
  InvokeChannel,
  InvokeResult
} from '@shared/ipc'

/** Register a handler whose arguments and result are typed from the IPC map. */
export function handle<C extends InvokeChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: InvokeArgs<C>
  ) => InvokeResult<C> | Promise<InvokeResult<C>>
): void {
  ipcMain.handle(channel, (event, ...args) => handler(event, ...(args as InvokeArgs<C>)))
}

/** Push a typed event to every open window. */
export function broadcast<C extends EventChannel>(channel: C, data: EventData<C>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

/** Push a typed event to one window (no-op if it is gone). */
export function sendTo<C extends EventChannel>(
  win: BrowserWindow | null,
  channel: C,
  data: EventData<C>
): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}
