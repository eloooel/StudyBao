import { cn } from '@/lib/cn'

/**
 * A labelled diagram of the Share sheet — **not a screenshot, and deliberately not drawn to look
 * like one.**
 *
 * ADR 0008 asks for a screenshot of the Share sheet, and nobody on this project can take one: it
 * needs a real iPad, held by a human. The alternative to this component was an empty placeholder box
 * plus a user-supplied PNG, which puts a user action *and* a source edit on the reveal's critical
 * path and looks unfinished if nobody does it. A schematic costs nothing, needs no asset, adds
 * nothing to the service worker precache, and is honest about what it is.
 *
 * Two rules it follows, and they pull against each other on purpose:
 *
 * 1. **It must actually help her find the row.** That is the entire job: Safari's toolbar, the Share
 *    glyph, and `Add to Home Screen` marked in the list.
 * 2. **It must not masquerade as Apple's UI.** So it carries a caption saying it is a diagram, its
 *    chrome is our own palette rather than iOS grey, and the other rows are neutral bars with no
 *    invented app icons. The one recognisable mark is the Share glyph itself — that is the thing she
 *    has to look for, and there is no useful way to describe it in words.
 *
 * If a real capture is ever dropped in, this is a swap of one component, not a redesign.
 */
export interface ShareSheetDiagramProps {
  className?: string
}

export function ShareSheetDiagram({ className }: ShareSheetDiagramProps) {
  return (
    <figure className={cn('flex flex-col items-center gap-2', className)}>
      <svg
        viewBox="0 0 320 300"
        // 4:3-ish and full width, so it reads as an illustration rather than as a photo of a device.
        className="w-full max-w-80 rounded-[var(--radius-card)] border border-line bg-canvas"
        role="img"
        aria-label="Diagram of Safari's Share menu, with Add to Home Screen near the top of the list and a note that it may be worth scrolling to find it."
      >
        {/* The sheet, inset like a popover rather than drawn as a full iPad screen. */}
        <rect
          x="16"
          y="14"
          width="288"
          height="272"
          rx="22"
          className="fill-surface stroke-line"
          strokeWidth="2"
        />

        {/* Grab handle, so it reads as a sheet that came up from the bottom. */}
        <rect x="146" y="26" width="28" height="5" rx="2.5" className="fill-line" />

        {/* Other destinations, deliberately anonymous: no invented app icons. */}
        <rect x="34" y="46" width="72" height="10" rx="5" className="fill-line" />
        <rect x="34" y="72" width="200" height="12" rx="6" className="fill-mauve" />
        <rect x="34" y="96" width="170" height="12" rx="6" className="fill-line" />
        <rect x="34" y="120" width="188" height="12" rx="6" className="fill-line" />
        <rect x="34" y="144" width="150" height="12" rx="6" className="fill-line" />
        <rect x="34" y="168" width="196" height="12" rx="6" className="fill-line" />
        <rect x="34" y="192" width="160" height="12" rx="6" className="fill-line" />

        {/* The row itself, outlined in the accent so it is the one thing the eye lands on. */}
        <rect
          x="26"
          y="63"
          width="270"
          height="30"
          rx="12"
          fill="none"
          className="stroke-accent"
          strokeWidth="2.5"
        />

        {/* The mark she is looking for. A drawing of the Share glyph, not a copy of iOS chrome. */}
        <g className="stroke-primary-strong" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M66 90V68" />
          <path d="M60 74l6-6 6 6" />
          <path d="M57 82v10h18V82" />
        </g>

        <text x="88" y="85" className="fill-ink" fontSize="14" fontFamily="inherit">
          Add to Home Screen
        </text>

        <text x="34" y="228" className="fill-ink-muted" fontSize="11.5" fontFamily="inherit">
          If you do not see it, scroll this list
        </text>
        <text x="34" y="244" className="fill-ink-muted" fontSize="11.5" fontFamily="inherit">
          down a little.
        </text>

        {/* The toolbar she has to reach first, at the bottom edge where it lives. */}
        <line x1="16" y1="258" x2="304" y2="258" className="stroke-line" strokeWidth="2" />
        <text x="34" y="281" className="fill-ink-muted" fontSize="11.5" fontFamily="inherit">
          Safari, down here
        </text>

        <path
          d="M232 280h-24"
          className="stroke-primary-strong"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M232 280v-11"
          className="stroke-primary-strong"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M236 276h12"
          className="stroke-primary-strong"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M236 288h12"
          className="stroke-primary-strong"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M248 276v12"
          className="stroke-primary-strong"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* The Share button in the toolbar, circled — the one thing she has to find herself. */}
        <circle cx="262" cy="279" r="17" fill="none" className="stroke-accent" strokeWidth="2.5" />
        <g className="stroke-primary-strong" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M262 288v-15" />
          <path d="M257 278l5-5 5 5" />
          <path d="M255 284v6h14v-6" />
        </g>
      </svg>

      <figcaption className="text-xs text-ink-faint">
        A diagram, not a screenshot. Your iPad's menu looks slightly different.
      </figcaption>
    </figure>
  )
}
