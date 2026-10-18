"use client";

// Admin → Schemes tab.
//   GET    /admin/schemes          (published and draft)
//   POST   /admin/schemes
//   PATCH  /admin/schemes/{id}
//   DELETE /admin/schemes/{id}
// Server fields: name ≤200, summary/eligibility_text/benefit_text ≤2000, official_url https ≤500,
// states ≤40 × 60 chars (empty = central scheme), last_verified_at date, published bool.

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, LandmarkIcon, PlusIcon } from "@/components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
} from "@/components/ui";
import { api, describeError, type Scheme } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { STATES, shortDate } from "@/lib/format";
import { useContentI18n } from "@/features/content/ns";
import { Field, Notice, fieldProps, lengthError, todayIso, urlError, type Errors } from "@/features/admin/form";

type Draft = {
  name: string;
  summary: string;
  eligibility_text: string;
  benefit_text: string;
  official_url: string;
  states: string[];
  last_verified_at: string;
  published: boolean;
};

type Filter = "all" | "published" | "drafts";

const EMPTY: Draft = {
  name: "",
  summary: "",
  eligibility_text: "",
  benefit_text: "",
  official_url: "",
  states: [],
  last_verified_at: "",
  published: false,
};

function toDraft(s: Scheme): Draft {
  return {
    name: s.name,
    summary: s.summary,
    eligibility_text: s.eligibility_text,
    benefit_text: s.benefit_text ?? "",
    official_url: s.official_url,
    states: [...s.states],
    last_verified_at: s.last_verified_at.slice(0, 10),
    published: s.published,
  };
}

