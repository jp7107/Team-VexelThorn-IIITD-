"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { CropIcon, isBulk, StatusPill, useFormat } from "@/components/market";
import { Button, ButtonLink, Field, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, ApiError, type Listing } from "@/lib/api";
import { describedBy, errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

function EnquiryForm({ listing }: { listing: Listing }) {
  const { t } = useI18n();
  const f = useFormat();
  const [qty, setQty] = useState(listing.min_order_qty ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    setFieldError(!(n > 0) ? t("errors.required") : n > Number(listing.quantity) ? t("market.tooMuch") : "");
    if (!(n > 0) || n > Number(listing.quantity)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/listings/${listing.id}/enquiries`, { method: "POST", body: { quantity: String(n), message: message || null } });
      setSent(true);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(t(status === 409 ? "market.alreadyPending" : status === 422 ? "market.notOpen" : errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl bg-field-soft p-4">
        <p className="mb-3 text-lg font-semibold text-field" role="status">{t("market.sent")}</p>
        <ButtonLink href="/enquiries" variant="secondary">{t("market.viewEnquiries")}</ButtonLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border-2 border-line p-4">
      <FormError message={error} />
      <Field id="qty" label={t("market.enquiryQty", { unit: t(`units.${listing.unit}`) })}
        hint={listing.min_order_qty ? t("market.minOrder", { qty: f.qty(listing.min_order_qty, listing.unit), unit: "" }).trim() : undefined}
        error={fieldError}>
        <input {...describedBy("qty", Boolean(listing.min_order_qty), fieldError)} className={inputClass}
          inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} />
      </Field>
      <Field id="msg" label={t("market.enquiryMsg")}>
        <textarea id="msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} py-3`} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("market.enquire")}</Button>
    </form>
  );
}

function ListingView() {
  const { t } = useI18n();
  const f = useFormat();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession(["customer", "farmer", "admin"]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<Listing>(`/listings/${id}`)
      .then(setListing)
      .catch((e) => setError(t(e instanceof ApiError && (e.status === 404 || e.status === 422) ? "market.notFound" : errorKey(e))));
  }, [user, id, t]);

  if (!user || (!listing && !error)) return <Screen back="/market"><Loading /></Screen>;
  if (!listing) return <Screen back="/market"><FormError message={error} /></Screen>;

  return (
    <Screen back={listing.is_mine ? "/farmer/listings" : "/market"}>
      <div className="mb-4 flex items-start gap-4">
        <CropIcon code={listing.crop_code} className="size-14 shrink-0 text-field" />
        <div>
          <h1 className="text-3xl font-extrabold leading-tight text-ink">{listing.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-lg text-muted">
            {f.crop(listing.crop_code)}
            {isBulk(listing) && <span className="rounded-full bg-haldi px-2 text-base font-bold text-ink-strong">{t("market.bulk")}</span>}
            {listing.status !== "open" && <StatusPill status={listing.status} />}
          </p>
        </div>
      </div>
      <dl className="mb-5 grid grid-cols-1 gap-2 rounded-2xl bg-surface p-4 text-lg">
        <div><dt className="sr-only">{t("sell.quantity")}</dt><dd className="font-extrabold">{f.qty(listing.quantity, listing.unit)}</dd></div>
        <div><dt className="sr-only">{t("market.price")}</dt><dd>{f.price(listing.price_per_unit, listing.unit)}</dd></div>
        {listing.min_order_qty && <div><dd>{t("market.minOrder", { qty: f.qty(listing.min_order_qty, listing.unit), unit: "" }).trim()}</dd></div>}
        <div><dd>{t("market.location", { district: listing.district, state: f.state(listing.state) })}</dd></div>
        <div>
          <dd>
            {t("market.by", { name: listing.farmer.first_name })} ·{" "}
            {listing.farmer.rating_count
              ? t("market.rating", { avg: listing.farmer.rating_avg ?? 0, count: listing.farmer.rating_count })
              : t("market.noRating")}
          </dd>
        </div>
      </dl>
      {listing.description && <p className="mb-5 whitespace-pre-line text-lg">{listing.description}</p>}

      {listing.is_mine ? (
        <>
          <p className="mb-3 text-lg font-semibold">{t("market.yours")}</p>
          <ButtonLink href="/farmer/listings" variant="secondary">{t("market.manage")}</ButtonLink>
        </>
      ) : user.role === "customer" && listing.status === "open" ? (
        <EnquiryForm listing={listing} />
      ) : null}
    </Screen>
  );
}

// The id comes from the URL (request data under cacheComponents), so it is read inside <Suspense>.
export default function ListingPage() {
  return (
    <Suspense fallback={<Screen back="/market"><Loading /></Screen>}>
      <ListingView />
    </Suspense>
  );
}
