// Runtime constants shared by the main, preload, and renderer bundles.

/** Folder inside the vault where dropped attachments are copied. */
export const MEDIA_FOLDER_NAME = 'vault_media'

/** Per-vault and per-user app directory name (`{vault}/.rune`, `~/.rune`). */
export const APP_DIR_NAME = '.rune'

/** Custom scheme that serves the packaged renderer bundle. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'rune'

/** Custom scheme that serves files from `{vault}/vault_media/`. */
export const MEDIA_SCHEME = 'vault-media'
export const MEDIA_HOST = 'local'

/** Debounce between the last keystroke and an automatic save. */
export const AUTOSAVE_DEBOUNCE_MS = 2500
