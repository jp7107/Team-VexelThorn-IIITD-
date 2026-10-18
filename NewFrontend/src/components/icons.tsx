// Outline icon family (24px, 1.75 stroke) used across the shell and dashboard.
// All icons inherit `currentColor`; decorative use should pass aria-hidden (the default).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...props }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LeafIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </Svg>
  );
}

export function SproutIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M7 20h10" />
      <path d="M12 20v-8" />
      <path d="M12 12C12 8 9 5 5 5c0 4 3 7 7 7Z" />
      <path d="M12 12c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
      <path d="M12 16c-2.5 0-4.5-1.5-5-4" />
    </Svg>
  );
}

export function HomeIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </Svg>
  );
}

export function BellIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Svg>
  );
}

export function BotIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="15" cy="14" r="1" />
      <path d="M9.5 17h5" />
    </Svg>
  );
}

export function ChartIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </Svg>
  );
}

export function BarChartIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="7" width="4" height="13" rx="1" />
      <rect x="16" y="10" width="4" height="10" rx="1" />
    </Svg>
  );
}

export function CartIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h2.5l2.3 12.2A2 2 0 0 0 8.77 17H18.4a2 2 0 0 0 1.96-1.6L22 7H6" />
    </Svg>
  );
}

export function DropletIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 2.7c3.4 4.1 6 7.4 6 10.6a6 6 0 0 1-12 0c0-3.2 2.6-6.5 6-10.6Z" />
    </Svg>
  );
}

export function LandmarkIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 21h18" />
      <path d="M4 21V10M20 21V10M8 21V10M16 21V10M12 21V10" />
      <path d="M2.5 10 12 4l9.5 6Z" />
    </Svg>
  );
}

export function ClockIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Svg>
  );
}

export function HelpIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.2" />
      <circle cx="12" cy="17.3" r=".6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function GlobeIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Svg>
  );
}

export function ChevronRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function ChevronDownIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function CameraIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14.5 4h-5L8 6.5H4.5A1.5 1.5 0 0 0 3 8v10a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V8a1.5 1.5 0 0 0-1.5-1.5H16Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}

export function ArrowRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </Svg>
  );
}

export function AlertIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <circle cx="12" cy="16.2" r=".6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function InfoIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r=".6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SparklesIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m12 3 1.9 4.9 4.9 1.9-4.9 1.9L12 16.6l-1.9-4.9L5.2 9.8l4.9-1.9Z" />
      <path d="M19 15.5 20 18l2.5 1-2.5 1-1 2.5-1-2.5L15.5 19l2.5-1Z" />
    </Svg>
  );
}

export function CalendarIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Svg>
  );
}

export function PlayIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 6 3.5-6 3.5Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function UsersIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20c.6-3.2 3.1-5 6.2-5s5.6 1.8 6.2 5" />
      <path d="M16 5.2A3.4 3.4 0 0 1 16 11" />
      <path d="M18 15.6c1.7.7 2.8 2.1 3.2 4.4" />
    </Svg>
  );
}

export function ShieldIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3 5 6v5.5c0 4.6 3 8.2 7 9.5 4-1.3 7-4.9 7-9.5V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </Svg>
  );
}

export function DatabaseIcon(p: P) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      <path d="M4 11.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </Svg>
  );
}

export function ImageIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </Svg>
  );
}

export function CloudSunIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2.5v1M2.5 8h1M3.6 3.6l.7.7M12.4 3.6l-.7.7" />
      <path d="M8 18.5h9a3.5 3.5 0 0 0 .6-6.95A5 5 0 0 0 8.2 12.6 3 3 0 0 0 8 18.5Z" />
    </Svg>
  );
}

export function SettingsIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9c.07.6.5 1.1 1.03 1.33" />
    </Svg>
  );
}

export function MenuIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function CloseIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  );
}

export function SearchIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function StarIcon(p: P & { filled?: boolean }) {
  const { filled, ...rest } = p;
  return (
    <Svg {...rest} fill={filled ? "currentColor" : "none"}>
      <path d="m12 3.5 2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17.3l-5.38 2.85 1.03-6L3.3 9.9l6-.9Z" />
    </Svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

export function PlusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function SendIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14 21l-3.5-7.5L3 10Z" />
    </Svg>
  );
}

export function MapPinIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  );
}

export function LogOutIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}

export function FileTextIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5Z" />
      <path d="M14 2.5V7.5H19" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h2.5" />
    </Svg>
  );
}

export function TractorIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 16V9h6l2.5 4H18" />
      <circle cx="7" cy="18" r="3" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M10 9V5h4l1.5 4" />
    </Svg>
  );
}

export function LightningIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6Z" />
    </Svg>
  );
}

export function ArrowUpRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Svg>
  );
}

export function ArrowDownRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M7 7l10 10" />
      <path d="M17 8v9H8" />
    </Svg>
  );
}

export function MinusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  );
}

/** The Kisan Mitra leaf mark (green two-tone). */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="km-leaf-a" x1="10" y1="6" x2="38" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2eaa5f" />
          <stop offset="1" stopColor="#0a6b34" />
        </linearGradient>
        <linearGradient id="km-leaf-b" x1="12" y1="40" x2="26" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b5c2c" />
          <stop offset="1" stopColor="#36b26a" />
        </linearGradient>
      </defs>
      <path d="M41 7c-15 0-28 6-28 19 0 3.2 1 6 2.7 8.2C21 30 29 24.5 37 21c-8.6 5.2-15.4 11-19.6 18.4C10.6 38 6 32.4 6 25.6 6 12 20 5 41 7Z" fill="url(#km-leaf-b)" />
      <path d="M41 7c3.2 3.3 5 8.4 5 13.6C46 32.5 38.5 41 27.6 41c-4.4 0-8.4-1.4-11.6-4C25 37 32 34 37 29.5 31 30.7 24.4 30 18.8 27.4 24 25 30.6 22.4 37 19.8c-6.6.6-12.6 1.4-18 2.8C24.5 15.6 32 10.5 41 7Z" fill="url(#km-leaf-a)" />
    </svg>
  );
}
