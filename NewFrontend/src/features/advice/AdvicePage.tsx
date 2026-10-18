"use client";

// Irrigation & advice, reminders and farm-crop management.
//
// Honesty rules for this page (see docs/AGENT_BRIEF.md):
//  - the backend exposes no weather, soil-sensor or irrigation-rule endpoint, so the weather tile is an
//    explicit "not connected" state and no temperature/humidity/moisture number is ever invented;
//  - guidance here is organisation-level copy plus the user's own saved crops and reminders;
//  - reminders with source === "system" are labelled as automated.

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  api,
  ApiError,
  describeError,
  type Crop,
  type Reminder,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useI18n } from "@/lib/i18n";
import {
  cropLabel,
  isoDate,
  num,
  shortDate,
  stageLabel,
  STAGE_LABELS,
} from "@/lib/format";
import {
  AlertIcon,
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CloudSunIcon,
  DropletIcon,
  HelpIcon,
  InfoIcon,
  PlusIcon,
  SproutIcon,
} from "@/components/icons";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeading,
  Panel,
} from "@/components/ui";
import "./advice.css";

/* ============================================================
   Page
   ============================================================ */

export function AdvicePage() {
  const { t } = useI18n();
  return (
    <div className="km-advice">
      <PageHeading title={t("advice.title")} subtitle={t("advice.subtitle")} />

      <ConditionsPanel />

      <div className="km-advice-columns">
        <CropsSection />
        <RemindersSection />
      </div>

      <GuidanceSection />
    </div>
  );
}

/* ============================================================
   Field conditions — three honest tiles
   ============================================================ */

function ConditionsPanel() {
  const { t, lang } = useI18n();
  const due = useApi<Reminder[]>("/me/reminders?due=true");
  const crops = useApi<Crop[]>("/me/crops");
  const primary = crops.data?.[0] ?? null;
  const dueCount = due.data?.length ?? null;

  return (
    <Panel
      title={t("advice.conditions.title")}
      icon={<CloudSunIcon size={18} style={{ color: "var(--km-green-700)" }} />}
      badge={<Badge tone="guidance">{t("advice.guidanceBadge")}</Badge>}
      className="km-advice-conditions"
    >
      <div className="km-advice-tiles">
        {/* No weather service exists in the backend; say so instead of showing a fake temperature. */}
        <div className="km-advice-tile is-muted" aria-label={`${t("advice.weather.value")} — ${t("advice.weather.label")}`}>
          <span className="km-advice-tile-icon" style={{ background: "#eef1f2", color: "var(--km-muted)" }}>
            <CloudSunIcon size={18} />
          </span>
          <span className="km-advice-tile-value">{t("advice.weather.value")}</span>
          <span className="km-advice-tile-label">{t("advice.weather.label")}</span>
          <span className="km-advice-tile-sub">{t("advice.weather.sub")}</span>
        </div>

        <a
          href="#reminders"
          className="km-advice-tile"
          aria-label={`${dueCount === null ? t("common.loading") : num(dueCount, lang)} ${t("advice.irrigation.countLabel")}`}
        >
          <span className="km-advice-tile-icon" style={{ background: "#eaf0fd", color: "var(--km-blue-600)" }}>
            <DropletIcon size={18} />
          </span>
          <span className="km-advice-tile-value">
            {due.loading ? (
              <span className="km-skeleton" style={{ display: "inline-block", width: 52, height: 20 }} />
            ) : due.error ? (
              <span className="km-subtle" style={{ fontSize: 16, fontWeight: 600 }}>
                {t("advice.tileUnavailable")}
              </span>
            ) : (
              t("advice.irrigation.count", { n: num(dueCount ?? 0, lang) })
            )}
          </span>
          <span className="km-advice-tile-label">{t("advice.irrigation.label")}</span>
          <span className="km-advice-tile-sub">
            {due.error ? (
              <button type="button" className="km-linkish" onClick={due.reload}>
                {t("common.retry")}
              </button>
            ) : (
              t("advice.irrigation.sub")
            )}
          </span>
        </a>

        <a
          href="#crops"
          className="km-advice-tile"
          aria-label={`${primary ? cropLabel(primary.crop_code, lang) : t("advice.crop.noCrops")} — ${t("advice.crop.label")}`}
        >
          <span className="km-advice-tile-icon" style={{ background: "var(--km-green-50)", color: "var(--km-green-700)" }}>
            <SproutIcon size={18} />
          </span>
          <span className="km-advice-tile-value">
            {crops.loading ? (
              <span className="km-skeleton" style={{ display: "inline-block", width: 72, height: 20 }} />
            ) : primary ? (
              cropLabel(primary.crop_code, lang)
            ) : (
              <span className="km-subtle" style={{ fontSize: 16, fontWeight: 600 }}>
                {t("advice.crop.noCrops")}
              </span>
            )}
          </span>
          <span className="km-advice-tile-label">{t("advice.crop.label")}</span>
          <span className="km-advice-tile-sub">
            {crops.error
              ? t("advice.tileUnavailable")
              : primary
                ? stageLabel(primary.stage, lang)
                : t("advice.crop.noCropsSub")}
          </span>
        </a>
      </div>

      <p className="km-advice-note">
        <InfoIcon size={14} style={{ flex: "none", marginTop: 1 }} />
        <span>{t("advice.conditions.footnote")}</span>
      </p>
    </Panel>
  );
}

