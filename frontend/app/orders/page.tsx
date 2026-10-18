"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CropIcon, StatusPill, useFormat } from "@/components/market";
import { ButtonLink, FormError, Loading, Screen } from "@/components/ui";
import { api, type Order } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const FILTERS = ["all", "active", "done"] as const;
const ACTIVE = ["awaiting_payment", "payment_submitted", "paid", "dispatched"];

export default function OrdersPage() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const { user } = useSession(["farmer", "customer"]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api<Order[]>("/me/orders").then(setOrders, (e) => setError(t(errorKey(e))));
  }, [user, t]);

  if (!user) return <Screen><Loading /></Screen>;
  const day = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" });
  const shown = orders?.filter((o) => filter === "all" || (filter === "active") === ACTIVE.includes(o.status));
  const needsMe = (o: Order) => (o.role === "buyer" && ["awaiting_payment", "dispatched"].includes(o.status))
    || (o.role === "farmer" && ["payment_submitted", "paid"].includes(o.status));

  return (
    <Screen title={t("orders.title")} back={user.role === "farmer" ? "/farmer" : "/market"}>
      <FormError message={error} />
      <div className="mb-4 flex gap-2" role="group" aria-label={t("orders.filter")}>
        {FILTERS.map((k) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${
              filter === k ? "border-white bg-white text-ink-strong" : "border-line bg-white/10"}`}>
            {t(`orders.f_${k}`)}
          </button>
        ))}
      </div>
      {shown === undefined ? <Loading /> : shown.length === 0 ? (
        <div className="glass rounded-2xl border border-white/15 p-5 text-center">
          <p className="mb-4 text-muted">{t("orders.none")}</p>
          <ButtonLink href={user.role === "farmer" ? "/enquiries" : "/market"} variant="secondary">
            {user.role === "farmer" ? t("home.enquiries") : t("enq.browse")}
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="glass flex gap-3 rounded-2xl border border-white/15 p-4 hover:border-white/40">
                <CropIcon code={o.crop_code} className="size-10 shrink-0 text-field" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-bold leading-snug">{o.title}</span>
                    <StatusPill status={o.status} />
                  </span>
                  <span className="block text-sm text-muted">
                    {f.qty(o.quantity, o.unit)} · {o.role === "buyer" ? t("orders.from", { name: o.farmer_name })
                      : t("orders.to", { name: o.buyer_name })} · {day.format(new Date(o.created_at))}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-num text-lg font-semibold">{f.money(o.total)}</span>
                    {needsMe(o) && <span className="rounded-full bg-lime px-2.5 py-0.5 text-xs font-bold text-ink-strong">
                      {t("orders.yourTurn")}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
