import { useCallback, useEffect, useRef, useState } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  currentWidth: number
  minWidth: number
  maxWidth: number
  /** Called on every mouse move while dragging (local feedback only). */
  onResize: (width: number) => void
  /** Called once on mouse-up with the final width (persist here). */
  onResizeEnd: (width: number) => void
}

export function ResizeHandle({
  side,
  currentWidth,
  minWidth,
  maxWidth,
  onResize,
  onResizeEnd
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const latestWidthRef = useRef(currentWidth)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      startXRef.current = e.clientX
      startWidthRef.current = currentWidth
      latestWidthRef.current = currentWidth
    },
    [currentWidth]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent): void => {
      const delta = side === 'left' ? e.clientX - startXRef.current : startXRef.current - e.clientX
      const width = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta))
      latestWidthRef.current = width
      onResize(width)
    }
    const handleMouseUp = (): void => {
      setIsDragging(false)
      onResizeEnd(latestWidthRef.current)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, side, minWidth, maxWidth, onResize, onResizeEnd])

  return (
    <div
      className={`resize-handle ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={currentWidth}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
    />
  )
}
