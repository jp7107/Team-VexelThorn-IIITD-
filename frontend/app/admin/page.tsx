"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CropsPanel, DashboardPanel, OrdersPanel, PricesPanel, SettingsPanel, UsersPanel,
} from "@/components/admin-panels";
import { StatusPill, useFormat } from "@/components/market";
import { Button, Field, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, ApiError, type AdminUser, type FarmUpdate, type KbArticle, type Listing, type Scheme } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type Tab = "dashboard" | "orders" | "users" | "listings" | "crops" | "prices" | "schemes" | "updates" | "kb" | "support"
  | "settings";
const TABS: Tab[] = ["dashboard", "orders", "users", "listings", "crops", "prices", "schemes", "updates", "kb", "support",
  "settings"];
const small = "min-h-11 rounded-xl border border-white/30 px-3 font-bold text-ink";

/** Loads a list, reloads on demand, and turns failures into a translated message. */
function useList<T>(path: string) {
  const { t } = useI18n();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api<T[]>(path).then((rows) => { setItems(rows); setError(""); }).catch((e) => setError(t(errorKey(e))));
  }, [path, t]);
  useEffect(load, [load]);
  return { items, error, setError, load };
}

function saveError(e: unknown, t: (k: string) => string) {
  return t(e instanceof ApiError && e.status === 422 ? "admin.httpsOnly" : errorKey(e));
}

/** Two-step delete: the first tap asks, the second deletes. */
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="flex gap-2">
      <button type="button" onClick={onDelete} className={`${small} border-danger text-danger`}>{t("admin.yesDelete")}</button>
      <button type="button" onClick={() => setAsking(false)} className={small}>{t("admin.cancel")}</button>
    </span>
  ) : (
    <button type="button" onClick={() => setAsking(true)} className={small}>{t("admin.delete")}</button>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="glass rounded-2xl border border-white/15 p-4">{children}</li>;
}

const EMPTY_SCHEME = { name: "", summary: "", eligibility_text: "", benefit_text: "", official_url: "", states: "",
  last_verified_at: new Date().toISOString().slice(0, 10), published: false };

