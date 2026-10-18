"use client";

// Admin console sections: dashboard, orders, users, crop catalogue, mandi prices, platform settings.
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { DayColumns, RankBars } from "@/components/charts";
import { StatusPill, useFormat } from "@/components/market";
import { Button, Field, FormError, Loading, inputClass } from "@/components/ui";
import {
  api, type AdminSettings, type AdminStats, type AdminUser, type CropType, type Order, type OrderStatus,
} from "@/lib/api";
import { forgetCatalogue } from "@/lib/catalogue";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { STATES } from "@/lib/places";

const chip = (on: boolean) => `min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${
  on ? "border-white bg-white text-ink-strong" : "border-line bg-white/10"}`;
const small = "min-h-10 rounded-xl border border-white/30 px-3 text-sm font-bold text-ink";

function useData<T>(path: string) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api<T>(path).then((d) => { setData(d); setError(""); }, (e) => setError(t(errorKey(e))));
  }, [path, t]);
  useEffect(load, [load]);
  return { data, error, setError, load };
}

// --- dashboard ---

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass rounded-2xl border border-white/15 p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="font-num text-2xl font-semibold leading-tight text-ink">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function DashboardPanel() {
  const { t } = useI18n();
  const f = useFormat();
  const [days, setDays] = useState(30);
  const { data: s, error } = useData<AdminStats>(`/admin/stats?days=${days}`);
  const n = (k: string) => Number(s?.totals[k] ?? 0);
  const rupees = (x: number) => `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(x)}`;
  const series = (k: "signups" | "orders" | "leaf_checks" | "chats" | "sales") =>
    (s?.daily ?? []).map((d) => ({ date: d.date, value: Number(d[k]) }));
  const named = (rows: AdminStats["funnel"]) => rows.map((r) => ({ key: r.key, label: r.label, value: Number(r.value) }));

  return (
    <>
      <FormError message={error} />
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{t("admin.dash.period")}</p>
        <div className="flex gap-2" role="group" aria-label={t("admin.dash.period")}>
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
              {t("admin.dash.days", { n: d })}
            </button>
          ))}
        </div>
      </div>
      {!s ? (error ? null : <Loading />) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label={t("admin.dash.sales")} value={f.money(n("sales"))} hint={t("admin.dash.fees", { fees: f.money(n("platform_fees")) })} />
            <Kpi label={t("admin.dash.orders")} value={String(n("orders"))}
              hint={t("admin.dash.toConfirm", { n: n("awaiting_confirmation") })} />
            <Kpi label={t("admin.dash.farmers")} value={String(n("farmers"))} hint={t("admin.dash.buyers", { n: n("buyers") })} />
            <Kpi label={t("admin.dash.listings")} value={String(n("open_listings"))} />
            <Kpi label={t("admin.dash.checks")} value={String(n("leaf_checks"))}
              hint={t("admin.dash.chats", { n: n("chats"), pct: n("ai_fallback_pct") })} />
            <Kpi label={t("admin.dash.tickets")} value={String(n("open_tickets"))} hint={t("admin.dash.blocked", { n: n("blocked") })} />
          </div>
          {/* One measure per chart (small multiples), never two scales on one axis. */}
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <DayColumns title={t("admin.dash.salesPerDay")} total={f.money(n("sales"))} points={series("sales")}
              format={rupees} tableLabel={t("admin.dash.table")} />
            <DayColumns title={t("admin.dash.ordersPerDay")} total={String(n("orders"))} points={series("orders")}
              tableLabel={t("admin.dash.table")} />
            <DayColumns title={t("admin.dash.signupsPerDay")} total={String(series("signups").reduce((a, p) => a + p.value, 0))}
              points={series("signups")} tableLabel={t("admin.dash.table")} />
            <DayColumns title={t("admin.dash.checksPerDay")} total={String(n("leaf_checks"))} points={series("leaf_checks")}
              tableLabel={t("admin.dash.table")} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RankBars title={t("admin.dash.funnel")} items={named(s.funnel)} empty={t("admin.dash.noData")} />
            <RankBars title={t("admin.dash.byCrop")} items={named(s.listings_by_crop)} empty={t("admin.dash.noData")} />
            <RankBars title={t("admin.dash.diseases")} items={named(s.top_diseases)} empty={t("admin.dash.noData")} />
            <RankBars title={t("admin.dash.states")} items={named(s.users_by_state)} empty={t("admin.dash.noData")} />
          </div>
        </>
      )}
    </>
  );
}

