"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CROP_ICONS, SproutIcon } from "@/components/icons";
import { StatusPill, useFormat } from "@/components/market";
import { Button, ButtonLink, ChoiceTile, Field, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, type Listing, type Unit } from "@/lib/api";
import { describedBy, errorKey } from "@/lib/forms";
import { cropLabel, useCrops } from "@/lib/catalogue";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const UNITS: Unit[] = ["quintal", "kg", "tonne", "dozen"];
const num = (v: string) => v.replace(/[^\d.]/g, "");

function NewListing({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const catalogue = useCrops();
  const [crop, setCrop] = useState("");
  const [form, setForm] = useState({ title: "", quantity: "", unit: "quintal" as Unit, price: "", minOrder: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cropCode = crop;
    const next: Record<string, string> = {};
    if (!cropCode) next.crop = t("errors.required");
    if (!form.title.trim()) next.title = t("errors.required");
    if (!(Number(form.quantity) > 0)) next.quantity = t("errors.area");
    if (form.minOrder && Number(form.minOrder) > Number(form.quantity)) next.minOrder = t("market.tooMuch");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError("");
    try {
      await api<Listing>("/listings", {
        method: "POST",
        body: {
          crop_code: cropCode, title: form.title.trim(), quantity: form.quantity, unit: form.unit,
          price_per_unit: form.price || null, min_order_qty: form.minOrder || null,
          description: form.description.trim() || null,
        },
      });
      onDone();
    } catch (err) {
      setFormError(t(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mb-6 rounded-2xl border border-white/30 p-4">
      <FormError message={formError} />
      <fieldset className="mb-5">
        <legend className="mb-2 text-base font-semibold">{t("sell.crop")}</legend>
        <div className="grid grid-cols-2 gap-3">
          {catalogue === null ? <Loading /> : catalogue.filter((c) => c.marketplace).map((c) => {
            const Icon = CROP_ICONS[c.code] ?? SproutIcon;
            return <ChoiceTile key={c.code} selected={crop === c.code} onSelect={() => setCrop(c.code)}
              icon={<Icon className="size-8" />} label={cropLabel(catalogue, c.code, lang)} />;
          })}
        </div>
        <p className="mt-2 text-sm text-muted">{t("sell.missingCrop")}</p>
        {errors.crop && <p className="mt-2 font-semibold text-danger">{errors.crop}</p>}
      </fieldset>
      <Field id="title" label={t("sell.listingTitle")} hint={t("sell.titleHint")} error={errors.title}>
        <input {...describedBy("title", true, errors.title)} className={inputClass} maxLength={120} value={form.title}
          onChange={(e) => set("title")(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="quantity" label={t("sell.quantity")} error={errors.quantity}>
          <input {...describedBy("quantity", false, errors.quantity)} className={inputClass} inputMode="decimal"
            value={form.quantity} onChange={(e) => set("quantity")(num(e.target.value))} />
        </Field>
        <Field id="unit" label={t("sell.unit")}>
          <select id="unit" className={inputClass} value={form.unit} onChange={(e) => set("unit")(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{t(`units.${u}`)}</option>)}
          </select>
        </Field>
      </div>
      <Field id="price" label={t("sell.price")}>
        <input id="price" className={inputClass} inputMode="decimal" value={form.price} onChange={(e) => set("price")(num(e.target.value))} />
      </Field>
      <Field id="minOrder" label={t("sell.minOrder")} error={errors.minOrder}>
        <input {...describedBy("minOrder", false, errors.minOrder)} className={inputClass} inputMode="decimal"
          value={form.minOrder} onChange={(e) => set("minOrder")(num(e.target.value))} />
      </Field>
      <Field id="description" label={t("sell.description")}>
        <textarea id="description" rows={3} maxLength={1000} className={`${inputClass} py-3`} value={form.description}
          onChange={(e) => set("description")(e.target.value)} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("sell.save")}</Button>
    </form>
  );
}

export default function MyListingsPage() {
  const { t } = useI18n();
  const f = useFormat();
  const { user } = useSession(["farmer"]);
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Listing[]>("/me/listings").then(setListings).catch((e) => setError(t(errorKey(e))));
  }, [t]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function setStatus(l: Listing, status: "open" | "closed") {
    try {
      await api(`/listings/${l.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  if (!user) return <Screen><Loading /></Screen>;

  return (
    <Screen title={t("sell.title")} back="/farmer">
      <FormError message={error} />
      {adding ? (
        <NewListing onDone={() => { setAdding(false); load(); }} />
      ) : (
        <Button type="button" onClick={() => setAdding(true)} className="mb-6">{t("sell.new")}</Button>
      )}
      {listings === null ? <Loading /> : listings.length === 0 ? (
        <p className="text-base text-muted">{t("sell.none")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((l) => (
            <li key={l.id} className="glass rounded-2xl border border-white/15 p-4">
              <Link href={`/market/${l.id}`} className="block text-base font-bold text-ink underline">{l.title}</Link>
              <p className="text-base">{f.qty(l.quantity, l.unit)} · {f.price(l.price_per_unit, l.unit)}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={l.status} />
                {(l.pending_enquiries ?? 0) > 0 && (
                  <Link href="/enquiries" className="rounded-full bg-haldi px-3 py-1 text-base font-bold text-ink-strong">
                    {t("sell.pending", { n: l.pending_enquiries ?? 0 })}
                  </Link>
                )}
              </p>
              {l.status === "hidden" ? (
                <p className="mt-2 text-base text-muted">{t("sell.hiddenNote")}</p>
              ) : (
                <button type="button" onClick={() => setStatus(l, l.status === "open" ? "closed" : "open")}
                  className="mt-3 min-h-11 rounded-xl border border-white/30 px-4 font-bold text-ink">
                  {l.status === "open" ? t("sell.close") : t("sell.reopen")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/enquiries" variant="secondary" className="mt-6">{t("sell.seeEnquiries")}</ButtonLink>
    </Screen>
  );
}
