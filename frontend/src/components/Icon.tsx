import { useId } from 'react'

// Line icons (24x24 viewBox)
const PATHS: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  forward: 'M9 18l6-6-6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
  heart: 'M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 5.6 5 5 0 0 1 21.2 11c-2.2 4.6-9.2 9-9.2 9z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  pause: 'M8 5v14M16 5v14',
  // a gauge (the slideshow interval set by the page)
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6M12 6v1.5M6.3 8.3l1 1M17.7 8.3l-1 1',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  play: 'M7 4v16l13-8z',
  // two arrows going round (a repost)
  repost: 'M17 2l3 3-3 3M20 5H8a4 4 0 0 0-4 4v2M7 22l-3-3 3-3M4 19h12a4 4 0 0 0 4-4v-2',
  // an eye (views)
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  // a speaker, with waves / crossed out (a video's sound)
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  volumeOff: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  // a frame with a play mark (a video)
  video: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM10 9v6l5-3z',
  // a globe (a site from a site plugin)
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9',
  // back to the first page: a bar with an arrow pointing to it (flipped for right-to-left)
  toFirst: 'M6 5v14M18 6l-7 6 7 6',
  // a push pin (tilted with the class pin-off)
  pin: 'M12 17v5M8 3h8M9 3v6.5L6 14v3h12v-3l-3-4.5V3',
  // a bar and an arrow out of it (go on to the next work)
  nextWork: 'M5 4v16M9 12h11M15 7l5 5-5 5',
  // reading direction: a spread with an arrow pointing the way pages go
  dirRtl: 'M3 5h8v14H3zM13 5h8v14h-8zM9 12H5M7 10l-2 2 2 2',
  dirLtr: 'M3 5h8v14H3zM13 5h8v14h-8zM15 12h4M17 10l2 2-2 2',
  // fit: whole page in the screen / width / height / actual size
  fitContain: 'M4 4h16v16H4zM8 8h8v8H8zM4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4',
  fitWidth: 'M3 4v16M21 4v16M6 12h12M9 9l-3 3 3 3M15 9l3 3-3 3',
  fitHeight: 'M4 3h16M4 21h16M12 6v12M9 9l3-3 3 3M9 15l3 3 3-3',
  fitOriginal: 'M4 5h16v14H4zM8 9.5l1.5-1v7M15 9.5l1.5-1v7M12 11v.01M12 14v.01',
  // cover alone: one page, then a spread
  coverSingle: 'M2 6h6v12H2zM11 6h5.5v12H11zM16.5 6H22v12h-5.5z',
  // shift by one: a spread with an arrow moving it by one page
  shiftOne: 'M4 4h7v11H4zM13 4h7v11h-7zM6 20h12M15 18l3 2-3 2',
  // a screen (display settings)
  display: 'M3 4h18v12H3zM8 20h8M12 16v4',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  // tab icons of the local folders
  books: 'M4 4h4v16H4zM10 4h4v16h-4zM15.6 5.2l3.4-.9 3.1 14.6-3.4.9z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  external: 'M14 3h7v7M21 3l-9 9M19 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exitFullscreen: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  single: 'M7 3h10v18H7z',
  spread: 'M3 4h8v16H3zM13 4h8v16h-8z',
  scroll: 'M7 2h10v8H7zM7 14h10v8H7z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  list: 'M4 5h4v4H4zM11 7h9M4 15h4v4H4zM11 17h9',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  close: 'M6 6l12 12M18 6L6 18',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
  swap: 'M7 16l-4-4 4-4M3 12h18M17 8l4 4-4 4',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  plus: 'M12 5v14M5 12h14',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  book: 'M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h14',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  check: 'M5 12l5 5L20 7',
  // a funnel (the filters) and an arrow up (folding them away)
  filter: 'M3 5h18l-7 8.5V19l-4 2v-7.5z',
  chevronUp: 'M6 15l6-6 6 6',
  // an i in a circle (the work's info)
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'
}

/** A part drawn over a cut icon: a path, optionally with its own stroke width or filled */
type PlainPart = { d: string; width?: number; fill?: boolean }

/**
 * Icons made of a path with a gap cut out where another path crosses it: masked is drawn with cut erased
 * (a stroke of cutWidth), then plain is drawn over it
 */
const CUT_ICONS: Record<
  string,
  { masked: string; maskedWidth?: number; plain: string | PlainPart[]; cut: string; cutWidth: number; cutFill?: boolean }
> = {
  // the bookmark icon with |◀ ▶| across it; the bookmark's sides are cut where the arrows cross them (bookmark a page range).
  // The arrows are bolder than the bookmark, with filled heads, so they stand out
  bookmarkRange: {
    masked: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
    plain: [
      { d: 'M1.5 8v6M22.5 8v6', width: 2.4 },
      { d: 'M6 11h12', width: 2.2 },
      { d: 'M3 11l4-3.2v6.4zM21 11l-4-3.2v6.4z', width: 1, fill: true }
    ],
    cut: 'M1 11h22',
    cutWidth: 10
  },
  // the history mark with a slash from top right to bottom left (recently opened works come later)
  historyOff: {
    masked: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
    plain: 'M20.5 3.5l-17 17',
    cut: 'M20.5 3.5l-17 17',
    cutWidth: 5
  }
}

export function Icon({
  name,
  size = 18,
  fill = false,
  className
}: {
  name: keyof typeof PATHS | string
  size?: number
  fill?: boolean
  className?: string
}) {
  // useId gives ids like ":r0:"; keep only characters that are safe inside url(#...)
  const maskId = 'cut' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const cut = CUT_ICONS[name]
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {cut ? (
        <>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="#fff" stroke="none" />
            <path d={cut.cut} stroke="#000" strokeWidth={cut.cutWidth} fill={cut.cutFill ? '#000' : 'none'} />
          </mask>
          <path d={cut.masked} mask={`url(#${maskId})`} strokeWidth={cut.maskedWidth} />
          {typeof cut.plain === 'string' ? (
            <path d={cut.plain} fill="none" />
          ) : (
            cut.plain.map((p) => <path key={p.d} d={p.d} strokeWidth={p.width} fill={p.fill ? 'currentColor' : 'none'} />)
          )}
        </>
      ) : (
        <path d={PATHS[name] ?? ''} />
      )}
    </svg>
  )
}
