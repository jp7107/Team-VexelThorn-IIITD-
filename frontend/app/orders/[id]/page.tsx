"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { CropIcon, StatusPill, useFormat } from "@/components/market";
import { Button, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, ApiError, type Order, type PayMethod } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

// Razorpay Checkout (test mode). Loaded only when the buyer chooses online payment.
type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => {
  open(): void;
  on(event: "payment.failed", cb: (r: { error: { description?: string } }) => void): void;
};
function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay missing")));
    s.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(s);
  });
}

const STEPS = ["placed", "paid", "dispatched", "delivered"] as const;
const REACHED: Record<Order["status"], number> = {
  awaiting_payment: 0, payment_submitted: 0, paid: 1, dispatched: 2, delivered: 3, cancelled: -1,
};

function Tracker({ o }: { o: Order }) {
  const { t, lang } = useI18n();
  const when = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const dates = [o.created_at, o.paid_at, o.dispatched_at, o.delivered_at];
  const reached = REACHED[o.status];
  return (
    <ol className="mb-4 grid grid-cols-4 gap-1">
      {STEPS.map((k, i) => (
        <li key={k} className="flex flex-col items-center text-center">
          <span className={`mb-1 h-1.5 w-full rounded-full ${i <= reached ? "bg-lime" : "bg-white/15"}`} />
          <span className={`text-xs font-semibold ${i <= reached ? "text-ink" : "text-muted"}`}>{t(`orders.step_${k}`)}</span>
          <span className="text-[0.65rem] text-muted">{i <= reached && dates[i] ? when.format(new Date(dates[i]!)) : ""}</span>
        </li>
      ))}
    </ol>
  );
}

