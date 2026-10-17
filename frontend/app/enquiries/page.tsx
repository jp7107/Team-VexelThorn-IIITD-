"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusPill, useFormat } from "@/components/market";
import { ButtonLink, FormError, Loading, Screen } from "@/components/ui";
import { api, type Enquiry } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const actionClass = "min-h-11 flex-1 rounded-xl px-4 text-lg font-extrabold";

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
          <p className="mb-4 text-lg text-muted">{t("enq.none")}</p>
          {!isFarmer && <ButtonLink href="/market" variant="secondary">{t("enq.browse")}</ButtonLink>}
        </>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((e) => (
            <li key={e.id} className="rounded-2xl border-2 border-line p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={`/market/${e.listing_id}`} className="text-lg font-extrabold text-ink underline">{e.listing_title}</Link>
                <StatusPill status={e.status} />
              </div>
              <p className="text-lg">
                {isFarmer
                  ? t("enq.from", { name: e.buyer_first_name, type: e.buyer_type ? t(`buyerTypes.${e.buyer_type}`) : "" })
                  : t("enq.to", { name: e.farmer_first_name })}
              </p>
              <p className="text-lg">{t("enq.qty", { qty: f.qty(e.quantity, e.unit), unit: "" }).trim()}</p>
              {e.message && <p className="mt-2 whitespace-pre-line rounded-xl bg-surface px-3 py-2 text-lg">{e.message}</p>}

              {isFarmer && e.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => change(e, "accepted")} className={`${actionClass} bg-haldi text-ink-strong`}>
                    {t("enq.accept")}
                  </button>
                  <button type="button" onClick={() => change(e, "declined")} className={`${actionClass} border-2 border-ink text-ink`}>
                    {t("enq.decline")}
                  </button>
                </div>
              )}
              {!isFarmer && e.status === "pending" && (
                <button type="button" onClick={() => change(e, "withdrawn")} className={`${actionClass} mt-3 w-full border-2 border-ink text-ink`}>
                  {t("enq.withdraw")}
                </button>
              )}
              {!isFarmer && e.status === "accepted" && e.farmer_phone && (
                <div className="mt-3 rounded-xl bg-field-soft p-3">
                  <p className="mb-2 text-lg font-semibold text-field">{t("enq.acceptedNote")}</p>
                  <div className="flex gap-2">
                    <a href={`tel:+91${e.farmer_phone}`} className={`${actionClass} flex items-center justify-center bg-ink text-white`}>
                      {t("enq.call", { phone: e.farmer_phone })}
                    </a>
                    <a href={`https://wa.me/91${e.farmer_phone}?text=${encodeURIComponent(t("enq.waText", { title: e.listing_title }))}`}
                      target="_blank" rel="noopener noreferrer"
                      className={`${actionClass} flex items-center justify-center border-2 border-field text-field`}>
                      {t("enq.whatsapp")}
                    </a>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
