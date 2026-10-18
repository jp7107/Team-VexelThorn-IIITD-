// Icons missing from the shared set (src/components/icons.tsx is read-only for feature agents).
// Same visual language: 24px viewBox, 1.75 stroke, currentColor, decorative by default.

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

export function ArrowLeftIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M20 12H4" />
      <path d="m10 6-6 6 6 6" />
    </Svg>
  );
}

/** External-link glyph: a box with an arrow leaving the top-right corner. */
export function ExternalIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M19 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10" />
    </Svg>
  );
}
