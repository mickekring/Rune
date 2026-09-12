import { app, shell, BrowserWindow, protocol, net, screen, session } from 'electron'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { realpathSync } from 'fs'
import { registerIPCHandlers } from './ipc/handlers'
import { mainStore } from './store'
import { settingsService, type WindowBounds } from './services/settings-service'
import { isSafeExternalUrl } from './services/path-guard'
import {
  APP_HOST,
  APP_SCHEME,
  MEDIA_FOLDER_NAME,
  MEDIA_HOST,
  MEDIA_SCHEME
} from '@shared/constants'

const RENDERER_DIR = resolve(__dirname, '../renderer')
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const APP_INDEX_URL = `${APP_ORIGIN}/index.html`
// Only used in development: packaged builds ship the icon via electron-builder.
const DEV_ICON = join(__dirname, '../../build/icon.png')

// Both schemes must be registered before app.whenReady(). `app://` serves
// the packaged renderer so the page has a real origin (file:// pages all
// share the opaque "null" origin, which defeats any origin-based
// navigation check). `vault-media://` streams attachments from the vault.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true }
  }
])

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.error('Another instance of Rune is already running — quitting.')
  app.quit()
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main:', reason)
})

function fileResponse(absolutePath: string): Promise<Response> {
  return net.fetch(pathToFileURL(absolutePath).toString())
}

function forbidden(): Response {
  return new Response('Forbidden', { status: 403 })
}

// Serve out/renderer/* at app://rune/*, confined to that directory.
// frame-ancestors is only honoured in a header, so the full policy is
// attached here; index.html carries the same policy in a <meta> for dev.
const APP_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: vault-media:; object-src 'none'; base-uri 'self'; " +
  "form-action 'none'; frame-ancestors 'none'"

async function handleAppRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  let pathname = url.pathname
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const absolute = resolve(RENDERER_DIR, `.${pathname}`)
  if (!absolute.startsWith(RENDERER_DIR + sep)) return forbidden()
  const response = await fileResponse(absolute)
  if (!pathname.endsWith('.html')) return response
  const headers = new Headers(response.headers)
  headers.set('Content-Security-Policy', APP_CSP)
  return new Response(response.body, { status: response.status, headers })
}

// Serve {vault}/vault_media/* at vault-media://local/*. Percent-encoded
// `..` survives URL normalisation, so the decoded path is re-resolved and
// realpath'd before anything is read.
function handleMediaRequest(request: Request): Promise<Response> | Response {
  const vaultPath = mainStore.getState().settings.vaultPath
  if (!vaultPath) return new Response('No vault open', { status: 404 })
  const mediaRoot = resolve(vaultPath, MEDIA_FOLDER_NAME)
  const url = new URL(request.url)
  if (url.host !== MEDIA_HOST) return forbidden()
  let relative: string
  try {
    relative = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const absolute = resolve(mediaRoot, relative)
  if (!absolute.startsWith(mediaRoot + sep)) return forbidden()
  let real: string
  try {
    real = realpathSync(absolute)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!real.startsWith(mediaRoot + sep)) return forbidden()
  return fileResponse(real)
}

// Drop remembered coordinates that no longer fall on a connected display
// (external monitor unplugged) so the window can never open off-screen.
function visibleBounds(saved: WindowBounds): WindowBounds {
  if (saved.x === undefined || saved.y === undefined) return saved
  const { x, y, width, height } = saved
  const onSomeDisplay = screen.getAllDisplays().some(({ workArea }) => {
    return (
      x + width > workArea.x + 50 &&
      x < workArea.x + workArea.width - 50 &&
      y >= workArea.y - 20 &&
      y < workArea.y + workArea.height - 50
    )
  })
  return onSomeDisplay ? saved : { width, height }
}

function createWindow(): void {
  const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const bounds = visibleBounds(settingsService.loadWindowBounds())

  const mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Rune',
    icon: app.isPackaged ? undefined : DEV_ICON,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Persist window bounds on resize/move (debounced) and on close.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const persistBounds = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return
    const { width, height, x, y } = mainWindow.getBounds()
    settingsService.saveWindowBounds({ width, height, x, y })
  }
  const schedulePersist = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistBounds, 400)
  }
  mainWindow.on('resize', schedulePersist)
  mainWindow.on('move', schedulePersist)
  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    persistBounds()
  })

  // Links never open in-app: http(s)/mailto go to the default browser,
  // everything else is dropped.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The only navigation the window may perform is to its own bundle.
  const isOwnUrl = (url: string): boolean => {
    if (devServerUrl) {
      try {
        return new URL(url).origin === new URL(devServerUrl).origin
      } catch {
        return false
      }
    }
    const bare = url.split('#')[0].split('?')[0]
    return bare === APP_INDEX_URL || bare === `${APP_ORIGIN}/`
  }
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isOwnUrl(url)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadURL(APP_INDEX_URL)
  }
}

app.on('second-instance', () => {
  const [mainWindow] = BrowserWindow.getAllWindows()
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('web-contents-created', (_, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

void app.whenReady().then(() => {
  app.setAppUserModelId('com.rune.app')
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(DEV_ICON)
    } catch {
      /* best-effort */
    }
  }

  // The renderer never needs camera, microphone, location, or notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  protocol.handle(APP_SCHEME, handleAppRequest)
  protocol.handle(MEDIA_SCHEME, handleMediaRequest)

  registerIPCHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
