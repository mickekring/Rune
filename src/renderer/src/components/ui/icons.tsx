import type { ReactNode, SVGProps } from 'react'

// Every inline SVG icon in one place. All icons share a 24x24 viewBox and
// inherit `currentColor`, so callers only set size and className.

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

type Variant = 'stroke' | 'fill'

function makeIcon(children: ReactNode, variant: Variant = 'stroke', strokeWidth = 2) {
  return function Icon({ size = 16, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={variant === 'fill' ? 'currentColor' : 'none'}
        stroke={variant === 'fill' ? 'none' : 'currentColor'}
        strokeWidth={variant === 'fill' ? undefined : strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {children}
      </svg>
    )
  }
}

export const CloseIcon = makeIcon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
)

export const SearchIcon = makeIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>
)

export const ChevronIcon = makeIcon(<polyline points="9 18 15 12 9 6" />)

export const FolderIcon = makeIcon(
  <path d="M4 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-9l-2-3H4z" />,
  'fill'
)

export const FolderOpenIcon = makeIcon(
  <>
    <path d="M2 5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1H2V5z" />
    <path
      opacity="0.7"
      d="M2 9h19.5a1.5 1.5 0 0 1 1.46 1.84l-1.84 8A1.5 1.5 0 0 1 19.66 20H4a2 2 0 0 1-2-2V9z"
    />
  </>,
  'fill'
)

export const FolderOutlineIcon = makeIcon(
  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
)

export const NewFolderIcon = makeIcon(
  <>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M12 11v6M9 14h6" />
  </>
)

export const FileIcon = makeIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </>,
  'stroke',
  1.5
)

export const NewNoteIcon = makeIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 18v-6M9 15h6" />
  </>
)

export const SettingsIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
)

export const SlidersIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
  </>
)

export const TagIcon = makeIcon(
  <>
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </>
)

export const ConstellationIcon = makeIcon(
  <>
    <circle cx="5" cy="7" r="2" />
    <circle cx="19" cy="8" r="2" />
    <circle cx="12" cy="18" r="2" />
    <line x1="7" y1="7.5" x2="17" y2="8" />
    <line x1="6" y1="9" x2="11" y2="16.5" />
    <line x1="18" y1="10" x2="13" y2="16.5" />
  </>
)

export const LogoIcon = makeIcon(
  <>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </>,
  'stroke',
  1.5
)

export const TrashIcon = makeIcon(
  <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>
)

export const RenameIcon = makeIcon(
  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
)

export const RestoreIcon = makeIcon(
  <>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </>
)

export const SnapshotIcon = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M8 4V2M16 4V2" />
  </>
)

export const SunIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </>
)

export const MoonIcon = makeIcon(
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
)

export const SendIcon = makeIcon(
  <>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </>,
  'stroke',
  2.5
)

export const SpinnerIcon = makeIcon(
  <>
    <path d="M12 2 A10 10 0 0 1 22 12" />
    <circle cx="12" cy="12" r="10" opacity="0.25" />
  </>,
  'stroke',
  2.5
)

export const GripIcon = makeIcon(
  <>
    <circle cx="9" cy="5" r="1.6" />
    <circle cx="15" cy="5" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="19" r="1.6" />
    <circle cx="15" cy="19" r="1.6" />
  </>,
  'fill'
)

export function PanelIcon({ side, active, size = 14 }: { side: 'left' | 'right'; active: boolean; size?: number }) {
  const x = side === 'left' ? 3.5 : 15
  const lineX = side === 'left' ? 9 : 15
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.55 }}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1={lineX} y1="3" x2={lineX} y2="21" />
      {active && (
        <rect x={x} y="3.5" width="5.5" height="17" rx="1.5" fill="currentColor" opacity="0.35" stroke="none" />
      )}
    </svg>
  )
}
