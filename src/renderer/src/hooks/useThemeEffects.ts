import { useEffect } from 'react'
import { fontSizeValues } from '@shared/types/store'
import { useAppStore } from '@/store'

/** Apply theme, accent color, and font size from settings to the document root. */
export function useThemeEffects(): void {
  const theme = useAppStore((s) => s.settings.theme)
  const accentColor = useAppStore((s) => s.settings.accentColor)
  const fontSize = useAppStore((s) => s.settings.fontSize)

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-accent', accentColor)
    root.style.setProperty('--color-primary', accentColor)
    const px = fontSizeValues[fontSize] ?? 16
    root.style.setProperty('--font-size-base', `${px}px`)
    root.style.setProperty('--editor-font-size', `${px}px`)
    // rem-based sizing everywhere scales with the html font size.
    root.style.fontSize = `${px}px`
  }, [accentColor, fontSize])
}