export function SchemesAdmin() {
  const { t, lang } = useContentI18n();
  const { data, error, loading, reload } = useApi<Scheme[]>("/admin/schemes");

  const [draft, setDraft] = useState<Draft>({ ...EMPTY, last_verified_at: todayIso() });
  const [editing, setEditing] = useState<Scheme | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const formRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => {
    const list = data ?? [];
    if (filter === "published") return list.filter((s) => s.published);
    if (filter === "drafts") return list.filter((s) => !s.published);
    return list;
  }, [data, filter]);

  const e = useCallback(
    (suffix: string | null) => (suffix ? t(`admin.validation.${suffix}`) : undefined),
    [t],
  );

  function validate(d: Draft): Errors {
    const next: Errors = {};
    const name = lengthError(d.name, 1, 200, "nameMax");
    if (name) next.name = e(name)!;
    const summary = lengthError(d.summary, 1, 2000, "summaryMax");
    if (summary) next.summary = e(summary)!;
    const elig = lengthError(d.eligibility_text, 1, 2000, "eligibilityMax");
    if (elig) next.eligibility_text = e(elig)!;
    const benefit = d.benefit_text.trim() === "" ? null : lengthError(d.benefit_text, 1, 2000, "benefitMax");
    if (benefit) next.benefit_text = e(benefit)!;
    const url = urlError(d.official_url, "required");
    if (url) next.official_url = e(url)!;
    if (d.states.length > 40) next.states = t("admin.validation.statesMax");
    if (!d.last_verified_at) next.last_verified_at = t("admin.validation.dateRequired");
    return next;
  }

  function resetForm() {
    setDraft({ ...EMPTY, last_verified_at: todayIso() });
    setEditing(null);
    setErrors({});
  }

  function startEdit(s: Scheme) {
    setEditing(s);
    setDraft(toDraft(s));
    setErrors({});
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setNotice({ tone: "bad", text: t("admin.validation.fixFields") });
      return;
    }
    setBusy(true);
    setNotice(null);
    const payload = {
      name: draft.name.trim(),
      summary: draft.summary.trim(),
      eligibility_text: draft.eligibility_text.trim(),
      benefit_text: draft.benefit_text.trim() === "" ? null : draft.benefit_text.trim(),
      official_url: draft.official_url.trim(),
      states: draft.states,
      last_verified_at: draft.last_verified_at,
      published: draft.published,
    };
    try {
      if (editing) {
        await api<Scheme>(`/admin/schemes/${editing.id}`, { method: "PATCH", body: payload });
        setNotice({ tone: "good", text: t("admin.common.saved") });
      } else {
        await api<Scheme>("/admin/schemes", { method: "POST", body: payload });
        setNotice({ tone: "good", text: t("admin.common.created") });
      }
      resetForm();
      reload();
    } catch (err) {
      setNotice({ tone: "bad", text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Scheme) {
    setDeletingId(s.id);
    setNotice(null);
    try {
      await api(`/admin/schemes/${s.id}`, { method: "DELETE" });
      setConfirmId(null);
      if (editing?.id === s.id) resetForm();
      setNotice({ tone: "good", text: t("admin.common.deleted") });
      reload();
    } catch (err) {
      setNotice({ tone: "bad", text: describeError(err) });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="ka-section-gap">
      <Panel
        title={t("admin.schemes.heading")}
        icon={<LandmarkIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        badge={
          <span className="km-badge neutral">
            {rows.length === 1
              ? t("admin.common.rowCountOne", { n: rows.length })
              : t("admin.common.rowCountMany", { n: rows.length })}
          </span>
        }
        action={
          <label className="ka-toolbar-meta" style={{ marginLeft: "auto", gap: 6, paddingBottom: 0 }}>
            <span className="km-caption">{t("admin.schemes.filterLabel")}</span>
            <select
              className="km-select"
              value={filter}
              onChange={(ev) => setFilter(ev.target.value as Filter)}
              style={{ minHeight: 30, fontSize: 11.5, padding: "2px 8px", width: 140 }}
            >
              <option value="all">{t("admin.schemes.filterAll")}</option>
              <option value="published">{t("admin.schemes.filterPublished")}</option>
              <option value="drafts">{t("admin.schemes.filterDrafts")}</option>
            </select>
          </label>
        }
        bodyClassName=""
      >
        <p className="km-caption" style={{ marginBottom: 8 }}>
          {t("admin.schemes.subtitle")}
        </p>

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {loading ? (
          <LoadingBlock lines={4} height={26} />
        ) : error ? (
          <ErrorState message={describeError(error)} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data && data.length > 0 ? t("admin.schemes.noMatch") : t("admin.schemes.emptyTitle")}
            hint={data && data.length > 0 ? undefined : t("admin.schemes.emptyHint")}
          />
        ) : (
          <div className="km-scroll-x ka-table-wrap">
            <table className="km-table ka-table">
              <caption className="km-sr-only">{t("admin.schemes.heading")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("admin.schemes.colName")}</th>
                  <th scope="col">{t("admin.schemes.colStates")}</th>
                  <th scope="col">{t("admin.schemes.colVerified")}</th>
                  <th scope="col">{t("admin.schemes.colPublished")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("admin.schemes.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="ka-cell-title">{s.name}</div>
                      <div className="ka-cell-sub">{s.summary}</div>
                      {confirmId === s.id && (
                        <div className="ka-confirm">
                          <div className="ka-confirm-text">
                            <strong>{t("admin.schemes.deleteQuestion")}</strong>
                            <span>{t("admin.schemes.deleteWarning")}</span>
                          </div>
                          <div className="ka-confirm-actions">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deletingId === s.id}
                              onClick={() => void remove(s)}
                            >
                              {deletingId === s.id ? t("admin.common.deleting") : t("admin.schemes.deleteQuestion")}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>
                              {t("admin.common.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {s.states.length === 0 ? (
                        <Badge tone="info">{t("content.common.allIndia")}</Badge>
                      ) : (
                        <span className="km-caption">{s.states.join(", ")}</span>
                      )}
                    </td>
                    <td className="ka-cell-nowrap">{shortDate(s.last_verified_at, lang)}</td>
                    <td>
                      <span className={`ka-status ${s.published ? "good" : "warn"}`}>
                        {s.published ? t("admin.common.publishedLabel") : t("admin.common.draftLabel")}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="ka-row-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={t("admin.schemes.editAria", { name: s.name })}
                          onClick={() => startEdit(s)}
                        >
                          {t("admin.common.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={t("admin.schemes.deleteAria", { name: s.name })}
                          onClick={() => setConfirmId(confirmId === s.id ? null : s.id)}
                        >
                          {t("admin.common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div ref={formRef}>
        <Panel
          title={editing ? t("admin.schemes.editHeading") : t("admin.schemes.newHeading")}
          icon={<PlusIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        >
          {editing && (
            <div className="ka-edit-banner">
              <span style={{ flex: 1, minWidth: 0 }}>
                {t("admin.schemes.editHeading")}: <strong>{editing.name}</strong>
              </span>
              <Button size="sm" variant="secondary" onClick={resetForm}>
                {t("admin.common.cancel")}
              </Button>
            </div>
          )}

          <form onSubmit={(ev) => void submit(ev)} noValidate>
            <div className="ka-form-grid">
              <div className="ka-span-2">
                <Field
                  id="sc-name"
                  label={t("admin.schemes.fieldName")}
                  required
                  error={errors.name}
                >
                  <input
                    className="km-input"
                    {...fieldProps("sc-name", errors.name)}
                    value={draft.name}
                    maxLength={200}
                    onChange={(ev) => setDraft({ ...draft, name: ev.target.value })}
                  />
                </Field>
              </div>

              <div className="ka-span-2">
                <Field
                  id="sc-summary"
                  label={t("admin.schemes.fieldSummary")}
                  required
                  error={errors.summary}
                >
                  <textarea
                    className="km-textarea"
                    rows={2}
                    {...fieldProps("sc-summary", errors.summary)}
                    value={draft.summary}
                    maxLength={2000}
                    onChange={(ev) => setDraft({ ...draft, summary: ev.target.value })}
                  />
                </Field>
              </div>

              <div className="ka-span-2">
                <Field
                  id="sc-elig"
                  label={t("admin.schemes.fieldEligibility")}
                  required
                  error={errors.eligibility_text}
                >
                  <textarea
                    className="km-textarea"
                    rows={3}
                    {...fieldProps("sc-elig", errors.eligibility_text)}
                    value={draft.eligibility_text}
                    maxLength={2000}
                    onChange={(ev) => setDraft({ ...draft, eligibility_text: ev.target.value })}
                  />
                </Field>
              </div>

              <div className="ka-span-2">
                <Field
                  id="sc-benefit"
                  label={
                    <>
                      {t("admin.schemes.fieldBenefit")} <span className="km-hint">({t("admin.common.optional")})</span>
                    </>
                  }
                  error={errors.benefit_text}
                >
                  <textarea
                    className="km-textarea"
                    rows={2}
                    {...fieldProps("sc-benefit", errors.benefit_text)}
                    value={draft.benefit_text}
                    maxLength={2000}
                    onChange={(ev) => setDraft({ ...draft, benefit_text: ev.target.value })}
                  />
                </Field>
              </div>

              <div className="ka-span-2">
                <Field
                  id="sc-url"
                  label={t("admin.schemes.fieldOfficialUrl")}
                  required
                  hint={t("admin.schemes.fieldOfficialUrlHint")}
                  error={errors.official_url}
                >
                  <input
                    className="km-input"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    {...fieldProps("sc-url", errors.official_url)}
                    value={draft.official_url}
                    maxLength={500}
                    onChange={(ev) => setDraft({ ...draft, official_url: ev.target.value })}
                  />
                </Field>
              </div>

              <div className="ka-span-2">
                <StatesInput
                  states={draft.states}
                  onChange={(states) => setDraft({ ...draft, states })}
                  error={errors.states}
                />
              </div>

              <Field
                id="sc-verified"
                label={t("admin.schemes.fieldVerified")}
                required
                error={errors.last_verified_at}
              >
                <input
                  className="km-input"
                  type="date"
                  {...fieldProps("sc-verified", errors.last_verified_at)}
                  value={draft.last_verified_at}
                  max={todayIso()}
                  onChange={(ev) => setDraft({ ...draft, last_verified_at: ev.target.value })}
                />
              </Field>

              <div className="km-field" style={{ justifyContent: "flex-end" }}>
                <label className="ka-checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.published}
                    onChange={(ev) => setDraft({ ...draft, published: ev.target.checked })}
                  />
                  <span>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                      {t("admin.schemes.fieldPublished")}
                    </span>
                    <span className="km-hint">{t("admin.schemes.fieldPublishedHint")}</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="ka-form-actions">
              <Button type="button" variant="secondary" onClick={resetForm} disabled={busy}>
                {t("admin.common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                <CheckIcon size={15} />
                {busy ? t("admin.common.loading") : editing ? t("admin.common.save") : t("admin.common.create")}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- states multi-input ---------------- */

function StatesInput({
  states,
  onChange,
  error,
}: {
  states: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const { t, lang } = useContentI18n();
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const listId = "sc-state-options";

  function add() {
    const v = value.trim();
    if (v === "") {
      setLocalError(t("admin.validation.stateEmpty"));
      return;
    }
    if (v.length > 60) {
      setLocalError(t("admin.validation.stateMax"));
      return;
    }
    if (states.length >= 40) {
      setLocalError(t("admin.validation.statesMax"));
      return;
    }
    if (states.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setValue("");
      setLocalError(null);
      return;
    }
    onChange([...states, v]);
    setValue("");
    setLocalError(null);
  }

  const shown = localError ?? error;

  return (
    <div className="km-field">
      <label className="km-label" htmlFor="sc-state-input">
        {t("admin.schemes.fieldStates")}
      </label>
      <div className="ka-chip-input">
        <input
          id="sc-state-input"
          className="km-input"
          list={listId}
          value={value}
          placeholder={t("admin.schemes.fieldStatePlaceholder")}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? "sc-states-error" : "sc-states-hint"}
          onChange={(ev) => {
            setValue(ev.target.value);
            setLocalError(null);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          {t("admin.schemes.fieldStatesAdd")}
        </Button>
      </div>
      <datalist id={listId}>
        {STATES.map((s) => (
          <option key={s.value} value={s.value}>
            {lang === "hi" ? s.hi : s.value}
          </option>
        ))}
      </datalist>
      {shown ? (
        <p id="sc-states-error" className="km-error" role="alert">
          {shown}
        </p>
      ) : (
        <p id="sc-states-hint" className="km-hint">
          {t("admin.schemes.fieldStatesHint")}
        </p>
      )}
      {states.length > 0 && (
        <div className="ka-chips">
          {states.map((s) => (
            <span key={s} className="ka-chip">
              {s}
              <button
                type="button"
                aria-label={`${s} — ${t("admin.common.delete")}`}
                onClick={() => onChange(states.filter((x) => x !== s))}
              >
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
