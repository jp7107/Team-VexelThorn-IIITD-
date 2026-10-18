"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Stars, StatusPill, useFormat } from "@/components/market";
import { Button, ButtonLink, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, type Enquiry } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const actionClass = "min-h-11 flex-1 rounded-xl px-4 text-base font-bold";

function RatingForm({ enquiry, onDone }: { enquiry: Enquiry; onDone: () => void }) {
  const { t } = useI18n();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stars) return setError(t("rate.pick"));
    setBusy(true);
    try {
      await api(`/enquiries/${enquiry.id}/rating`, { method: "POST", body: { stars, comment: comment || null } });
      onDone();
    } catch (err) {
      setError(t(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 glass rounded-xl border border-white/15 p-3">
      <fieldset>
        <legend className="mb-2 text-base font-bold text-ink">{t("rate.title")}</legend>
        <div className="mb-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={stars === n} aria-label={t("rate.star", { n })}
              onClick={() => setStars(n)}
              className={`size-12 rounded-lg text-3xl leading-none ${n <= stars ? "text-haldi" : "text-line"}`}>
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`c-${enquiry.id}`} className="mb-1 block text-base font-semibold">{t("rate.comment")}</label>
      <input id={`c-${enquiry.id}`} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)}
        className={`${inputClass} mb-3`} />
      {error && <p className="mb-2 font-semibold text-danger" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{t("rate.submit")}</Button>
    </form>
  );
}

export default function EnquiriesPage() {
  const { t } = useI18n();
  const f = useFormat();
  const { user } = useSession(["farmer", "customer"]);
  const [items, setItems] = useState<Enquiry[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Enquiry[]>("/me/enquiries").then(setItems).catch((e) => setError(t(errorKey(e))));
  }, [t]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function change(e: Enquiry, status: "accepted" | "declined" | "withdrawn") {
    try {
      await api(`/enquiries/${e.id}`, { method: "PATCH", body: { status } });
      load();
    } catch (err) {
      setError(t(errorKey(err)));
    }
  }

  if (!user) return <Screen><Loading /></Screen>;
  const isFarmer = user.role === "farmer";

  return (
    <Screen title={isFarmer ? t("enq.received") : t("enq.sent")} back={isFarmer ? "/farmer/listings" : "/market"}>
      <FormError message={error} />
      {items === null ? <Loading /> : items.length === 0 ? (
        <>
          <p className="mb-4 text-base text-muted">{t("enq.none")}</p>
          {!isFarmer && <ButtonLink href="/market" variant="secondary">{t("enq.browse")}</ButtonLink>}
        </>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((e) => (
            <li key={e.id} className="glass rounded-2xl border border-white/15 p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={`/market/${e.listing_id}`} className="text-base font-bold text-ink underline">{e.listing_title}</Link>
                <StatusPill status={e.status} />
              </div>
              <p className="text-base">
                {isFarmer
                  ? t("enq.from", { name: e.buyer_first_name, type: e.buyer_type ? t(`buyerTypes.${e.buyer_type}`) : "" })
                  : t("enq.to", { name: e.farmer_first_name })}
              </p>
              <p className="text-base">{t("enq.qty", { qty: f.qty(e.quantity, e.unit), unit: "" }).trim()}</p>
              {e.message && <p className="mt-2 whitespace-pre-line rounded-xl bg-surface px-3 py-2 text-base">{e.message}</p>}

              {isFarmer && e.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => change(e, "accepted")} className={`${actionClass} bg-haldi text-ink-strong`}>
                    {t("enq.accept")}
                  </button>
                  <button type="button" onClick={() => change(e, "declined")} className={`${actionClass} border border-white/30 text-ink`}>
                    {t("enq.decline")}
                  </button>
                </div>
              )}
              {!isFarmer && e.status === "pending" && (
                <button type="button" onClick={() => change(e, "withdrawn")} className={`${actionClass} mt-3 w-full border border-white/30 text-ink`}>
                  {t("enq.withdraw")}
                </button>
              )}
              {!isFarmer && e.status === "accepted" && e.farmer_phone && (
                <div className="mt-3 rounded-xl bg-field-soft p-3">
                  <p className="mb-2 text-base font-semibold text-field">{t("enq.acceptedNote")}</p>
                  <div className="flex gap-2">
                    <a href={`tel:+91${e.farmer_phone}`} className={`${actionClass} flex items-center justify-center bg-lime text-ink-strong`}>
                      {t("enq.call", { phone: e.farmer_phone })}
                    </a>
                    <a href={`https://wa.me/91${e.farmer_phone}?text=${encodeURIComponent(t("enq.waText", { title: e.listing_title }))}`}
                      target="_blank" rel="noopener noreferrer"
                      className={`${actionClass} flex items-center justify-center border border-field text-field`}>
                      {t("enq.whatsapp")}
                    </a>
                  </div>
                </div>
              )}
              {e.can_rate && <RatingForm enquiry={e} onDone={load} />}
              {e.my_rating && (
                <p className="mt-3 text-base font-semibold">
                  <Stars n={e.my_rating} /> {t("rate.done", { n: e.my_rating })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
