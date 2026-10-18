"use client";

// Admin → Updates tab.
//   POST   /admin/updates  {title, body, source_url?}
//   DELETE /admin/updates/{id}
// There is no GET /admin/updates on the backend, so the list uses the verified public feed
// GET /updates?limit=50 (newest first). Noted in the panel so the limit is honest.

import { useMemo, useRef, useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { Button, EmptyState, ErrorState, LoadingBlock, Panel } from "@/components/ui";
import { api, describeError, type FarmUpdate } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { shortDate } from "@/lib/format";
import { useContentI18n } from "@/features/content/ns";
import { ExternalIcon } from "@/features/content/icons";
import { Field, Notice, fieldProps, lengthError, todayIso, urlError, type Errors } from "@/features/admin/form";

export function UpdatesAdmin() {
  const { t, lang } = useContentI18n();
  const { data, error, loading, reload } = useApi<FarmUpdate[]>("/updates?limit=50");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()),
    [data],
  );

  function validate(): Errors {
    const next: Errors = {};
    const tErr = lengthError(title, 1, 200, "titleMax");
    if (tErr) next.title = t(tErr === "required" ? "admin.validation.required" : `admin.validation.${tErr}`);
    const bErr = lengthError(body, 1, 4000, "bodyMax");
    if (bErr) next.body = t(bErr === "required" ? "admin.validation.required" : `admin.validation.${bErr}`);
    const uErr = urlError(source, "optional");
    if (uErr) next.source_url = t(`admin.validation.${uErr}`);
    return next;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setNotice({ tone: "bad", text: t("admin.validation.fixFields") });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api<FarmUpdate>("/admin/updates", {
        method: "POST",
        body: {
          title: title.trim(),
          body: body.trim(),
          source_url: source.trim() === "" ? null : source.trim(),
        },
      });
      setTitle("");
      setBody("");
      setSource("");
      setNotice({ tone: "good", text: t("admin.common.created") });
      reload();
    } catch (err) {
      setNotice({ tone: "bad", text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: FarmUpdate) {
    setDeletingId(u.id);
    setNotice(null);
    try {
      await api(`/admin/updates/${u.id}`, { method: "DELETE" });
      setConfirmId(null);
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
        title={t("admin.updates.heading")}
        icon={<PlusIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        badge={
          <span className="km-badge neutral">
            {rows.length === 1
              ? t("admin.common.rowCountOne", { n: rows.length })
              : t("admin.common.rowCountMany", { n: rows.length })}
          </span>
        }
        bodyClassName=""
      >
        <p className="km-caption" style={{ marginBottom: 8 }}>
          {t("admin.updates.subtitle")}
        </p>

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {loading ? (
          <LoadingBlock lines={4} height={26} />
        ) : error ? (
          <ErrorState message={describeError(error)} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title={t("admin.updates.emptyTitle")} hint={t("admin.updates.emptyHint")} />
        ) : (
          <div className="km-scroll-x ka-table-wrap">
            <table className="km-table ka-table">
              <caption className="km-sr-only">{t("admin.updates.heading")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("admin.updates.colTitle")}</th>
                  <th scope="col">{t("admin.updates.colSource")}</th>
                  <th scope="col">{t("admin.updates.colPublished")}</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    {t("admin.common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td style={{ maxWidth: 460 }}>
                      <div className="ka-cell-title">{u.title}</div>
                      <div className="ka-cell-sub" style={{ WebkitLineClamp: 2 }}>
                        {u.body}
                      </div>
                      {confirmId === u.id && (
                        <div className="ka-confirm">
                          <div className="ka-confirm-text">
                            <strong>{t("admin.updates.deleteQuestion")}</strong>
                            <span>{t("admin.updates.deleteWarning")}</span>
                          </div>
                          <div className="ka-confirm-actions">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deletingId === u.id}
                              onClick={() => void remove(u)}
                            >
                              {deletingId === u.id
                                ? t("admin.common.deleting")
                                : t("admin.updates.deleteQuestion")}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>
                              {t("admin.common.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {u.source_url ? (
                        <a
                          href={u.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="kc-official-link"
                          style={{ maxWidth: 220 }}
                        >
                          <ExternalIcon size={13} />
                          <span style={{ overflowWrap: "anywhere" }}>{t("content.updates.sourceLink")}</span>
                        </a>
                      ) : (
                        <span className="km-footnote">{t("admin.updates.noSource")}</span>
                      )}
                    </td>
                    <td className="ka-cell-nowrap">{shortDate(u.published_at, lang)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={t("admin.updates.deleteAria", { title: u.title })}
                        onClick={() => setConfirmId(confirmId === u.id ? null : u.id)}
                      >
                        {t("admin.common.delete")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ka-note">{t("admin.updates.adminListNote")}</p>
      </Panel>

      <div ref={formRef}>
        <Panel
          title={t("admin.updates.newHeading")}
          icon={<PlusIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        >
          <form onSubmit={(ev) => void submit(ev)} noValidate>
            <div className="ka-form-grid">
              <div className="ka-span-2">
                <Field id="up-title" label={t("admin.updates.fieldTitle")} required error={errors.title}>
                  <input
                    className="km-input"
                    {...fieldProps("up-title", errors.title)}
                    value={title}
                    maxLength={200}
                    onChange={(ev) => setTitle(ev.target.value)}
                  />
                </Field>
              </div>
              <div className="ka-span-2">
                <Field id="up-body" label={t("admin.updates.fieldBody")} required error={errors.body}>
                  <textarea
                    className="km-textarea"
                    rows={4}
                    {...fieldProps("up-body", errors.body)}
                    value={body}
                    maxLength={4000}
                    onChange={(ev) => setBody(ev.target.value)}
                  />
                </Field>
              </div>
              <div className="ka-span-2">
                <Field
                  id="up-source"
                  label={
                    <>
                      {t("admin.updates.fieldSource")}{" "}
                      <span className="km-hint">({t("admin.common.optional")})</span>
                    </>
                  }
                  hint={t("admin.updates.fieldSourceHint")}
                  error={errors.source_url}
                >
                  <input
                    className="km-input"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    {...fieldProps("up-source", errors.source_url)}
                    value={source}
                    maxLength={500}
                    onChange={(ev) => setSource(ev.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="ka-form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setTitle("");
                  setBody("");
                  setSource("");
                  setErrors({});
                }}
              >
                {t("admin.common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                <CheckIcon size={15} />
                {busy ? t("admin.common.loading") : t("admin.common.create")}
              </Button>
            </div>
          </form>
          <span className="km-sr-only">{todayIso()}</span>
        </Panel>
      </div>
    </div>
  );
}