/* ============================================================
   Your crops
   ============================================================ */

type CropDraft = {
  crop_code: string;
  variety: string;
  area_acres: string;
  sowing_date: string;
  stage: string;
  soil_type: string;
};

function emptyCropDraft(): CropDraft {
  return { crop_code: "", variety: "", area_acres: "", sowing_date: isoDate(), stage: "initial", soil_type: "" };
}

function CropsSection() {
  const { t, lang } = useI18n();
  const crops = useApi<Crop[]>("/me/crops");

  const [draft, setDraft] = useState<CropDraft>(emptyCropDraft);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lists = crops.data?.length ?? 0;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!draft.crop_code) errors.crop_code = t("advice.crops.errCrop");
    const acres = Number(draft.area_acres);
    if (!Number.isFinite(acres) || acres <= 0) errors.area_acres = t("advice.crops.errArea");
    if (!draft.sowing_date) errors.sowing_date = t("advice.crops.errSowing");
    if (!draft.stage) errors.stage = t("advice.crops.errStage");
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAdding(true);
    setAddError(null);
    setNotice(null);
    try {
      const created = await api<Crop>("/me/crops", {
        method: "POST",
        body: {
          crop_code: draft.crop_code,
          variety: draft.variety.trim() || null,
          area_acres: acres,
          sowing_date: draft.sowing_date,
          stage: draft.stage,
          soil_type: draft.soil_type.trim() || null,
        },
      });
      // The hook owns the list; reload so ordering matches the server.
      crops.reload();
      setDraft(emptyCropDraft());
      setNotice(t("advice.crops.added", { crop: cropLabel(created.crop_code, lang) }));
    } catch (err) {
      setAddError(describeError(err));
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(crop: Crop, next: { stage: string; area_acres: string; sowing_date: string }) {
    setRowError(null);
    const acres = Number(next.area_acres);
    if (!Number.isFinite(acres) || acres <= 0) {
      setRowError(t("advice.crops.errArea"));
      return;
    }
    if (!next.sowing_date) {
      setRowError(t("advice.crops.errSowing"));
      return;
    }
    setBusyId(crop.id);
    try {
      await api<Crop>(`/me/crops/${crop.id}`, {
        method: "PATCH",
        body: { stage: next.stage, area_acres: acres, sowing_date: next.sowing_date },
      });
      crops.reload();
      setEditingId(null);
      setNotice(t("advice.crops.updated", { crop: cropLabel(crop.crop_code, lang) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) crops.reload();
      setRowError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(crop: Crop) {
    setRowError(null);
    setBusyId(crop.id);
    try {
      await api<void>(`/me/crops/${crop.id}`, { method: "DELETE" });
      crops.reload();
      setDeletingId(null);
      setNotice(t("advice.crops.deleted", { crop: cropLabel(crop.crop_code, lang) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) crops.reload();
      setRowError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      className="km-advice-panel"
      title={t("advice.crops.title")}
      icon={<SproutIcon size={18} style={{ color: "var(--km-green-700)" }} />}
      badge={crops.data ? <Badge tone="neutral">{t("advice.crops.count", { n: num(lists, lang) })}</Badge> : undefined}
    >
      <div id="crops" className="km-advice-anchor" aria-hidden="true" />

      {/* ----- add crop ----- */}
      <form onSubmit={add} className="km-advice-form" aria-label={t("advice.crops.addTitle")}>
        <p className="km-advice-form-title">{t("advice.crops.addTitle")}</p>
        <div className="km-advice-form-grid">
          <label className="km-field">
            <span className="km-label">{t("advice.crops.crop")}</span>
            <select
              className="km-select"
              value={draft.crop_code}
              aria-invalid={Boolean(fieldErrors.crop_code)}
              onChange={(e) => setDraft({ ...draft, crop_code: e.target.value })}
            >
              <option value="">{t("advice.crops.cropPlaceholder")}</option>
              {["tomato", "potato", "maize", "wheat", "mustard", "onion", "rice", "okra"].map((code) => (
                <option key={code} value={code}>
                  {cropLabel(code, lang)}
                </option>
              ))}
            </select>
            {fieldErrors.crop_code && <span className="km-error">{fieldErrors.crop_code}</span>}
          </label>

          <label className="km-field">
            <span className="km-label">{t("advice.crops.variety")}</span>
            <input
              className="km-input"
              value={draft.variety}
              maxLength={60}
              placeholder={t("advice.crops.varietyPlaceholder")}
              onChange={(e) => setDraft({ ...draft, variety: e.target.value })}
            />
          </label>

          <label className="km-field">
            <span className="km-label">{t("advice.crops.area")}</span>
            <input
              className="km-input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={draft.area_acres}
              aria-invalid={Boolean(fieldErrors.area_acres)}
              onChange={(e) => setDraft({ ...draft, area_acres: e.target.value })}
            />
            {fieldErrors.area_acres && <span className="km-error">{fieldErrors.area_acres}</span>}
          </label>

          <label className="km-field">
            <span className="km-label">{t("advice.crops.sowing")}</span>
            <input
              className="km-input"
              type="date"
              max={isoDate()}
              value={draft.sowing_date}
              aria-invalid={Boolean(fieldErrors.sowing_date)}
              onChange={(e) => setDraft({ ...draft, sowing_date: e.target.value })}
            />
            {fieldErrors.sowing_date && <span className="km-error">{fieldErrors.sowing_date}</span>}
          </label>

          <label className="km-field">
            <span className="km-label">{t("advice.crops.stage")}</span>
            <select
              className="km-select"
              value={draft.stage}
              onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
            >
              {Object.keys(STAGE_LABELS).map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s, lang)}
                </option>
              ))}
            </select>
          </label>

          <label className="km-field">
            <span className="km-label">{t("advice.crops.soil")}</span>
            <input
              className="km-input"
              value={draft.soil_type}
              maxLength={40}
              placeholder={t("advice.crops.soilPlaceholder")}
              onChange={(e) => setDraft({ ...draft, soil_type: e.target.value })}
            />
          </label>
        </div>

        <div className="km-advice-form-actions">
          <Button type="submit" size="sm" disabled={adding}>
            <PlusIcon size={15} /> {adding ? t("common.saving") : t("advice.crops.add")}
          </Button>
          {addError && (
            <span className="km-error" role="alert">
              {addError}
            </span>
          )}
        </div>
      </form>

      <p aria-live="polite" className="km-sr-only">
        {notice}
      </p>
      {notice && <p className="km-advice-notice">{notice}</p>}

      {/* ----- list ----- */}
      <div style={{ marginTop: 10 }}>
        {crops.loading ? (
          <LoadingBlock lines={4} height={30} />
        ) : crops.error ? (
          <ErrorState message={describeError(crops.error)} onRetry={crops.reload} />
        ) : !crops.data || crops.data.length === 0 ? (
          <EmptyState title={t("advice.crops.empty")} hint={t("advice.crops.emptyHint")} />
        ) : (
          <>
            {rowError && (
              <p className="km-error" role="alert" style={{ marginBottom: 6 }}>
                {rowError}
              </p>
            )}
            <div className="km-scroll-x">
              <table className="km-table km-advice-table">
                <thead>
                  <tr>
                    <th scope="col">{t("advice.crops.crop")}</th>
                    <th scope="col">{t("advice.crops.variety")}</th>
                    <th scope="col">{t("advice.crops.area")}</th>
                    <th scope="col">{t("advice.crops.sowing")}</th>
                    <th scope="col">{t("advice.crops.stage")}</th>
                    <th scope="col">{t("advice.crops.soil")}</th>
                    <th scope="col">
                      <span className="km-sr-only">{t("advice.crops.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {crops.data.map((crop) =>
                    deletingId === crop.id ? (
                      <tr key={crop.id} className="km-advice-confirm-row">
                        <td colSpan={7}>
                          <div className="km-advice-confirm">
                            <AlertIcon size={15} style={{ color: "var(--km-red-600)", flex: "none" }} />
                            <span style={{ flex: 1 }}>
                              <strong>
                                {t("advice.crops.deleteConfirm", { crop: cropLabel(crop.crop_code, lang) })}
                              </strong>
                              <span className="km-caption" style={{ display: "block" }}>
                                {t("advice.crops.deleteHint")}
                              </span>
                            </span>
                            <Button size="sm" variant="danger" disabled={busyId === crop.id} onClick={() => void remove(crop)}>
                              {t("advice.crops.deleteYes")}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setDeletingId(null)}>
                              {t("common.cancel")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : editingId === crop.id ? (
                      <CropEditRow
                        key={crop.id}
                        crop={crop}
                        busy={busyId === crop.id}
                        onCancel={() => setEditingId(null)}
                        onSave={(next) => void saveEdit(crop, next)}
                      />
                    ) : (
                      <tr key={crop.id}>
                        <td>
                          <span className="km-advice-strong">{cropLabel(crop.crop_code, lang)}</span>
                        </td>
                        <td>{crop.variety || <span className="km-subtle">—</span>}</td>
                        <td className="km-advice-num">{num(crop.area_acres, lang)}</td>
                        <td>{shortDate(crop.sowing_date, lang)}</td>
                        <td>
                          <span className="km-advice-stage">{stageLabel(crop.stage, lang)}</span>
                        </td>
                        <td>{crop.soil_type || <span className="km-subtle">—</span>}</td>
                        <td>
                          <div className="km-advice-row-actions">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t("advice.crops.editAria", { crop: cropLabel(crop.crop_code, lang) })}
                              onClick={() => {
                                setEditingId(crop.id);
                                setDeletingId(null);
                                setRowError(null);
                              }}
                            >
                              {t("advice.crops.edit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t("advice.crops.deleteAria", { crop: cropLabel(crop.crop_code, lang) })}
                              onClick={() => {
                                setDeletingId(crop.id);
                                setEditingId(null);
                                setRowError(null);
                              }}
                            >
                              {t("advice.crops.delete")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function CropEditRow({
  crop,
  busy,
  onCancel,
  onSave,
}: {
  crop: Crop;
  busy: boolean;
  onCancel: () => void;
  onSave: (next: { stage: string; area_acres: string; sowing_date: string }) => void;
}) {
  const { t, lang } = useI18n();
  const [stage, setStage] = useState(crop.stage);
  const [area, setArea] = useState(crop.area_acres);
  const [sowing, setSowing] = useState(crop.sowing_date.slice(0, 10));
  const idBase = useId();

  return (
    <tr className="km-advice-edit-row">
      <td>
        <span className="km-advice-strong">{cropLabel(crop.crop_code, lang)}</span>
        <span className="km-caption" style={{ display: "block" }}>
          {crop.variety || t("advice.crops.variety")}
        </span>
      </td>
      <td colSpan={5}>
        <div className="km-advice-edit-grid">
          <label className="km-field" htmlFor={`${idBase}-stage`}>
            <span className="km-label">{t("advice.crops.stage")}</span>
            <select
              id={`${idBase}-stage`}
              className="km-select"
              value={stage}
              onChange={(e) => setStage(e.target.value as Crop["stage"])}
            >
              {Object.keys(STAGE_LABELS).map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="km-field" htmlFor={`${idBase}-area`}>
            <span className="km-label">{t("advice.crops.area")}</span>
            <input
              id={`${idBase}-area`}
              className="km-input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </label>
          <label className="km-field" htmlFor={`${idBase}-sowing`}>
            <span className="km-label">{t("advice.crops.sowing")}</span>
            <input
              id={`${idBase}-sowing`}
              className="km-input"
              type="date"
              value={sowing}
              onChange={(e) => setSowing(e.target.value)}
            />
          </label>
        </div>
      </td>
      <td>
        <div className="km-advice-row-actions">
          <Button size="sm" disabled={busy} onClick={() => onSave({ stage, area_acres: area, sowing_date: sowing })}>
            {busy ? t("common.saving") : t("common.save")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* ============================================================
   Reminders
   ============================================================ */

function toLocalInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/* The current time is read from an external store so render stays pure. It is snapped to the live
   clock on mount and after every reminder mutation, and otherwise stays fixed, so the due/open split
   is stable and nothing flickers between renders. */
let boundaryNow = 0;
const nowListeners = new Set<() => void>();

function currentEpochMs(): number {
  if (boundaryNow === 0) boundaryNow = Date.now() || 1;
  return boundaryNow;
}

function bumpNowBoundary(): void {
  boundaryNow = Date.now() || 1;
  for (const fn of nowListeners) fn();
}

function subscribeNow(fn: () => void): () => void {
  nowListeners.add(fn);
  return () => {
    nowListeners.delete(fn);
  };
}

function RemindersSection() {
  const { t, lang } = useI18n();
  const reminders = useApi<Reminder[]>("/me/reminders");
  const crops = useApi<Crop[]>("/me/crops");
  const idBase = useId();

  // "Now" is read through an external store so render stays pure; a reload snaps it forward.
  const now = useSyncExternalStore(subscribeNow, currentEpochMs, () => 0);

  // Re-snap on mount so a value cached by an earlier visit cannot mark fresh reminders overdue.
  useEffect(() => {
    bumpNowBoundary();
  }, []);

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [cropId, setCropId] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Default the picker to one hour ahead. Derived, not stored, so nothing runs in an effect and the
  // field is simply empty during SSR.
  const dueValue = dueAt ?? (now > 0 ? toLocalInput(new Date(now + 60 * 60_000)) : "");
  const resetDue = () => setDueAt(toLocalInput(new Date((boundaryNow = Date.now() || 1) + 60 * 60_000)));

  // Open reminders first, overdue ones before upcoming; done ones last.
  const sorted = useMemo(() => {
    const rows = [...(reminders.data ?? [])];
    const rank = (r: Reminder) => {
      if (r.done_at) return 3;
      return new Date(r.due_at).getTime() <= now ? 1 : 2;
    };
    return rows.sort((a, b) => rank(a) - rank(b) || new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [reminders.data, now]);

  const dueCount = useMemo(
    () => (reminders.data ?? []).filter((r) => !r.done_at && new Date(r.due_at).getTime() <= now).length,
    [reminders.data, now],
  );
  const cropById = useMemo(() => new Map((crops.data ?? []).map((c) => [c.id, c])), [crops.data]);

  /** Reload the list and re-snap the clock so the due/open split reflects the latest state. */
  function refresh() {
    bumpNowBoundary();
    reminders.reload();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError(t("advice.reminders.errTitle"));
      return;
    }
    const when = new Date(dueValue);
    if (!dueValue || Number.isNaN(when.getTime())) {
      setFormError(t("advice.reminders.errDue"));
      return;
    }
    setCreating(true);
    try {
      await api<Reminder>("/me/reminders", {
        method: "POST",
        body: {
          title: title.trim(),
          // datetime-local is local wall-clock time; ISO carries the timezone the backend requires.
          due_at: when.toISOString(),
          farm_crop_id: cropId || undefined,
        },
      });
      setTitle("");
      setCropId("");
      resetDue();
      refresh();
      setNotice(t("advice.reminders.added"));
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setCreating(false);
    }
  }

  async function toggle(r: Reminder) {
    setBusyId(r.id);
    setFormError(null);
    try {
      const updated = await api<Reminder>(`/me/reminders/${r.id}`, {
        method: "PATCH",
        body: { done: !r.done_at },
      });
      refresh();
      setNotice(
        updated.done_at
          ? t("advice.reminders.markedDone", { title: r.title })
          : t("advice.reminders.markedOpen", { title: r.title }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) reminders.reload();
      setFormError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      className="km-advice-panel"
      title={t("advice.reminders.title")}
      icon={<ClockIcon size={18} style={{ color: "var(--km-green-700)" }} />}
      badge={
        reminders.data ? (
          <Badge tone={dueCount > 0 ? "sample" : "neutral"}>
            {dueCount > 0
              ? t("advice.reminders.dueCount", { n: num(dueCount, lang) })
              : t("advice.reminders.noneDue")}
          </Badge>
        ) : undefined
      }
    >
      <section id="reminders" aria-label={t("advice.reminders.title")}>
        {/* ----- create ----- */}
        <form onSubmit={create} className="km-advice-form" aria-label={t("advice.reminders.formTitle")}>
          <p className="km-advice-form-title">{t("advice.reminders.formTitle")}</p>
          <div className="km-advice-form-grid">
            <label className="km-field" htmlFor={`${idBase}-title`} style={{ gridColumn: "1 / -1" }}>
              <span className="km-label">{t("advice.reminders.fieldTitle")}</span>
              <input
                id={`${idBase}-title`}
                className="km-input"
                value={title}
                maxLength={120}
                placeholder={t("advice.reminders.titlePlaceholder")}
                aria-invalid={formError === t("advice.reminders.errTitle")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="km-field" htmlFor={`${idBase}-due`}>
              <span className="km-label">{t("advice.reminders.dueAt")}</span>
              <input
                id={`${idBase}-due`}
                className="km-input"
                type="datetime-local"
                value={dueValue}
                onChange={(e) => setDueAt(e.target.value)}
              />
              <span className="km-hint">{t("advice.reminders.dueHint")}</span>
            </label>
            <label className="km-field" htmlFor={`${idBase}-crop`}>
              <span className="km-label">{t("advice.reminders.linkCrop")}</span>
              <select
                id={`${idBase}-crop`}
                className="km-select"
                value={cropId}
                onChange={(e) => setCropId(e.target.value)}
                disabled={crops.loading || (crops.data?.length ?? 0) === 0}
              >
                <option value="">{t("advice.reminders.noCrop")}</option>
                {(crops.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {cropLabel(c.crop_code, lang)}
                    {c.variety ? ` · ${c.variety}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="km-advice-form-actions">
            <Button type="submit" size="sm" disabled={creating}>
              <PlusIcon size={15} /> {creating ? t("common.saving") : t("advice.reminders.add")}
            </Button>
            {formError && (
              <span className="km-error" role="alert">
                {formError}
              </span>
            )}
          </div>
        </form>

        <p aria-live="polite" className="km-sr-only">
          {notice}
        </p>
        {notice && <p className="km-advice-notice">{notice}</p>}

        {/* ----- list ----- */}
        <div style={{ marginTop: 10 }}>
          {reminders.loading ? (
            <LoadingBlock lines={4} height={34} />
          ) : reminders.error ? (
            <ErrorState message={describeError(reminders.error)} onRetry={reminders.reload} />
          ) : sorted.length === 0 ? (
            <EmptyState title={t("advice.reminders.empty")} hint={t("advice.reminders.emptyHint")} />
          ) : (
            <>
              <ul className="km-advice-reminders">
                {sorted.map((r) => {
                  const done = Boolean(r.done_at);
                  const due = !done && new Date(r.due_at).getTime() <= now;
                  const system = r.source === "system";
                  const linked = r.farm_crop_id ? cropById.get(r.farm_crop_id) : null;
                  return (
                    <li
                      key={r.id}
                      className={`km-advice-reminder${due ? " is-due" : ""}${done ? " is-done" : ""}`}
                    >
                      <button
                        type="button"
                        className="km-advice-check"
                        aria-pressed={done}
                        aria-label={
                          done
                            ? t("advice.reminders.markUndoneAria", { title: r.title })
                            : t("advice.reminders.markDoneAria", { title: r.title })
                        }
                        disabled={busyId === r.id}
                        onClick={() => void toggle(r)}
                      >
                        {done ? <CheckIcon size={14} /> : <span />}
                      </button>
                      <div className="km-advice-reminder-body">
                        <span className="km-advice-reminder-title">{r.title}</span>
                        <span className="km-advice-reminder-meta">
                          <span>{whenLabel(r.due_at, lang, t)}</span>
                          {linked && (
                            <span>
                              {" · "}
                              {cropLabel(linked.crop_code, lang)}
                            </span>
                          )}
                          {done && <span> · {t("advice.reminders.doneOn", { when: shortDate(r.done_at, lang) })}</span>}
                        </span>
                      </div>
                      <div className="km-advice-reminder-tags">
                        {due && <Badge tone="sample">{t("advice.reminders.dueBadge")}</Badge>}
                        {done && <Badge tone="neutral">{t("advice.reminders.doneBadge")}</Badge>}
                        {system && (
                          <Badge tone="info" title={t("advice.reminders.systemHint")}>
                            {t("advice.reminders.systemBadge")}
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="km-advice-note">
                <InfoIcon size={14} style={{ flex: "none", marginTop: 1 }} />
                <span>{t("advice.reminders.systemHint")}</span>
              </p>
            </>
          )}
        </div>
      </section>
    </Panel>
  );
}

/** "Today, 5:00 pm" / "In 3 days" / "Overdue by 2 days" — wording only, no sensor data implied. */
function whenLabel(iso: string, lang: "en" | "hi", t: (key: string, vars?: Record<string, string | number>) => string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(today)) / 86_400_000);
  const time = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

  if (days < 0) {
    const n = Math.abs(days);
    return t(n === 1 ? "advice.reminders.overdueOne" : "advice.reminders.overdue", { n });
  }
  if (days === 0) return t("advice.reminders.today", { time });
  if (days === 1) return t("advice.reminders.tomorrow", { time });
  if (days <= 7) return t("advice.reminders.inDays", { n: days });
  return shortDate(iso, lang);
}

/* ============================================================
   Guidance
   ============================================================ */

function GuidanceSection() {
  const { t } = useI18n();
  return (
    <Panel
      title={t("advice.guidance.title")}
      icon={<HelpIcon size={18} style={{ color: "var(--km-green-700)" }} />}
      badge={<Badge tone="guidance">{t("advice.guidanceBadge")}</Badge>}
      className="km-advice-guidance"
    >
      <div className="km-advice-guidance-grid">
        <div className="km-advice-disclosure">
          <p>{t("advice.guidance.body")}</p>
          <ul>
            <li>{t("advice.guidance.pointSensor")}</li>
            <li>{t("advice.guidance.pointAi")}</li>
            <li>{t("advice.guidance.pointConfirm")}</li>
          </ul>
          <p className="km-footnote">{t("advice.guidance.orgNote")}</p>
        </div>

        <div className="km-advice-links">
          <LinkRow
            href="/assistant?q=irrigation"
            icon={<BotIcon size={16} />}
            title={t("advice.guidance.assistantTitle")}
            subtitle={t("advice.guidance.assistantSub")}
            tint="#eaf0fd"
            color="var(--km-blue-600)"
          />
          <LinkRow
            href="/help"
            icon={<HelpIcon size={16} />}
            title={t("advice.guidance.helpTitle")}
            subtitle={t("advice.guidance.helpSub")}
            tint="var(--km-green-50)"
            color="var(--km-green-700)"
          />
          <ButtonLink href="/health/diagnose" size="sm" variant="secondary">
            {t("advice.guidance.diagnose")}
          </ButtonLink>
        </div>
      </div>
    </Panel>
  );
}

function LinkRow({
  href,
  icon,
  title,
  subtitle,
  tint,
  color,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  tint: string;
  color: string;
}) {
  return (
    <Link href={href} className="km-advice-link-row">
      <span className="km-icon-tile" style={{ background: tint, color, width: 32, height: 32, borderRadius: 9 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="km-advice-link-title">{title}</span>
        <span className="km-caption" style={{ display: "block" }}>
          {subtitle}
        </span>
      </span>
      <ChevronRightIcon size={15} style={{ color: "var(--km-subtle)", flex: "none" }} />
    </Link>
  );
}