// --- orders ---

const ORDER_FILTERS: ("" | OrderStatus)[] = ["", "awaiting_payment", "payment_submitted", "paid", "dispatched", "delivered", "cancelled"];

export function OrdersPanel() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const { data, error, setError, load } = useData<Order[]>(`/admin/orders${status ? `?status=${status}` : ""}`);
  const day = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" });

  async function cancel(o: Order) {
    try {
      await api(`/orders/${o.id}`, { method: "PATCH", body: { action: "cancel", reason: "Cancelled by admin" } });
      load();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  return (
    <>
      <FormError message={error} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group">
        {ORDER_FILTERS.map((s) => (
          <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={chip(status === s)}>
            {s ? t(`statuses.${s}`) : t("admin.all")}
          </button>
        ))}
      </div>
      {data === null ? <Loading /> : data.length === 0 ? <p className="text-muted">{t("admin.nothing")}</p> : (
        <ul className="flex flex-col gap-2">
          {data.map((o) => (
            <li key={o.id} className="glass rounded-2xl border border-white/15 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/orders/${o.id}`} className="font-bold underline">{o.title}</Link>
                <StatusPill status={o.status} />
              </div>
              <p className="text-muted">
                {f.qty(o.quantity, o.unit)} · {o.farmer_name} → {o.buyer_name} · {day.format(new Date(o.created_at))}
              </p>
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-num text-base font-semibold">{f.money(o.total)}</span>
                <span className="text-xs text-muted">
                  {o.payment_method ? t(`orders.m_${o.payment_method}`) : ""}{o.payment_ref ? ` · ${o.payment_ref}` : ""}
                  {o.receipt_no ? ` · ${o.receipt_no}` : ""}
                </span>
              </p>
              {["awaiting_payment", "payment_submitted"].includes(o.status) && (
                <button type="button" onClick={() => cancel(o)} className={`${small} mt-2`}>{t("orders.cancelConfirm")}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// --- users ---

export function UsersPanel() {
  const { t } = useI18n();
  const [role, setRole] = useState<"" | AdminUser["role"]>("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const params = new URLSearchParams({ ...(role ? { role } : {}), ...(query ? { q: query } : {}) });
  const { data, error, setError, load } = useData<AdminUser[]>(`/admin/users?${params}`);

  async function toggle(u: AdminUser) {
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
      load();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  return (
    <>
      <FormError message={error} />
      <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }} className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.u.search")} aria-label={t("admin.u.search")}
          className={`${inputClass} flex-1`} />
        <button type="submit" className={small}>{t("prices.go")}</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2" role="group">
        {(["", "farmer", "customer", "admin"] as const).map((r) => (
          <button key={r || "all"} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={chip(role === r)}>
            {r ? t(`admin.roles.${r}`) : t("admin.all")}
          </button>
        ))}
      </div>
      {data === null ? <Loading /> : (
        <ul className="flex flex-col gap-2">
          {data.map((u) => (
            <li key={u.id} className="glass flex items-center justify-between gap-3 rounded-2xl border border-white/15 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-bold">{u.name}</span> · {t(`admin.roles.${u.role}`)}
                {u.customer_type ? ` (${t(`buyerTypes.${u.customer_type}`)})` : ""}
                {!u.is_active && <span className="ml-2 rounded-full bg-danger-soft px-2 text-xs font-bold text-danger">{t("admin.u.blocked")}</span>}
                <span className="block text-muted">{u.district}, {u.state} · {t("admin.joined", { date: u.created_at.slice(0, 10) })}</span>
              </span>
              {u.role !== "admin" && (
                <button type="button" onClick={() => toggle(u)} className={`${small} shrink-0 ${u.is_active ? "text-danger" : ""}`}>
                  {u.is_active ? t("admin.u.block") : t("admin.u.unblock")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// --- crop catalogue ---

const EMPTY_CROP = { code: "", name_en: "", name_hi: "", mandi_commodity: "", marketplace: true, active: true, sort_order: 0 };

export function CropsPanel() {
  const { t } = useI18n();
  const { data, error, setError, load } = useData<CropType[]>("/admin/crops");
  const [form, setForm] = useState<typeof EMPTY_CROP | null>(null);
  const [isNew, setIsNew] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      await api(`/admin/crops/${form.code}`, { method: "PUT", body: { ...form, mandi_commodity: form.mandi_commodity || null } });
      forgetCatalogue();
      setForm(null);
      load();
    } catch (err) {
      setError(t(errorKey(err)));
    }
  }

  const set = <K extends keyof typeof EMPTY_CROP>(k: K, v: (typeof EMPTY_CROP)[K]) => setForm((f) => f && { ...f, [k]: v });
  return (
    <>
      <FormError message={error} />
      <p className="mb-3 text-sm text-muted">{t("admin.crop.intro")}</p>
      {form ? (
        <form onSubmit={save} className="glass mb-4 rounded-2xl border border-white/15 p-4">
          <Field id="code" label={t("admin.crop.code")} hint={isNew ? t("admin.crop.codeHint") : undefined}>
            <input id="code" required pattern="[a-z][a-z0-9_]*" minLength={2} maxLength={30} disabled={!isNew}
              value={form.code} onChange={(e) => set("code", e.target.value.toLowerCase())} className={inputClass} />
          </Field>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field id="name_en" label={t("admin.crop.nameEn")}>
              <input id="name_en" required maxLength={60} value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className={inputClass} />
            </Field>
            <Field id="name_hi" label={t("admin.crop.nameHi")}>
              <input id="name_hi" required maxLength={60} value={form.name_hi} onChange={(e) => set("name_hi", e.target.value)} className={inputClass} />
            </Field>
            <Field id="mandi" label={t("admin.crop.mandi")} hint={t("admin.crop.mandiHint")}>
              <input id="mandi" maxLength={80} value={form.mandi_commodity} onChange={(e) => set("mandi_commodity", e.target.value)} className={inputClass} />
            </Field>
            <Field id="sort" label={t("admin.crop.sort")}>
              <input id="sort" type="number" min={0} max={999} value={form.sort_order}
                onChange={(e) => set("sort_order", Number(e.target.value))} className={inputClass} />
            </Field>
          </div>
          <label className="mb-2 flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.marketplace} onChange={(e) => set("marketplace", e.target.checked)} className="size-5 accent-lime" />
            {t("admin.crop.marketplace")}
          </label>
          <label className="mb-4 flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="size-5 accent-lime" />
            {t("admin.crop.active")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setForm(null)}>{t("admin.cancel")}</Button>
            <Button type="submit">{t("admin.save")}</Button>
          </div>
        </form>
      ) : (
        <Button className="mb-4" onClick={() => { setForm(EMPTY_CROP); setIsNew(true); }}>{t("admin.crop.add")}</Button>
      )}
      {data === null ? <Loading /> : (
        <ul className="flex flex-col gap-2">
          {data.map((c) => (
            <li key={c.code} className="glass flex items-center justify-between gap-3 rounded-2xl border border-white/15 px-4 py-3 text-sm">
              <span>
                <span className="font-bold">{c.name_en}</span> / {c.name_hi} <span className="text-muted">({c.code})</span>
                <span className="block text-xs text-muted">
                  {[c.mandi_commodity && t("admin.crop.mandiIs", { name: c.mandi_commodity }), c.marketplace && t("admin.crop.sellable"),
                    c.leaf_check && t("admin.crop.leaf"), !c.active && t("admin.crop.hidden")].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button type="button" className={small} onClick={() => {
                setForm({ ...c, mandi_commodity: c.mandi_commodity ?? "" });
                setIsNew(false);
              }}>{t("admin.edit")}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// --- mandi prices entered by admins ---

type AdminPrice = { id: string; commodity: string; state: string; district: string; market: string; arrival_date: string;
  min_price: string; max_price: string; modal_price: string; source: string };
const today = () => new Date().toISOString().slice(0, 10);

export function PricesPanel() {
  const { t } = useI18n();
  const f = useFormat();
  const { data, error, setError, load } = useData<AdminPrice[]>("/admin/prices");
  const { data: crops } = useData<CropType[]>("/crops");
  const blank = { commodity: "", state: "", district: "", market: "", arrival_date: today(), min_price: "", max_price: "", modal_price: "" };
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof blank) => (v: string) => { setForm((x) => ({ ...x, [k]: v })); setSaved(false); };

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/admin/prices", { method: "POST", body: form });
      setForm({ ...blank, commodity: form.commodity, state: form.state });
      setSaved(true);
      load();
    } catch (err) {
      setError(t(errorKey(err)));
    }
  }

  async function remove(id: string) {
    try {
      await api(`/admin/prices/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(t(errorKey(err)));
    }
  }

  const field = (k: keyof typeof blank, label: string, props: Record<string, unknown> = {}) => (
    <Field id={`p-${k}`} label={label}>
      <input id={`p-${k}`} required value={form[k]} onChange={(e) => set(k)(e.target.value)} className={inputClass} {...props} />
    </Field>
  );

  return (
    <>
      <FormError message={error} />
      <p className="mb-3 text-sm text-muted">{t("admin.price.intro")}</p>
      <form onSubmit={save} className="glass mb-4 rounded-2xl border border-white/15 p-4">
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field id="p-commodity" label={t("admin.price.commodity")}>
            <input id="p-commodity" required list="commodities" maxLength={80} value={form.commodity}
              onChange={(e) => set("commodity")(e.target.value)} className={inputClass} />
            <datalist id="commodities">
              {(crops ?? []).filter((c) => c.mandi_commodity).map((c) => <option key={c.code} value={c.mandi_commodity!} />)}
            </datalist>
          </Field>
          <Field id="p-state" label={t("auth.state")}>
            <select id="p-state" required value={form.state} onChange={(e) => set("state")(e.target.value)} className={inputClass}>
              <option value="" />
              {STATES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
            </select>
          </Field>
          {field("district", t("auth.district"), { maxLength: 60 })}
          {field("market", t("admin.price.market"), { maxLength: 120 })}
          {field("arrival_date", t("admin.price.date"), { type: "date", max: today() })}
          {field("min_price", t("admin.price.min"), { type: "number", min: 0, step: "0.01" })}
          {field("max_price", t("admin.price.max"), { type: "number", min: 0, step: "0.01" })}
          {field("modal_price", t("admin.price.modal"), { type: "number", min: 0, step: "0.01" })}
        </div>
        {saved && <p role="status" className="mb-3 text-sm font-semibold text-field">{t("admin.price.saved")}</p>}
        <Button type="submit">{t("admin.price.add")}</Button>
      </form>
      {data === null ? <Loading /> : data.length === 0 ? <p className="text-muted">{t("admin.nothing")}</p> : (
        <ul className="flex flex-col gap-2">
          {data.map((p) => (
            <li key={p.id} className="glass flex items-center justify-between gap-3 rounded-2xl border border-white/15 px-4 py-3 text-sm">
              <span>
                <span className="font-bold">{p.commodity}</span> · {p.market}, {p.district}, {p.state}
                <span className="block text-muted">{p.arrival_date} · {f.money(p.modal_price)} ({f.money(p.min_price)}–{f.money(p.max_price)}) {t("prices.perQuintal")}</span>
              </span>
              <button type="button" onClick={() => remove(p.id)} className={small}>{t("admin.delete")}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// --- platform settings ---

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="glass mb-4 rounded-2xl border border-white/15 p-4">
      <legend className="sr-only">{title}</legend>
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </fieldset>
  );
}

export function SettingsPanel() {
  const { t } = useI18n();
  const { data, error, setError } = useData<AdminSettings>("/admin/settings");
  const [form, setForm] = useState<AdminSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const value = form ?? data;
  if (!value) return error ? <FormError message={error} /> : <Loading />;
  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) => {
    setForm({ ...value, [k]: v });
    setSaved(false);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    const body: Partial<AdminSettings> = { ...value };
    delete body.online_gateway_configured;
    try {
      setForm(await api<AdminSettings>("/admin/settings", { method: "PUT", body }));
      forgetCatalogue();
      setSaved(true);
    } catch (err) {
      setError(t(errorKey(err)));
    }
  }

  const toggle = (k: "payments_online" | "payments_upi" | "payments_cash" | "show_demo_prices" | "assistant_enabled", label: string, hint?: string) => (
    <label className="mb-2 flex min-h-10 items-start gap-3 text-sm">
      <input type="checkbox" checked={value[k]} onChange={(e) => set(k, e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-lime" />
      <span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
  const text = (k: "helpline_number" | "helpline_short" | "support_phone" | "support_email", label: string, max: number) => (
    <Field id={k} label={label}>
      <input id={k} maxLength={max} value={value[k]} onChange={(e) => set(k, e.target.value)} className={inputClass} />
    </Field>
  );
  const number = (k: "helpline_open_hour" | "helpline_close_hour" | "helpline_languages" | "unpaid_order_hours", label: string,
    min: number, max: number) => (
    <Field id={k} label={label}>
      <input id={k} type="number" min={min} max={max} value={value[k]} onChange={(e) => set(k, Number(e.target.value))} className={inputClass} />
    </Field>
  );

  return (
    <form onSubmit={save}>
      <FormError message={error} />
      <Section title={t("admin.set.payments")}>
        {toggle("payments_online", t("orders.m_online"),
          value.online_gateway_configured ? t("admin.set.gatewayOn") : t("admin.set.gatewayOff"))}
        {toggle("payments_upi", t("orders.m_upi"), t("orders.m_upi_hint"))}
        {toggle("payments_cash", t("orders.m_cash"), t("orders.m_cash_hint"))}
        <div className="mt-3 grid gap-x-3 sm:grid-cols-2">
          <Field id="fee" label={t("admin.set.fee")} hint={t("admin.set.feeHint")}>
            <input id="fee" type="number" min={0} max={10} step="0.01" value={value.platform_fee_percent}
              onChange={(e) => set("platform_fee_percent", e.target.value)} className={inputClass} />
          </Field>
          {number("unpaid_order_hours", t("admin.set.unpaidHours"), 1, 720)}
        </div>
      </Section>
      <Section title={t("admin.set.helpline")}>
        <div className="grid gap-x-3 sm:grid-cols-2">
          {text("helpline_number", t("admin.set.helplineNumber"), 30)}
          {text("helpline_short", t("admin.set.helplineShort"), 10)}
          {number("helpline_open_hour", t("admin.set.opens"), 0, 23)}
          {number("helpline_close_hour", t("admin.set.closes"), 1, 24)}
          {number("helpline_languages", t("admin.set.languages"), 1, 50)}
          {text("support_phone", t("admin.set.supportPhone"), 20)}
          {text("support_email", t("admin.set.supportEmail"), 120)}
        </div>
      </Section>
      <Section title={t("admin.set.features")}>
        {toggle("assistant_enabled", t("admin.set.assistant"))}
        {toggle("show_demo_prices", t("admin.set.demoPrices"), t("admin.set.demoPricesHint"))}
        <Field id="announcement" label={t("admin.set.announcement")} hint={t("admin.set.announcementHint")}>
          <input id="announcement" maxLength={300} value={value.announcement} onChange={(e) => set("announcement", e.target.value)} className={inputClass} />
        </Field>
      </Section>
      {saved && <p role="status" className="mb-3 rounded-xl bg-field-soft px-4 py-3 font-semibold text-field">{t("admin.set.saved")}</p>}
      <Button type="submit">{t("admin.save")}</Button>
    </form>
  );
}
