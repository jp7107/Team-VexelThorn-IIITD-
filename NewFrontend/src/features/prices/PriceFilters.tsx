"use client";

// Filter controls for /prices. The commodity list comes from GET /market/commodities; the free-text
// fallback exists because the prices endpoint accepts any commodity string.

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { STATES } from "@/lib/format";
import { Button } from "@/components/ui";

const CUSTOM = "__custom__";

export type PriceFilters = {
  commodity: string;
  state: string;
  district: string;
};

export function PriceFilterPanel({
  commodities,
  commoditiesLoading,
  commoditiesError,
  filters,
  onChange,
  onReset,
}: {
  commodities: string[] | null;
  commoditiesLoading: boolean;
  commoditiesError: boolean;
  filters: PriceFilters;
  onChange: (next: Partial<PriceFilters>) => void;
  onReset: () => void;
}) {
  const { t, lang } = useI18n();

  const list = commodities ?? [];
  const trimmed = filters.commodity.trim();
  const [customChoice, setCustomChoice] = useState(false);
  const [customText, setCustomText] = useState("");
  const touched = useRef(false);

  // Default to "Tomato" when the backend list contains it, otherwise the first listed commodity.
  // Never overrides a commodity the user picked (listed or free-text).
  useEffect(() => {
    if (touched.current || customChoice || list.length === 0) return;
    if (list.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    const tomato = list.find((c) => c.toLowerCase() === "tomato");
    onChange({ commodity: tomato ?? list[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const custom = customChoice;
  const selectValue = custom ? CUSTOM : trimmed;

  return (
    <div className="km-prices-filters">
      <label className="km-field" htmlFor="prices-commodity">
        <span className="km-label">{t("prices.commodity")}</span>
        <select
          id="prices-commodity"
          className="km-select"
          value={selectValue}
          disabled={commoditiesLoading && list.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            touched.current = true;
            if (v === CUSTOM) {
              setCustomChoice(true);
              setCustomText("");
              onChange({ commodity: "" });
              return;
            }
            setCustomChoice(false);
            setCustomText("");
            onChange({ commodity: v });
          }}
        >
          {commoditiesLoading && list.length === 0 && <option value="">{t("prices.loadingCommodities")}</option>}
          {!commoditiesLoading && list.length === 0 && <option value="">{t("prices.noCommodityList")}</option>}
          {/* Keep a chosen commodity visible even when the backend list lacks it (free-text input). */}
          {selectValue && selectValue !== CUSTOM && !list.includes(selectValue) && (
            <option value={selectValue}>{selectValue}</option>
          )}
          {list.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={CUSTOM}>{t("prices.otherCommodity")}</option>
        </select>
        {commoditiesError && <span className="km-hint">{t("prices.commoditiesError")}</span>}
      </label>

      <label className="km-field" htmlFor="prices-state">
        <span className="km-label">{t("prices.state")}</span>
        <select
          id="prices-state"
          className="km-select"
          value={filters.state}
          onChange={(e) => onChange({ state: e.target.value })}
        >
          <option value="">{t("prices.allStates")}</option>
          {STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {lang === "hi" ? s.hi : s.value}
            </option>
          ))}
        </select>
      </label>

      <label className="km-field" htmlFor="prices-district">
        <span className="km-label">{t("prices.district")}</span>
        <input
          id="prices-district"
          className="km-input"
          type="text"
          autoComplete="off"
          placeholder={t("prices.districtPlaceholder")}
          value={filters.district}
          onChange={(e) => onChange({ district: e.target.value })}
        />
      </label>

      {custom && (
        <label className="km-field km-prices-custom" htmlFor="prices-custom">
          <span className="km-label">{t("prices.customCommodity")}</span>
          <input
            id="prices-custom"
            className="km-input"
            type="text"
            autoComplete="off"
            placeholder={t("prices.customPlaceholder")}
            value={customText}
            onChange={(e) => {
              touched.current = true;
              setCustomText(e.target.value);
              onChange({ commodity: e.target.value });
            }}
          />
          <span className="km-hint">{t("prices.customHint")}</span>
        </label>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            touched.current = false;
            setCustomChoice(false);
            setCustomText("");
            onReset();
          }}
        >
          {t("prices.resetFilters")}
        </Button>
      </div>
    </div>
  );
}