function SchemesPanel() {
  const { t } = useI18n();
  const { items, error, setError, load } = useList<Scheme>("/admin/schemes");
  const [form, setForm] = useState<typeof EMPTY_SCHEME | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_SCHEME) => (v: string | boolean) => setForm((f) => f && { ...f, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body = { ...form, benefit_text: form.benefit_text.trim() || null,
      states: form.states.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      await api(editing ? `/admin/schemes/${editing}` : "/admin/schemes", { method: editing ? "PATCH" : "POST", body });
      setForm(null);
      setEditing(null);
      load();
    } catch (err) {
      setError(saveError(err, t));
    }
  }

  async function patch(id: string, body: object) {
    try { await api(`/admin/schemes/${id}`, { method: "PATCH", body }); load(); } catch (e) { setError(t(errorKey(e))); }
  }

  async function remove(id: string) {
    try { await api(`/admin/schemes/${id}`, { method: "DELETE" }); load(); } catch (e) { setError(t(errorKey(e))); }
  }

  return (
    <>
      <FormError message={error} />
      {form ? (
        <form onSubmit={save} className="mb-6 rounded-2xl border border-white/30 p-4">
          <Field id="s-name" label={t("admin.name")}><input id="s-name" required maxLength={200} className={inputClass} value={form.name} onChange={(e) => set("name")(e.target.value)} /></Field>
          <Field id="s-summary" label={t("admin.summary")}><textarea id="s-summary" required rows={3} maxLength={2000} className={`${inputClass} py-3`} value={form.summary} onChange={(e) => set("summary")(e.target.value)} /></Field>
          <Field id="s-elig" label={t("admin.eligibility")}><textarea id="s-elig" required rows={3} maxLength={2000} className={`${inputClass} py-3`} value={form.eligibility_text} onChange={(e) => set("eligibility_text")(e.target.value)} /></Field>
          <Field id="s-benefit" label={t("admin.benefit")}><textarea id="s-benefit" rows={2} maxLength={2000} className={`${inputClass} py-3`} value={form.benefit_text} onChange={(e) => set("benefit_text")(e.target.value)} /></Field>
          <Field id="s-url" label={t("admin.officialUrl")}><input id="s-url" required type="url" inputMode="url" maxLength={500} className={inputClass} value={form.official_url} onChange={(e) => set("official_url")(e.target.value)} /></Field>
          <Field id="s-states" label={t("admin.states")}><input id="s-states" className={inputClass} value={form.states} onChange={(e) => set("states")(e.target.value)} /></Field>
          <Field id="s-date" label={t("admin.verifiedOn")}><input id="s-date" required type="date" className={inputClass} value={form.last_verified_at} onChange={(e) => set("last_verified_at")(e.target.value)} /></Field>
          <label className="mb-5 flex min-h-11 items-center gap-3 text-base font-semibold">
            <input type="checkbox" className="size-6" checked={form.published} onChange={(e) => set("published")(e.target.checked)} />
            {t("admin.publishNow")}
          </label>
          <div className="flex gap-3">
            <Button type="submit">{t("admin.save")}</Button>
            <Button type="button" variant="secondary" onClick={() => { setForm(null); setEditing(null); }}>{t("admin.cancel")}</Button>
          </div>
        </form>
      ) : (
        <Button type="button" className="mb-6" onClick={() => setForm(EMPTY_SCHEME)}>{t("admin.new")}</Button>
      )}
      {items === null ? <Loading /> : items.length === 0 ? <p className="text-base text-muted">{t("admin.none")}</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((s) => (
            <Row key={s.id}>
              <p className="flex items-start justify-between gap-2">
                <span className="text-base font-bold text-ink">{s.name}</span>
                <span className={`rounded-full px-3 py-1 text-base font-semibold ${s.published ? "bg-field-soft text-field" : "bg-surface text-muted"}`}>
                  {s.published ? t("admin.published") : t("admin.draft")}
                </span>
              </p>
              <p className="text-base text-muted">{s.official_url} · {s.last_verified_at}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={small} onClick={() => patch(s.id, { published: !s.published })}>
                  {s.published ? t("admin.unpublish") : t("admin.publish")}
                </button>
                <button type="button" className={small} onClick={() => {
                  setEditing(s.id);
                  setForm({ ...s, benefit_text: s.benefit_text ?? "", states: s.states.join(", ") });
                }}>{t("admin.edit")}</button>
                <DeleteButton onDelete={() => remove(s.id)} />
              </div>
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

function UpdatesPanel() {
  const { t } = useI18n();
  const { items, error, setError, load } = useList<FarmUpdate>("/updates?limit=50");
  const [form, setForm] = useState({ title: "", body: "", source_url: "" });

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/updates", { method: "POST", body: { ...form, source_url: form.source_url.trim() || null } });
      setForm({ title: "", body: "", source_url: "" });
      load();
    } catch (err) {
      setError(saveError(err, t));
    }
  }

  async function remove(id: string) {
    try { await api(`/admin/updates/${id}`, { method: "DELETE" }); load(); } catch (e) { setError(t(errorKey(e))); }
  }

  return (
    <>
      <FormError message={error} />
      <form onSubmit={save} className="mb-6 rounded-2xl border border-white/30 p-4">
        <Field id="u-title" label={t("admin.updateTitle")}><input id="u-title" required maxLength={200} className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field id="u-body" label={t("admin.body")}><textarea id="u-body" required rows={4} maxLength={4000} className={`${inputClass} py-3`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
        <Field id="u-src" label={t("admin.sourceUrl")}><input id="u-src" type="url" maxLength={500} className={inputClass} value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></Field>
        <Button type="submit">{t("admin.publish")}</Button>
      </form>
      {items === null ? <Loading /> : items.length === 0 ? <p className="text-base text-muted">{t("admin.none")}</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((u) => (
            <Row key={u.id}>
              <p className="text-base font-bold text-ink">{u.title}</p>
              <p className="whitespace-pre-line text-base">{u.body}</p>
              <div className="mt-3"><DeleteButton onDelete={() => remove(u.id)} /></div>
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

const EMPTY_KB = { title: "", body: "", topic: "disease" as KbArticle["topic"], language: "en" as KbArticle["language"],
  disease_class_code: "", crop_code: "", source_name: "", source_url: "" };

function KbPanel() {
  const { t } = useI18n();
  const { items, error, setError, load } = useList<KbArticle>("/kb");
  const [form, setForm] = useState(EMPTY_KB);
  const set = (k: keyof typeof EMPTY_KB) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/kb", { method: "POST", body: { ...form, disease_class_code: form.disease_class_code.trim() || null,
        crop_code: form.crop_code.trim() || null } });
      setForm(EMPTY_KB);
      load();
    } catch (err) {
      setError(saveError(err, t));
    }
  }

  async function remove(id: string) {
    try { await api(`/admin/kb/${id}`, { method: "DELETE" }); load(); } catch (e) { setError(t(errorKey(e))); }
  }

  return (
    <>
      <FormError message={error} />
      <form onSubmit={save} className="mb-6 rounded-2xl border border-white/30 p-4">
        <Field id="k-title" label={t("admin.articleTitle")}><input id="k-title" required maxLength={200} className={inputClass} value={form.title} onChange={(e) => set("title")(e.target.value)} /></Field>
        <Field id="k-body" label={t("admin.body")}><textarea id="k-body" required rows={5} maxLength={8000} className={`${inputClass} py-3`} value={form.body} onChange={(e) => set("body")(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="k-topic" label={t("admin.topic")}>
            <select id="k-topic" className={inputClass} value={form.topic} onChange={(e) => set("topic")(e.target.value)}>
              {(["disease", "productivity", "irrigation", "general"] as const).map((k) => <option key={k} value={k}>{t(`admin.topics.${k}`)}</option>)}
            </select>
          </Field>
          <Field id="k-lang" label={t("admin.language")}>
            <select id="k-lang" className={inputClass} value={form.language} onChange={(e) => set("language")(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
          </Field>
        </div>
        <Field id="k-code" label={t("admin.diseaseCode")}><input id="k-code" maxLength={60} className={inputClass} value={form.disease_class_code} onChange={(e) => set("disease_class_code")(e.target.value)} /></Field>
        <Field id="k-crop" label={t("admin.cropCode")}><input id="k-crop" maxLength={30} className={inputClass} value={form.crop_code} onChange={(e) => set("crop_code")(e.target.value)} /></Field>
        <Field id="k-sname" label={t("admin.sourceName")}><input id="k-sname" required maxLength={200} className={inputClass} value={form.source_name} onChange={(e) => set("source_name")(e.target.value)} /></Field>
        <Field id="k-surl" label={t("admin.articleUrl")}><input id="k-surl" required type="url" maxLength={500} className={inputClass} value={form.source_url} onChange={(e) => set("source_url")(e.target.value)} /></Field>
        <Button type="submit">{t("admin.save")}</Button>
      </form>
      {items === null ? <Loading /> : items.length === 0 ? <p className="text-base text-muted">{t("admin.none")}</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((k) => (
            <Row key={k.id}>
              <p className="text-base font-bold text-ink">{k.title}</p>
              <p className="text-base text-muted">
                {t(`admin.topics.${k.topic}`)} · {k.language} · {k.disease_class_code ?? k.crop_code ?? ""}
              </p>
              <p className="text-base">
                <a href={k.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">{k.source_name}</a>
                {" · "}{t("admin.verifiedBy", { name: k.verified_by, date: k.verified_at })}
              </p>
              <div className="mt-3"><DeleteButton onDelete={() => remove(k.id)} /></div>
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

function ListingsPanel() {
  const { t } = useI18n();
  const f = useFormat();
  const [status, setStatus] = useState<"" | Listing["status"]>("");
  const { items, error, setError, load } = useList<Listing>(`/admin/listings${status ? `?status=${status}` : ""}`);

  async function moderate(l: Listing) {
    try {
      await api(`/listings/${l.id}`, { method: "PATCH", body: { status: l.status === "hidden" ? "open" : "hidden" } });
      load();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  return (
    <>
      <FormError message={error} />
      <div className="mb-4 flex flex-wrap gap-2" role="group">
        {(["", "open", "closed", "hidden"] as const).map((s) => (
          <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
            className={`min-h-11 rounded-full border px-4 text-base font-semibold ${status === s ? "border-white bg-white text-ink-strong" : "border-line"}`}>
            {s ? t(`statuses.${s}`) : t("admin.all")}
          </button>
        ))}
      </div>
      {items === null ? <Loading /> : items.length === 0 ? <p className="text-base text-muted">{t("admin.none")}</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((l) => (
            <Row key={l.id}>
              <p className="flex items-start justify-between gap-2">
                <Link href={`/market/${l.id}`} className="text-base font-bold text-ink underline">{l.title}</Link>
                <StatusPill status={l.status} />
              </p>
              <p className="text-base text-muted">{f.qty(l.quantity, l.unit)} · {l.farmer.first_name} · {l.district}</p>
              {l.status !== "closed" && (
                <button type="button" className={`${small} mt-3`} onClick={() => moderate(l)}>
                  {l.status === "hidden" ? t("admin.unhide") : t("admin.hide")}
                </button>
              )}
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

type AdminTicket = { id: string; subject: string; message: string; status: "open" | "closed"; created_at: string;
  user_name: string; user_role: AdminUser["role"]; user_phone: string };

function SupportPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const { items, error, setError, load } = useList<AdminTicket>(`/admin/support/tickets?status=${status}`);

  async function toggle(tk: AdminTicket) {
    try {
      await api(`/admin/support/tickets/${tk.id}`, { method: "PATCH", body: { status: tk.status === "open" ? "closed" : "open" } });
      load();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  return (
    <>
      <FormError message={error} />
      <div className="mb-4 flex gap-2" role="group">
        {(["open", "closed"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
            className={`min-h-11 rounded-full border px-4 text-base font-semibold ${status === s ? "border-white bg-white text-ink-strong" : "border-line"}`}>
            {t(`help.${s}`)}
          </button>
        ))}
      </div>
      {items === null ? <Loading /> : items.length === 0 ? <p className="text-base text-muted">{t("admin.none")}</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((tk) => (
            <Row key={tk.id}>
              <p className="text-base font-bold text-ink">{tk.subject}</p>
              <p className="text-base text-muted">{tk.user_name} · {t(`admin.roles.${tk.user_role}`)} · {tk.created_at.slice(0, 10)}</p>
              <p className="mt-2 whitespace-pre-line text-base">{tk.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`tel:+91${tk.user_phone}`} className={`${small} flex items-center`}>{t("admin.callBack", { phone: tk.user_phone })}</a>
                <button type="button" className={small} onClick={() => toggle(tk)}>
                  {tk.status === "open" ? t("admin.close") : t("admin.reopen")}
                </button>
              </div>
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useSession(["admin"]);
  const [tab, setTab] = useState<Tab>("dashboard");
  if (!user) return <Screen><Loading /></Screen>;

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  return (
    <Screen title={t("admin.title")} wide>
      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0"
        aria-label={t("admin.title")}>
        {TABS.map((k) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}
            className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${tab === k ? "border-white bg-white text-ink-strong" : "border-line bg-white/10"}`}>
            {t(`admin.${k}`)}
          </button>
        ))}
      </nav>
      {tab === "dashboard" && <DashboardPanel />}
      {tab === "orders" && <OrdersPanel />}
      {tab === "crops" && <CropsPanel />}
      {tab === "prices" && <PricesPanel />}
      {tab === "settings" && <SettingsPanel />}
      {tab === "support" && <SupportPanel />}
      {tab === "schemes" && <SchemesPanel />}
      {tab === "updates" && <UpdatesPanel />}
      {tab === "kb" && <KbPanel />}
      {tab === "listings" && <ListingsPanel />}
      {tab === "users" && <UsersPanel />}
      <button type="button" onClick={logout} className="mt-8 min-h-12 text-base font-semibold text-ink underline lg:hidden">{t("auth.logout")}</button>
    </Screen>
  );
}