function OrderView() {
  const { t } = useI18n();
  const f = useFormat();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [o, setO] = useState<Order | null>(null);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [upiRef, setUpiRef] = useState("");
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => api<Order>(`/orders/${id}`).then(setO, (e) => setError(t(
    e instanceof ApiError && (e.status === 404 || e.status === 422) ? "orders.notFound" : errorKey(e)))), [id, t]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function run(fn: () => Promise<Order>, done?: string) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      setO(await fn());
      if (done) setNote(t(done));
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const act = (action: string, done: string) => run(() => api<Order>(`/orders/${id}`, {
    method: "PATCH", body: { action, ...(action === "cancel" && reason.trim() ? { reason: reason.trim() } : {}) } }), done);

  async function payOnline() {
    setBusy(true);
    setError("");
    try {
      const out = await api<{ order: Order; gateway: { key_id: string; gateway_order_id: string; amount: number; currency: string } }>(
        `/orders/${id}/payment`, { method: "POST", body: { method: "online" } });
      const Razorpay = await loadCheckout();
      const rzp = new Razorpay({
        key: out.gateway.key_id, amount: out.gateway.amount, currency: out.gateway.currency, name: t("app.name"),
        description: out.order.title, order_id: out.gateway.gateway_order_id,
        prefill: { name: user?.name }, theme: { color: "#2f6f3e" },
        handler: (r: RazorpayResponse) => run(() => api<Order>(`/orders/${id}/payment/verify`, { method: "POST", body: r }),
          "orders.paidNote"),
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (r) => setError(r.error.description || t("orders.payFailed")));
      rzp.open();
    } catch (e) {
      setError(t(errorKey(e)));
      setBusy(false);
    }
  }

  function payDirect(e: FormEvent) {
    e.preventDefault();
    if (method === "online") return payOnline();
    run(async () => (await api<{ order: Order }>(`/orders/${id}/payment`, {
      method: "POST", body: { method, ...(method === "upi" ? { upi_ref: upiRef.trim() } : {}) } })).order,
    "orders.submittedNote");
  }

  if (!o) return <Screen title={t("orders.order")} back="/orders">{error ? <FormError message={error} /> : <Loading />}</Screen>;
  const buyer = o.role === "buyer";
  const farmer = o.role === "farmer";
  const upiLink = o.farmer_upi_id && `upi://pay?${new URLSearchParams({
    pa: o.farmer_upi_id, pn: o.farmer_name, am: Number(o.total).toFixed(2), cu: "INR", tn: `Kisan Mitra ${o.title}`.slice(0, 50),
  })}`;
  const canCancel = (buyer && o.status === "awaiting_payment") || (farmer && ["awaiting_payment", "payment_submitted"].includes(o.status));

  return (
    <Screen title={t("orders.order")} back="/orders">
      <section className="glass mb-4 rounded-2xl border border-white/15 p-4">
        <div className="mb-3 flex items-start gap-3">
          <CropIcon code={o.crop_code} className="size-10 shrink-0 text-field" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-snug">{o.title}</h2>
            <p className="text-sm text-muted">{f.crop(o.crop_code)} · {f.qty(o.quantity, o.unit)}</p>
          </div>
          <StatusPill status={o.status} />
        </div>
        {o.status === "cancelled" ? (
          <p className="rounded-xl bg-surface px-3 py-2 text-sm">
            {t("orders.cancelledBy", { who: t(`orders.who_${o.cancelled_by ?? "system"}`) })}
            {o.cancel_reason ? `: ${o.cancel_reason}` : ""}
          </p>
        ) : <Tracker o={o} />}

        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
          <dt className="text-muted">{f.qty(o.quantity, o.unit)} × {f.money(o.price_per_unit)}</dt>
          <dd className="font-num text-right">{f.money(o.subtotal)}</dd>
          {Number(o.platform_fee) > 0 && <>
            <dt className="text-muted">{t("orders.fee")}</dt><dd className="font-num text-right">{f.money(o.platform_fee)}</dd>
          </>}
          <dt className="border-t border-line pt-1 font-semibold">{t("orders.total")}</dt>
          <dd className="font-num border-t border-line pt-1 text-right text-lg font-semibold">{f.money(o.total)}</dd>
        </dl>
      </section>

      <section className="glass mb-4 grid gap-3 rounded-2xl border border-white/15 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted">{t("orders.seller")}</p>
          <p className="font-semibold">{o.farmer_name}</p>
          <p className="text-muted">{o.farmer_district}</p>
          {o.farmer_phone && <a href={`tel:+91${o.farmer_phone}`} className="font-semibold text-lime underline">{o.farmer_phone}</a>}
        </div>
        <div>
          <p className="text-xs text-muted">{t("orders.buyer")}</p>
          <p className="font-semibold">{o.buyer_name}</p>
          <p className="text-muted">{o.buyer_district}</p>
          {o.buyer_phone && <a href={`tel:+91${o.buyer_phone}`} className="font-semibold text-lime underline">{o.buyer_phone}</a>}
        </div>
      </section>

      <FormError message={error} />
      {note && <p role="status" className="mb-4 rounded-xl bg-field-soft px-4 py-3 font-semibold text-field">{note}</p>}

      {buyer && o.status === "awaiting_payment" && (
        <form onSubmit={payDirect} className="glass mb-4 rounded-2xl border border-white/15 p-4">
          <h2 className="mb-3 text-base font-semibold">{t("orders.payTitle", { total: f.money(o.total) })}</h2>
          {o.pay_methods.length === 0 ? <p className="text-sm text-muted">{t("orders.noMethods")}</p> : (
            <div className="mb-3 grid gap-2">
              {o.pay_methods.map((m) => (
                <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                  className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 text-left ${
                    method === m ? "border-white bg-white text-ink-strong" : "border-line bg-white/5"}`}>
                  <span>
                    <span className="block font-semibold">{t(`orders.m_${m}`)}</span>
                    <span className={`block text-xs ${method === m ? "text-ink-strong/70" : "text-muted"}`}>{t(`orders.m_${m}_hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {method === "upi" && upiLink && (
            <div className="mb-3 rounded-xl bg-surface p-3 text-sm">
              <p className="mb-2">{t("orders.upiTo")} <span className="font-semibold">{o.farmer_upi_id}</span></p>
              <a href={upiLink} className="mb-3 flex min-h-11 items-center justify-center rounded-xl bg-lime font-bold text-ink-strong">
                {t("orders.openUpi", { total: f.money(o.total) })}
              </a>
              <label htmlFor="utr" className="mb-1 block font-semibold">{t("orders.utr")}</label>
              <input id="utr" value={upiRef} onChange={(e) => setUpiRef(e.target.value)} required minLength={6} maxLength={40}
                pattern="[A-Za-z0-9-]+" inputMode="text" className={inputClass} placeholder="412345678901" />
              <p className="mt-1 text-xs text-muted">{t("orders.utrHint")}</p>
            </div>
          )}
          {method === "cash" && <p className="mb-3 rounded-xl bg-surface p-3 text-sm">{t("orders.cashNote")}</p>}
          {method && (
            <Button type="submit" disabled={busy}>
              {method === "online" ? t("orders.payNow", { total: f.money(o.total) }) : t(`orders.submit_${method}`)}
            </Button>
          )}
        </form>
      )}

      {buyer && o.status === "payment_submitted" && (
        <p className="glass mb-4 rounded-2xl border border-white/15 p-4 text-sm">{t("orders.waitConfirm")}</p>
      )}
      {farmer && o.status === "awaiting_payment" && (
        <p className="glass mb-4 rounded-2xl border border-white/15 p-4 text-sm">{t("orders.waitPay")}</p>
      )}
      {farmer && o.status === "payment_submitted" && (
        <section className="glass mb-4 rounded-2xl border border-white/15 p-4">
          <p className="mb-3 text-sm">{t(o.payment_method === "upi" ? "orders.checkUpi" : "orders.checkCash",
            { total: f.money(o.total), ref: o.payment_ref ?? "" })}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => act("confirm_payment", "orders.paidNote")} disabled={busy}>{t("orders.confirmPaid")}</Button>
            <Button variant="secondary" onClick={() => act("reject_payment", "orders.rejectedNote")} disabled={busy}>
              {t("orders.notReceived")}</Button>
          </div>
        </section>
      )}
      {farmer && o.status === "paid" && (
        <Button className="mb-4" onClick={() => act("dispatch", "orders.dispatchedNote")} disabled={busy}>{t("orders.markDispatched")}</Button>
      )}
      {buyer && (o.status === "paid" || o.status === "dispatched") && (
        <Button className="mb-4" onClick={() => act("deliver", "orders.deliveredNote")} disabled={busy}>{t("orders.markDelivered")}</Button>
      )}
      {buyer && o.status === "delivered" && (
        <Link href="/enquiries" className="mb-4 flex min-h-11 items-center justify-center rounded-xl border border-white/30 bg-white/10 font-bold">
          {t("orders.rateFarmer")}
        </Link>
      )}

      {o.receipt_no && (
        <Link href={`/orders/${o.id}/receipt`}
          className="mb-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white font-bold text-ink-strong">
          {t("orders.viewReceipt", { no: o.receipt_no })}
        </Link>
      )}

      {canCancel && (confirmCancel ? (
        <div className="glass rounded-2xl border border-white/15 p-4">
          <label htmlFor="why" className="mb-1 block text-sm font-semibold">{t("orders.cancelWhy")}</label>
          <input id="why" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={`${inputClass} mb-3`} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>{t("common.back")}</Button>
            <Button onClick={() => act("cancel", "orders.cancelledNote")} disabled={busy}>{t("orders.cancelConfirm")}</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmCancel(true)} className="min-h-11 text-sm font-semibold text-danger underline">
          {t("orders.cancel")}
        </button>
      ))}
    </Screen>
  );
}

// The id comes from the URL, which cacheComponents treats as request data: it must sit inside <Suspense>.
export default function OrderPage() {
  return (
    <Suspense fallback={<Screen back="/orders"><Loading /></Screen>}>
      <OrderView />
    </Suspense>
  );
}
