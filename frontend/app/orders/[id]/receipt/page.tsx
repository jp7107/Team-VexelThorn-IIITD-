"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useFormat } from "@/components/market";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, type Receipt } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

function ReceiptView() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api<Receipt>(`/orders/${id}/receipt`).then(setR, (e) => setError(t(errorKey(e))));
  }, [user, id, t]);

  if (!r) return <Screen title={t("receipt.title")} back={`/orders/${id}`}>{error ? <FormError message={error} /> : <Loading />}</Screen>;
  const o = r.order;
  const when = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "long", timeStyle: "short" });

  return (
    <Screen title={t("receipt.title")} back={`/orders/${id}`}>
      {/* Printed on white paper: the page styles flip to black-on-white under @media print (globals.css). */}
      <article className="receipt rounded-2xl bg-white p-5 text-[#13241a] shadow-lg print:rounded-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-start justify-between gap-3 border-b border-[#13241a]/15 pb-4">
          <div>
            <p className="font-display text-xl font-semibold">{t("app.name")}</p>
            <p className="text-sm text-[#13241a]/70">{t("receipt.subtitle")}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{t("receipt.no")} {r.receipt_no}</p>
            <p className="text-[#13241a]/70">{when.format(new Date(r.issued_at))}</p>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#13241a]/60">{t("orders.seller")}</p>
            <p className="font-semibold">{o.farmer_name}</p>
            <p>{o.farmer_district}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#13241a]/60">{t("orders.buyer")}</p>
            <p className="font-semibold">{o.buyer_name}</p>
            <p>{o.buyer_district}</p>
          </div>
        </div>

        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="border-b border-[#13241a]/15 text-left text-xs text-[#13241a]/60">
              <th className="py-1.5 font-semibold">{t("receipt.item")}</th>
              <th className="py-1.5 text-right font-semibold">{t("receipt.qty")}</th>
              <th className="py-1.5 text-right font-semibold">{t("receipt.rate")}</th>
              <th className="py-1.5 text-right font-semibold">{t("receipt.amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#13241a]/10">
              <td className="py-2">{o.title}<span className="block text-xs text-[#13241a]/60">{f.crop(o.crop_code)}</span></td>
              <td className="py-2 text-right">{f.qty(o.quantity, o.unit)}</td>
              <td className="py-2 text-right">{f.money(o.price_per_unit)}</td>
              <td className="py-2 text-right">{f.money(o.subtotal)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="mb-4 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-y-1 text-sm">
          <dt>{t("receipt.subtotal")}</dt><dd className="text-right">{f.money(o.subtotal)}</dd>
          <dt>{t("orders.fee")}</dt><dd className="text-right">{f.money(o.platform_fee)}</dd>
          <dt className="border-t border-[#13241a]/20 pt-1 font-semibold">{t("receipt.paid")}</dt>
          <dd className="border-t border-[#13241a]/20 pt-1 text-right text-base font-semibold">{f.money(o.total)}</dd>
        </dl>

        <p className="rounded-xl bg-[#eef6f0] px-3 py-2 text-sm print:bg-transparent print:px-0">
          {t("receipt.method", { method: t(`orders.m_${o.payment_method ?? "cash"}`) })}
          {o.payment_ref ? ` · ${t("receipt.ref", { ref: o.payment_ref })}` : ""}
        </p>
        <p className="mt-4 text-xs text-[#13241a]/60">{t("receipt.footer", { id: o.id })}</p>
      </article>

      <button type="button" onClick={() => window.print()}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-lime font-bold text-ink-strong print:hidden">
        {t("receipt.print")}
      </button>
    </Screen>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<Screen back="/orders"><Loading /></Screen>}>
      <ReceiptView />
    </Suspense>
  );
}
