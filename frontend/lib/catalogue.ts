"use client";

// Admin-maintained data every page reads: the crop catalogue and the public platform settings.
// Fetched once per page load and shared, like getMe().
import { useEffect, useState } from "react";
import { api, type CropType, type PublicConfig } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

let crops: Promise<CropType[]> | null = null;
let config: Promise<PublicConfig> | null = null;

export function getCrops(): Promise<CropType[]> {
  crops ??= api<CropType[]>("/crops").catch((e) => {
    crops = null;
    throw e;
  });
  return crops;
}

export function getConfig(): Promise<PublicConfig> {
  config ??= api<PublicConfig>("/config").catch((e) => {
    config = null;
    throw e;
  });
  return config;
}

/** Call after an admin edits crops or settings so the next read is fresh. */
export function forgetCatalogue() {
  crops = null;
  config = null;
}

export function useCrops(): CropType[] | null {
  const [value, setValue] = useState<CropType[] | null>(null);
  useEffect(() => {
    getCrops().then(setValue, () => setValue([]));
  }, []);
  return value;
}

export function useConfig(): PublicConfig | null {
  const [value, setValue] = useState<PublicConfig | null>(null);
  useEffect(() => {
    getConfig().then(setValue, () => setValue(null));
  }, []);
  return value;
}

/** A crop's name in the current language; falls back to the code for crops no longer in the catalogue. */
export function cropLabel(list: CropType[] | null, code: string, lang: Lang): string {
  const c = list?.find((x) => x.code === code);
  return c ? (lang === "hi" ? c.name_hi : c.name_en) : code;
}

