/**
 * Icon — the line icons of Lab 3D, drawn in currentColor so the HUD's light
 * colours them. Components only (Fast Refresh): sizes are props.
 *
 * @module ui/Icon
 */
import type { ReactNode } from 'react';

function Svg({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const Check = ({ size }: { size?: number }) => <Svg size={size}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const Close = ({ size }: { size?: number }) => <Svg size={size}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Cube = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M3 7l9 5 9-5" /><path d="M12 12v10" /></Svg>;
export const Grid = ({ size }: { size?: number }) => <Svg size={size}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></Svg>;
export const Spark = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8" /></Svg>;
export const Landscape = ({ size }: { size?: number }) => <Svg size={size}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.6" /></Svg>;
export const People = ({ size }: { size?: number }) => <Svg size={size}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="9.5" r="2.3" /><path d="M16 14.6c2.2.2 3.8 1.6 4.5 4" /></Svg>;
export const Orbit = ({ size }: { size?: number }) => <Svg size={size}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></Svg>;
export const Target = ({ size }: { size?: number }) => <Svg size={size}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>;
export const Flip = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 3v18" /><path d="M8 7 4 12l4 5" /><path d="M16 7l4 5-4 5" /></Svg>;
export const Lock = ({ size }: { size?: number }) => <Svg size={size}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></Svg>;
export const Upload = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3" /></Svg>;
/** Mountains in front of each other: the décor laid on its depth. */
export const Relief = ({ size }: { size?: number }) => <Svg size={size}><path d="M2.5 19.5 9 9.5l4 6" /><path d="M10.5 19.5 15.5 12l6 7.5" /><path d="M2.5 19.5h19" /></Svg>;
/** A painting in its frame: the frame, the canvas, a hill and a sun. */
export const Painting = ({ size }: { size?: number }) => <Svg size={size}><rect x="2.5" y="3.5" width="19" height="17" rx="1.5" /><rect x="5.5" y="6.5" width="13" height="11" rx="0.5" /><path d="M5.5 15.5l4-4 3 3 2-2 4 4" /><circle cx="15" cy="9.5" r="1.2" /></Svg>;
/** Layers floating over each other: the painting cut into its world. */
export const Layers = ({ size }: { size?: number }) => <Svg size={size}><path d="M12 3 3 7.5 12 12l9-4.5z" /><path d="M3 12l9 4.5 9-4.5" /><path d="M3 16.5 12 21l9-4.5" /></Svg>;
/** A magnifier with a plus: diving into a painting. */
export const Dive = ({ size }: { size?: number }) => <Svg size={size}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.3 15.3 21 21" /><path d="M10.5 7.5v6M7.5 10.5h6" /></Svg>;
/** Two dates blended: two circles over each other. */
export const Blend = ({ size }: { size?: number }) => <Svg size={size}><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></Svg>;
/** What changed between two dates: a frame, half of it lit. */
export const Diff = ({ size }: { size?: number }) => <Svg size={size}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M12 4.5v15" /><path d="M14.5 8l3.5 3.5M14.5 12l3.5 3.5" /></Svg>;
export const Film = ({ size }: { size?: number }) => <Svg size={size}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M7 4.5v15M17 4.5v15M3 9h4M3 15h4M17 9h4M17 15h4" /></Svg>;
export const Expand = ({ size }: { size?: number }) => <Svg size={size}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>;
export const Phone = ({ size }: { size?: number }) => <Svg size={size}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /><circle cx="12" cy="9.5" r="2.6" /></Svg>;
export const Photos = ({ size }: { size?: number }) => <Svg size={size}><rect x="6.5" y="3" width="14.5" height="12.5" rx="2" /><path d="M3 7.5v11a2 2 0 0 0 2 2h11" /><path d="M6.5 12.5l3.5-3.5 3 3 2-2 5.5 5" /></Svg>;
export const Stop = ({ size }: { size?: number }) => <Svg size={size}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>;
export const Scan = ({ size }: { size?: number }) => <Svg size={size}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M4 12h16" /></Svg>;
export const Scissors = ({ size }: { size?: number }) => <Svg size={size}><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8.2 7.7 20 18M8.2 16.3 20 6" /></Svg>;
export const ChevronLeft =({ size }: { size?: number }) => <Svg size={size}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
export const ChevronRight = ({ size }: { size?: number }) => <Svg size={size}><path d="M9.5 5.5 16 12l-6.5 6.5" /></Svg>;
export const ChevronUp = ({ size }: { size?: number }) => <Svg size={size}><path d="M5.5 14.5 12 8l6.5 6.5" /></Svg>;
export const ChevronDown = ({ size }: { size?: number }) => <Svg size={size}><path d="M5.5 9.5 12 16l6.5-6.5" /></Svg>;
/** Someone walking: the visit inside a scene. */
export const Walk = ({ size }: { size?: number }) => <Svg size={size}><circle cx="13" cy="4.5" r="1.8" /><path d="M10.5 21l2-6.5-2.5-2.5 1-4.5 3.5 2.5 2.5.5" /><path d="M11 8l-3.5 1.5-1 3.5" /><path d="M12.5 14.5l2.5 2.5v4" /></Svg>;
export const Retry = ({ size }: { size?: number }) => <Svg size={size}><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></Svg>;
/** The tile sizes, as Finder and Explorer draw them: nine, four, one. */
export const GridSmall = ({ size }: { size?: number }) => (
  <Svg size={size}><rect x="3" y="3" width="4.5" height="4.5" rx="1" /><rect x="9.75" y="3" width="4.5" height="4.5" rx="1" /><rect x="16.5" y="3" width="4.5" height="4.5" rx="1" /><rect x="3" y="9.75" width="4.5" height="4.5" rx="1" /><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1" /><rect x="16.5" y="9.75" width="4.5" height="4.5" rx="1" /><rect x="3" y="16.5" width="4.5" height="4.5" rx="1" /><rect x="9.75" y="16.5" width="4.5" height="4.5" rx="1" /><rect x="16.5" y="16.5" width="4.5" height="4.5" rx="1" /></Svg>
);
export const GridMedium = ({ size }: { size?: number }) => (
  <Svg size={size}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></Svg>
);
export const GridLarge = ({ size }: { size?: number }) => <Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2" /></Svg>;

/** The Lab 3D mark: three rings, the inner one in the chosen green. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14" stroke="var(--lab-cyan)" strokeWidth="1.4" opacity="0.55" />
      <circle cx="16" cy="16" r="9.5" stroke="var(--lab-cyan)" strokeWidth="1.6" strokeDasharray="4 3" />
      <circle cx="16" cy="16" r="4.2" fill="var(--lab-green)" />
    </svg>
  );
}
