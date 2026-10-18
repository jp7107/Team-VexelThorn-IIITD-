"use client";

// Generated produce art. The backend has no image field for listings, so a listing's "photo" is a
// deterministic tile: a soft crop-coloured gradient plus a glyph (emoji) for the crop. It is labelled as
// an illustration, never presented as a photograph of the actual produce.
import { cropLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";

type Palette = { from: string; to: string; ink: string; glyph: string };

const PALETTES: Record<string, Palette> = {
  tomato: { from: "#fde7e2", to: "#f6c6bc", ink: "#8e2f24", glyph: "🍅" },
  potato: { from: "#f7f0e1", to: "#e7d5b3", ink: "#6e5427", glyph: "🥔" },
  maize: { from: "#fdf5d8", to: "#f3e0a2", ink: "#7c5f0d", glyph: "🌽" },
  wheat: { from: "#f8f0d9", to: "#ecdcae", ink: "#77601f", glyph: "🌾" },
  mustard: { from: "#fdf7de", to: "#f2e29e", ink: "#7b6312", glyph: "🌼" },
  onion: { from: "#f7e8f0", to: "#e6c6d8", ink: "#75345a", glyph: "🧅" },
  rice: { from: "#f3f3eb", to: "#e3e3cf", ink: "#64644a", glyph: "🍚" },
  okra: { from: "#eaf7e5", to: "#cde9c2", ink: "#2f6330", glyph: "🥬" },
};

const FALLBACK: Palette = { from: "#eff6ef", to: "#dbe9db", ink: "#3a6347", glyph: "🌱" };

export function cropPalette(crop: string | null | undefined): Palette {
  return PALETTES[(crop ?? "").toLowerCase()] ?? FALLBACK;
}

/** The tile itself. Purely decorative; callers provide the accessible name on the surrounding element. */
export function ProduceArt({
  crop,
  height = 96,
  glyphSize = 40,
  className = "",
}: {
  crop: string | null | undefined;
  height?: number;
  glyphSize?: number;
  className?: string;
}) {
  const p = cropPalette(crop);
  return (
    <span
      className={`kmx-produce-art ${className}`}
      style={{ height, background: `linear-gradient(145deg, ${p.from}, ${p.to})`, color: p.ink }}
      aria-hidden="true"
    >
      <span className="kmx-produce-glyph" style={{ fontSize: glyphSize }}>
        {p.glyph}
      </span>
      <span className="kmx-produce-stripe" />
    </span>
  );
}

/** Small inline glyph used in rating / filter / form rows. */
export function CropGlyph({ crop, size = 16 }: { crop: string | null | undefined; size?: number }) {
  return (
    <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>
      {cropPalette(crop).glyph}
    </span>
  );
}

/** Accessible description for a produce tile, e.g. "Tomato produce illustration". */
export function produceArtLabel(crop: string | null | undefined, lang: Lang): string {
  return lang === "hi"
    ? `${cropLabel(crop, lang)} उपज का चित्र`
    : `${cropLabel(crop, lang)} produce illustration`;
}
