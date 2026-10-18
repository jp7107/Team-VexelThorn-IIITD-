"use client";

// Listing detail: GET /listings/{id} plus GET /farmers/{farmer_id}/ratings. The side panel depends on who
// is looking: buyers send an enquiry, the owner closes / reopens, an admin hides / unhides. Listings have
// no photo field, so the tile is the generated produce illustration.
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  UnavailableState,
} from "@/components/ui";
import { ArrowRightIcon, CheckIcon, MapPinIcon, SendIcon, SettingsIcon, ShieldIcon, StarIcon, UsersIcon } from "@/components/icons";
import { ApiError, api, describeError, type Enquiry, type FarmerRatings, type Listing, type User } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cropLabel, inr, num, shortDate, statusTone, timeAgo } from "@/lib/format";
import { CropGlyph, ProduceArt, produceArtLabel } from "@/features/market/MarketArt";
import { RatingStars } from "@/features/market/RatingStars";
import { Field, FormError, parseAmount } from "@/features/market/ListingForm";
import { useMarketLabels } from "@/features/market/i18n";
import "./market.css";

const iconStyle = { color: "var(--km-green-700)" };

export function ListingDetail({ user }: { user: User }) {
  const { t } = useMarketLabels();
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const res = useApi<Listing>(id ? `/listings/${encodeURIComponent(id)}` : null);
  // Result of a status PATCH, shown until the page is reloaded.
  const [patched, setPatched] = useState<Listing | null>(null);
  const listing = patched && res.data && patched.id === res.data.id ? patched : res.data;

  const back = (
    <Link href="/market" className="km-linkish kmx-back">
      <ArrowRightIcon size={13} style={{ transform: "rotate(180deg)" }} />
      {t("market.detailBack")}
    </Link>
  );

  // 404: missing, or closed/hidden and not ours. 422: the id is not a valid listing id.
  const notFound = !id || (res.error !== null && (res.error.status === 404 || res.error.status === 422));
  if (notFound) {
    return (
      <div className="kmx-market">
        {back}
        <EmptyState
          title={t("market.notFound")}
          hint={t("market.notFoundHint")}
          action={
            <ButtonLink href="/market" size="sm">
              {t("market.detailBack")}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (res.error && !listing) {
    return (
      <div className="kmx-market">
        {back}
        <ErrorState
          message={describeError(res.error)}
          onRetry={() => {
            setPatched(null);
            res.reload();
          }}
        />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="kmx-market">
        {back}
        <DetailSkeleton label={t("market.loadingListing")} />
      </div>
    );
  }

  return (
    <div className="kmx-market">
      {back}
      <div className="kmx-detail-grid">
        <ListingInfo listing={listing} />
        <div className="kmx-detail-side">
          {listing.is_mine ? (
            <OwnerPanel listing={listing} onPatched={setPatched} />
          ) : user.role === "admin" ? (
            <AdminPanel listing={listing} onPatched={setPatched} />
          ) : user.role === "customer" ? (
            <EnquiryPanel listing={listing} />
          ) : (
            <Panel title={t("market.enquiryTitle")} icon={<SendIcon size={16} style={iconStyle} />}>
              <UnavailableState what={t("market.customerOnly")} hint={t("market.customerOnlyHint")} />
            </Panel>
          )}
          <SellerPanel listing={listing} />
        </div>
      </div>
    </div>
  );
}

/* ---------- listing facts ---------- */

function ListingInfo({ listing: l }: { listing: Listing }) {
  const { t, lang, unitLabel, statusLabel } = useMarketLabels();
  const unit = unitLabel(l.unit);
  const place = t("market.location", { district: l.district, state: l.state });
  const hasPrice = l.price_per_unit !== null;

  return (
    <Panel>
      <div className="kmx-detail-hero">
        <span className="kmx-detail-art" role="img" aria-label={produceArtLabel(l.crop_code, lang)}>
          <ProduceArt crop={l.crop_code} height={148} glyphSize={62} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="kmx-detail-badges">
            <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
            {l.is_mine && <Badge tone="info">{t("market.yourListing")}</Badge>}
          </div>
          <h1 className="kmx-detail-title">{l.title}</h1>
          <p className="kmx-detail-sub">
            <CropGlyph crop={l.crop_code} size={13} />
            {cropLabel(l.crop_code, lang)}
            <span className="kmx-dot" aria-hidden="true" />
            <MapPinIcon size={12} />
            {place}
          </p>
          <p className="kmx-detail-price">
            {hasPrice ? (
              <>
                {inr(l.price_per_unit, lang)} <small>/ {unit}</small>
              </>
            ) : (
              t("market.priceOnEnquiry")
            )}
          </p>
          <p className="kmx-detail-desc">
            {l.description?.trim() ? l.description : <span className="kmx-muted-note">{t("market.noDescription")}</span>}
          </p>
        </div>
      </div>

      <h2 className="km-sr-only">{t("market.listingDetails")}</h2>
      <dl className="kmx-facts">
        <Fact label={t("market.quantity")} value={`${num(l.quantity, lang)} ${unit}`} />
        <Fact
          label={t("market.pricePerUnit")}
          value={hasPrice ? `${inr(l.price_per_unit, lang)} / ${unit}` : t("market.priceOnEnquiry")}
        />
        <Fact
          label={t("market.minOrder")}
          value={l.min_order_qty !== null ? `${num(l.min_order_qty, lang)} ${unit}` : t("market.noMinOrder")}
        />
        <Fact label={t("market.locationLabel")} value={place} />
        <Fact label={t("market.formStatus")} value={statusLabel(l.status)} />
        <Fact label={t("market.listedDate")} value={shortDate(l.created_at, lang)} />
      </dl>
      <p className="km-footnote" style={{ marginTop: 10 }}>
        {t("market.artNote")}
      </p>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="kmx-fact">
      <dt className="kmx-fact-label">{label}</dt>
      <dd className="kmx-fact-value">{value}</dd>
    </div>
  );
}

function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="kmx-detail-grid" role="status" aria-busy="true">
      <span className="km-sr-only">{label}</span>
      <div className="km-panel">
        <div className="km-panel-body">
          <div className="kmx-detail-hero">
            <span className="km-skeleton" style={{ display: "block", height: 148 }} />
            <LoadingBlock lines={5} />
          </div>
          <div style={{ marginTop: 12 }}>
            <LoadingBlock lines={2} height={40} />
          </div>
        </div>
      </div>
      <div className="km-panel">
        <div className="km-panel-body">
          <LoadingBlock lines={5} />
        </div>
      </div>
    </div>
  );
}

/* ---------- buyer: enquiry ---------- */

function EnquiryPanel({ listing: l }: { listing: Listing }) {
  const { t, lang, unitLabel } = useMarketLabels();
  const uid = useId();
  const [qty, setQty] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ qty?: string; message?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [sent, setSent] = useState<Enquiry | null>(null);
  const [sending, setSending] = useState(false);
  const unit = unitLabel(l.unit);
  const available = Number(l.quantity);

  if (l.status !== "open") {
    return (
      <Panel title={t("market.enquiryTitle")} icon={<SendIcon size={16} style={iconStyle} />}>
        <p className="kmx-inline-note warn">{t("market.listingClosed")}</p>
      </Panel>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const next: { qty?: string; message?: string } = {};
    const a = parseAmount(qty);
    const tooMuch = t("market.qtyTooLarge", { qty: num(l.quantity, lang), unit });
    if (!a.ok) {
      next.qty = a.error === "decimals" ? t("market.decimalsInvalid") : a.error === "large" ? tooMuch : t("market.qtyPositive");
    } else if (a.n <= 0) next.qty = t("market.qtyPositive");
    else if (a.n > available) next.qty = tooMuch;
    const cleanMessage = message.trim();
    if (cleanMessage.length > 500) next.message = t("market.messageTooLong");

    if (!a.ok || next.qty || next.message) {
      setErrors(next);
      setFormError(t("market.fixErrors"));
      document.getElementById(`${uid}-${next.qty ? "qty" : "message"}`)?.focus();
      return;
    }

    setErrors({});
    setFormError(null);
    setDuplicate(false);
    setSending(true);
    try {
      const body: { quantity: string; message?: string } = { quantity: a.value };
      if (cleanMessage) body.message = cleanMessage;
      setSent(await api<Enquiry>(`/listings/${encodeURIComponent(l.id)}/enquiries`, { method: "POST", body }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setDuplicate(true);
      else setFormError(describeError(err)); // 422 carries the server's reason (e.g. no longer open)
    } finally {
      setSending(false);
    }
  }

  const qtyHint = [
    t("market.quantityAvailable", { qty: num(l.quantity, lang), unit }),
    l.min_order_qty !== null ? t("market.enquiryMinOrderHint", { qty: num(l.min_order_qty, lang), unit }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel title={t("market.enquiryTitle")} icon={<SendIcon size={16} style={iconStyle} />}>
      <div className="kmx-panel-stack">
        <div aria-live="polite" aria-atomic="true" className="kmx-panel-stack">
          {sent && (
            <p className="kmx-success">
              <CheckIcon size={14} />
              <span>{t("market.enquirySent")}</span>
            </p>
          )}
          {duplicate && (
            <p className="kmx-inline-note warn">
              <span>
                {t("market.duplicateEnquiry")}{" "}
                <Link href="/enquiries" className="km-linkish">
                  {t("market.viewMyEnquiries")}
                </Link>
              </span>
            </p>
          )}
        </div>

        {sent ? (
          <>
            <p className="km-caption">{t("market.enquirySentDetail", { qty: num(sent.quantity, lang), unit })}</p>
            <div className="kmx-form-actions">
              <ButtonLink href="/enquiries" size="sm">
                {t("market.viewMyEnquiries")}
              </ButtonLink>
            </div>
          </>
        ) : (
          <form className="kmx-form" onSubmit={submit} noValidate aria-busy={sending}>
            <p className="km-caption">{t("market.enquiryHint")}</p>
            <Field id={`${uid}-qty`} label={t("market.enquiryQuantity", { unit })} hint={qtyHint} error={errors.qty}>
              {(a11y) => (
                <input
                  {...a11y}
                  className="km-input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              )}
            </Field>
            <Field
              id={`${uid}-message`}
              label={t("market.enquiryMessage")}
              hint={`${t("market.enquiryMessageHint")} ${message.length}/500`}
              error={errors.message}
            >
              {(a11y) => (
                <textarea
                  {...a11y}
                  className="km-textarea"
                  rows={4}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Field>
            <FormError message={formError} />
            <div className="kmx-form-actions">
              <Button type="submit" disabled={sending} aria-busy={sending}>
                <SendIcon size={14} /> {sending ? t("market.sendingEnquiry") : t("market.sendEnquiry")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

/* ---------- owner / admin: status PATCH ---------- */

function useStatusPatch(listing: Listing, onPatched: (l: Listing) => void) {
  const { t } = useMarketLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(status: Listing["status"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const updated = await api<Listing>(`/listings/${encodeURIComponent(listing.id)}`, {
        method: "PATCH",
        body: { status },
      });
      onPatched(updated);
      setDone(t("market.updated"));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, run };
}

function StatusFeedback({ done, error }: { done: string | null; error: string | null }) {
  return (
    <>
      <div aria-live="polite" aria-atomic="true">
        {done && (
          <p className="kmx-success">
            <CheckIcon size={14} />
            <span>{done}</span>
          </p>
        )}
      </div>
      <FormError message={error} />
    </>
  );
}

function OwnerPanel({ listing: l, onPatched }: { listing: Listing; onPatched: (l: Listing) => void }) {
  const { t, lang } = useMarketLabels();
  const { busy, error, done, run } = useStatusPatch(l, onPatched);
  const pending = l.pending_enquiries ?? 0;
  const hidden = l.status === "hidden";
  const open = l.status === "open";

  return (
    <Panel title={t("market.ownerTitle")} icon={<SettingsIcon size={16} style={iconStyle} />}>
      <div className="kmx-panel-stack">
        <div className="kmx-owner-row">
          <span className="kmx-owner-count">
            <strong>{num(pending, lang)}</strong>
            {pending === 1 ? t("market.pendingLabelOne") : t("market.pendingLabelMany")}
          </span>
          <ButtonLink href="/enquiries" size="sm" variant="secondary">
            {t("market.manageEnquiries")}
          </ButtonLink>
        </div>

        {hidden ? (
          <p className="kmx-inline-note warn">
            <ShieldIcon size={14} style={{ flex: "none", marginTop: 1 }} />
            <span>{t("market.listingHidden")}</span>
          </p>
        ) : (
          <p className={`kmx-inline-note ${open ? "good" : "warn"}`}>{open ? t("market.ownerOpenNote") : t("market.listingClosed")}</p>
        )}

        <div className="kmx-form-actions">
          {!hidden && (
            <Button
              size="sm"
              variant={open ? "secondary" : "primary"}
              disabled={busy}
              aria-busy={busy}
              onClick={() => run(open ? "closed" : "open")}
            >
              {busy ? t("market.updatingStatus") : open ? t("market.closeListing") : t("market.reopenListing")}
            </Button>
          )}
          <ButtonLink href={`/market/mine?edit=${encodeURIComponent(l.id)}`} size="sm" variant="ghost">
            {t("market.editListing")}
          </ButtonLink>
        </div>
        <StatusFeedback done={done} error={error} />
      </div>
    </Panel>
  );
}

function AdminPanel({ listing: l, onPatched }: { listing: Listing; onPatched: (l: Listing) => void }) {
  const { t } = useMarketLabels();
  const { busy, error, done, run } = useStatusPatch(l, onPatched);
  const hidden = l.status === "hidden";

  return (
    <Panel title={t("market.moderationTitle")} icon={<ShieldIcon size={16} style={iconStyle} />}>
      <div className="kmx-panel-stack">
        <p className={`kmx-inline-note ${hidden ? "warn" : "info"}`}>
          {hidden ? `${t("market.adminHiddenNote")} ${t("market.unhideHint")}` : t("market.hideHint")}
        </p>
        <div className="kmx-form-actions">
          <Button
            size="sm"
            variant={hidden ? "primary" : "danger"}
            disabled={busy}
            aria-busy={busy}
            onClick={() => run(hidden ? "open" : "hidden")}
          >
            {busy ? t("market.updatingStatus") : hidden ? t("market.unhideListing") : t("market.hideListing")}
          </Button>
        </div>
        <StatusFeedback done={done} error={error} />
      </div>
    </Panel>
  );
}

/* ---------- seller + ratings ---------- */

function SellerPanel({ listing: l }: { listing: Listing }) {
  const { t, lang } = useMarketLabels();
  const ratings = useApi<FarmerRatings>(`/farmers/${encodeURIComponent(l.farmer.id)}/ratings`);
  const avg = ratings.data ? ratings.data.avg : l.farmer.rating_avg;
  const count = ratings.data ? ratings.data.count : l.farmer.rating_count;
  const rated = avg !== null && count > 0;

  return (
    <Panel title={t("market.seller")} icon={<UsersIcon size={16} style={iconStyle} />}>
      <div className="kmx-seller">
        <span className="kmx-avatar" aria-hidden="true">
          {l.farmer.first_name.slice(0, 1).toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="kmx-seller-name">{l.farmer.first_name}</p>
          <RatingStars
            avg={avg}
            count={count}
            label={rated ? t("market.ratingSummary", { avg: (avg ?? 0).toFixed(1), count }) : t("market.noRatings")}
            emptyLabel={t("market.noRatings")}
            size={12}
          />
        </div>
      </div>

      <h3 className="kmx-subhead">{t("market.recentRatings")}</h3>
      {ratings.loading && !ratings.data ? (
        <LoadingBlock lines={3} height={12} />
      ) : ratings.error ? (
        <ErrorState message={describeError(ratings.error)} onRetry={ratings.reload} />
      ) : !ratings.data || ratings.data.recent.length === 0 ? (
        <EmptyState title={t("market.noRecentRatings")} hint={t("market.ratingsHint")} />
      ) : (
        <ul className="kmx-rating-list">
          {ratings.data.recent.map((r, i) => (
            <li key={`${r.created_at}-${i}`} className="kmx-rating-item">
              <span className="kmx-avatar sm" aria-hidden="true">
                {r.buyer_first_name.slice(0, 1).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="kmx-rating-item-head">
                  <span className="kmx-rating-buyer">{r.buyer_first_name}</span>
                  <span className="kmx-stars-inline" role="img" aria-label={t("market.ratingLabel", { avg: r.stars })}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <StarIcon key={s} size={11} filled={s <= r.stars} />
                    ))}
                  </span>
                  <span className="kmx-muted-note">{timeAgo(r.created_at, lang)}</span>
                </div>
                {r.comment && <p className="kmx-rating-comment">{r.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
