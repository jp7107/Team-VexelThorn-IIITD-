// Hand-drawn line icons (24px grid, currentColor) so the app has no icon dependency.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" {...props} />
  );
}

export function LeafScanIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 18c0-7 4.5-11 12-12 0 7.5-4 12-11 12" />
      <path d="M6 18c3-3 5.5-5.5 8.5-8.5" />
      <path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M17 21h2.5a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Svg>
  );
}

export function PriceIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 20V10M10 20V5M16 20v-7M22 20H2" />
      <path d="M17.5 4.5h3M17.5 4.5c1.6 0 2.5.8 2.5 2s-.9 2-2.5 2l3 3M17.5 6.5h3" />
    </Svg>
  );
}

export function BasketIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 10h18l-2 9.5a1 1 0 0 1-1 .5H6a1 1 0 0 1-1-.5L3 10Z" />
      <path d="M8 10l3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3" />
    </Svg>
  );
}

export function FarmerIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 9h14M7.5 9c0-3 2-5 4.5-5s4.5 2 4.5 5" />
      <path d="M8 9.5a4 4 0 0 0 8 0" />
      <path d="M4 21c.8-3.5 4-6 8-6s7.2 2.5 8 6" />
    </Svg>
  );
}

export function StoreIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 1.4 1.3 2.5 3 2.5S9 11.4 9 10c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5" />
      <path d="M10 20v-4h4v4" />
    </Svg>
  );
}

export function TomatoIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 7.5c-5 0-8 2.8-8 6.5s3.5 6.5 8 6.5 8-2.8 8-6.5-3-6.5-8-6.5Z" />
      <path d="M12 7.5V4M9 6.5l3 1 3-1M8.5 9 12 7.5l3.5 1.5" />
    </Svg>
  );
}

export function PotatoIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5.5 8.5C8 4.5 15 3.5 18.5 7s1.5 10.5-4 12.5S2.5 17 3.5 13c.4-1.7 1-3 2-4.5Z" />
      <path d="M9 9.5h.01M14 8.5h.01M15.5 13.5h.01M10 15h.01" strokeWidth={2.6} />
    </Svg>
  );
}

export function MaizeIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3c2.2 0 3.5 3 3.5 7.5S14.2 18 12 18s-3.5-3-3.5-7.5S9.8 3 12 3Z" />
      <path d="M8.5 9h7M8.6 12.5h6.8M10.3 3.8v13.5M13.7 3.8v13.5" strokeWidth={1.2} />
      <path d="M12 18v3M8.5 12C6 14 5 17 5.5 20.5 8 19 10 17.5 12 18M15.5 12c2.5 2 3.5 5 3 8.5-2.5-1.5-4.5-3-6.5-2.5" />
    </Svg>
  );
}

export function SproutIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6ZM12 10c0-3.5 2.5-6 7-6 0 4-2.5 6-7 6Z" />
      <path d="M7 21h10" />
    </Svg>
  );
}

export const CROP_ICONS: Record<string, (p: P) => React.JSX.Element> = {
  tomato: TomatoIcon,
  potato: PotatoIcon,
  maize: MaizeIcon,
};
