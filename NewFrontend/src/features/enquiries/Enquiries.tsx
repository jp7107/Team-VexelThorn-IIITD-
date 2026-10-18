"use client";

// Enquiries: one backend list (GET /me/enquiries) shaped per role — farmers see what buyers sent,
// customers see what they sent. Status changes go through PATCH /enquiries/{id}; ratings are
// POST /enquiries/{id}/rating and only exist for accepted customer enquiries.

import Link from "next/link";
import { useMemo, useState } from "react";
import { CartIcon, StarIcon } from "@/components/icons";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, PageHeading, Panel } from "@/components/ui";
import { api, describeError, type Enquiry, type User } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useI18n } from "@/lib/i18n";
import { cropLabel, num, shortDate, statusTone, timeAgo } from "@/lib/format";
import "./enquiries.css";

type Status = Enquiry["status"];
type Filter = "all" | Status;

const FILTERS: Filter[] = ["all", "pending", "accepted", "declined", "withdrawn"];
const MAX_COMMENT = 300;

export function Enquiries({ user }: { user: User }) {
  const { t, lang } = useI18n();
  const isFarmer = user.role === "farmer";
  const { data, error, loading, reload } = useApi<Enquiry[]>("/me/enquiries");

  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Status>>({});
  const [ratingOverrides, setRatingOverrides] = useState<Record<string, number>>({});

  const enquiries = useMemo(() => {
    const rows = data ?? [];
    return rows.map((e) => ({
      ...e,
      status: statusOverrides[e.id] ?? e.status,
      rating: ratingOverrides[e.id] ?? e.my_rating,
    }));
  }, [data, statusOverrides, ratingOverrides]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: enquiries.length, pending: 0, accepted: 0, declined: 0, withdrawn: 0 };
    for (const e of enquiries) out[e.status] += 1;
    return out;
  }, [enquiries]);

  const shown = filter === "all" ? enquiries : enquiries.filter((e) => e.status === filter);

  const statusLabel = (s: Status) =>
    t(
      s === "pending"
        ? "enquiries.statusPending"
        : s === "accepted"
          ? "enquiries.statusAccepted"
          : s === "declined"
            ? "enquiries.statusDeclined"
            : "enquiries.statusWithdrawn",
    );

  const filterLabel = (f: Filter) =>
    t(
      f === "all"
        ? "enquiries.filterAll"
        : f === "pending"
          ? "enquiries.filterPending"
          : f === "accepted"
            ? "enquiries.filterAccepted"
            : f === "declined"
              ? "enquiries.filterDeclined"
              : "enquiries.filterWithdrawn",
    );

  const unitLabel = (unit: Enquiry["unit"]) =>
    t(
      unit === "kg"
        ? "enquiries.unitKg"
        : unit === "quintal"
          ? "enquiries.unitQuintal"
          : unit === "tonne"
            ? "enquiries.unitTonne"
            : "enquiries.unitDozen",
    );

  async function respond(id: string, status: Extract<Status, "accepted" | "declined" | "withdrawn">) {
    setBusy(id);
    setCardError(null);
    try {
      await api<Enquiry>(`/enquiries/${id}`, { method: "PATCH", body: { status } });
      setStatusOverrides((prev) => ({ ...prev, [id]: status }));
      reload();
    } catch (e) {
      setCardError({ id, message: describeError(e) });
    } finally {
      setBusy(null);
    }
  }

  const title = isFarmer ? t("enquiries.titleFarmer") : t("enquiries.titleCustomer");
  const subtitle = isFarmer ? t("enquiries.subtitleFarmer") : t("enquiries.subtitleCustomer");

  return (
    <div className="km-enquiries">
      <PageHeading
        title={title}
        subtitle={subtitle}
        actions={
          <ButtonLink href={isFarmer ? "/market/mine" : "/market"} variant="secondary" size="sm">
            {isFarmer ? t("enquiries.headerActionFarmer") : t("enquiries.headerActionCustomer")}
          </ButtonLink>
        }
      />

      <Panel
        title={t("enquiries.listTitle")}
        icon={<CartIcon size={16} />}
        badge={<Badge tone="neutral">{num(counts.pending, lang)}</Badge>}
        bodyClassName="km-enq-body"
      >
        <div className="km-enq-toolbar">
          <div className="km-enq-filters" role="group" aria-label={t("enquiries.filterAria")}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`km-enq-chip${filter === f ? " active" : ""}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {filterLabel(f)}
                <span className="km-enq-chip-count">{num(counts[f], lang)}</span>
              </button>
            ))}
          </div>
          {!loading && !error && data && (
            <span className="km-caption km-enq-total">
              {t("enquiries.summary", { shown: num(shown.length, lang), total: num(enquiries.length, lang) })}
            </span>
          )}
        </div>

        <p className="km-sr-only" aria-live="polite">
          {busy ? t("enquiries.working") : ""}
        </p>

        {loading && !data ? (
          <div className="km-enq-list" aria-busy="true" aria-label={t("enquiries.loading")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="km-skeleton km-enq-skel" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={describeError(error)} onRetry={reload} />
        ) : enquiries.length === 0 ? (
          <EmptyState
            title={isFarmer ? t("enquiries.emptyFarmerTitle") : t("enquiries.emptyCustomerTitle")}
            hint={isFarmer ? t("enquiries.emptyFarmerHint") : t("enquiries.emptyCustomerHint")}
            action={
              <ButtonLink href={isFarmer ? "/market/mine" : "/market"} variant="primary" size="sm">
                {isFarmer ? t("enquiries.emptyFarmerAction") : t("enquiries.emptyCustomerAction")}
              </ButtonLink>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title={t("enquiries.emptyFilterTitle")}
            hint={t("enquiries.emptyFilterHint")}
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
                {t("enquiries.filterAll")}
              </Button>
            }
          />
        ) : (
          <div className="km-enq-list">
            {shown.map((e) => (
              <article key={e.id} className="km-enq-card" aria-labelledby={`enq-${e.id}-title`}>
                <div className="km-enq-card-head">
                  <div className="km-enq-card-heading">
                    <Link id={`enq-${e.id}-title`} href={`/market/${e.listing_id}`} className="km-enq-listing">
                      {e.listing_title}
                    </Link>
                    <p className="km-caption km-enq-meta">
                      <span>{cropLabel(e.crop_code, lang)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {num(e.quantity, lang)} {unitLabel(e.unit)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span title={shortDate(e.created_at, lang)}>
                        {isFarmer
                          ? t("enquiries.receivedAt", { when: timeAgo(e.created_at, lang) })
                          : t("enquiries.sentAt", { when: timeAgo(e.created_at, lang) })}
                      </span>
                    </p>
                  </div>
                  <Badge tone={statusTone(e.status)}>{statusLabel(e.status)}</Badge>
                </div>

                {e.message && <p className="km-enq-message">{e.message}</p>}

                <div className="km-enq-foot">
                  <div className="km-enq-person">
                    <span className="km-enq-avatar" aria-hidden="true">
                      {(isFarmer ? e.buyer_first_name : e.farmer_first_name).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="km-enq-person-text">
                      <span className="km-enq-person-name">
                        {isFarmer
                          ? t("enquiries.fromName", { name: e.buyer_first_name })
                          : t("enquiries.toName", { name: e.farmer_first_name })}
                      </span>
                      {isFarmer && e.buyer_type && (
                        <span className="km-caption km-enq-buyer-type">
                          {t("enquiries.roleBuyer")}
                          {" · "}
                          {e.buyer_type === "wholesale" ? t("enquiries.buyerWholesale") : t("enquiries.buyerRetail")}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="km-enq-actions">
                    {isFarmer ? (
                      e.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy === e.id}
                            onClick={() => void respond(e.id, "accepted")}
                          >
                            {busy === e.id ? t("enquiries.working") : t("enquiries.accept")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy === e.id}
                            onClick={() => void respond(e.id, "declined")}
                          >
                            {t("enquiries.decline")}
                          </Button>
                        </>
                      ) : (
                        <span className="km-caption km-enq-note">
                          {e.status === "accepted"
                            ? t("enquiries.noteAcceptedFarmer")
                            : e.status === "declined"
                              ? t("enquiries.noteDeclinedFarmer")
                              : t("enquiries.noteWithdrawnFarmer")}
                        </span>
                      )
                    ) : e.status === "pending" ? (
                      <>
                        <span className="km-caption km-enq-note">{t("enquiries.awaitingFarmer")}</span>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy === e.id}
                          onClick={() => void respond(e.id, "withdrawn")}
                        >
                          {busy === e.id ? t("enquiries.working") : t("enquiries.withdraw")}
                        </Button>
                      </>
                    ) : e.status === "accepted" ? (
                      e.farmer_phone ? (
                        <a href={`tel:${e.farmer_phone}`} className="km-btn secondary sm km-enq-tel">
                          {t("enquiries.callFarmer")} · {e.farmer_phone}
                        </a>
                      ) : (
                        <span className="km-caption km-enq-note">{t("enquiries.phoneMissing")}</span>
                      )
                    ) : (
                      <span className="km-caption km-enq-note">
                        {e.status === "declined"
                          ? t("enquiries.noteDeclinedCustomer")
                          : t("enquiries.noteWithdrawnCustomer")}
                      </span>
                    )}
                  </div>
                </div>

                {cardError?.id === e.id && (
                  <p className="km-error" role="alert">
                    {t("enquiries.actionFailed", { message: cardError.message })}
                  </p>
                )}

                {!isFarmer && (e.rating != null || e.can_rate) && (
                  <div className="km-enq-rating">
                    {e.rating != null ? (
                      <RatingSummary stars={e.rating} label={t("enquiries.youRated", { n: num(e.rating, lang) })} />
                    ) : (
                      <RatingForm
                        enquiryId={e.id}
                        onRated={(n) => {
                          setRatingOverrides((prev) => ({ ...prev, [e.id]: n }));
                          reload();
                        }}
                      />
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------- rating ---------- */

function RatingSummary({ stars, label }: { stars: number; label: string }) {
  return (
    <div className="km-enq-rating-summary">
      <span className="km-enq-star-row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} size={15} filled={n <= stars} className={n <= stars ? "on" : ""} />
        ))}
      </span>
      <span className="km-caption">{label}</span>
    </div>
  );
}

function RatingForm({ enquiryId, onRated }: { enquiryId: string; onRated: (stars: number) => void }) {
  const { t } = useI18n();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentId = `enq-${enquiryId}-comment`;

  async function submit() {
    if (stars < 1 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/enquiries/${enquiryId}/rating`, {
        method: "POST",
        body: { stars, comment: comment.trim() || undefined },
      });
      onRated(stars);
    } catch (e) {
      setError(t("enquiries.ratingFailed", { message: describeError(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="km-enq-rating-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        void submit();
      }}
      aria-busy={saving}
    >
      <span className="km-label">{t("enquiries.ratingTitle")}</span>
      <div className="km-enq-rating-row">
        <div className="km-enq-stars" role="radiogroup" aria-label={t("enquiries.ratingLabel")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`km-enq-star-pick${stars >= n ? " on" : ""}`}>
              <input
                type="radio"
                name={`rating-${enquiryId}`}
                value={n}
                checked={stars === n}
                onChange={() => setStars(n)}
                className="km-sr-only"
              />
              <StarIcon size={19} filled={stars >= n} />
              <span className="km-sr-only">{t("enquiries.rateStar", { n })}</span>
            </label>
          ))}
        </div>
        <Button type="submit" size="sm" variant="primary" disabled={stars < 1 || saving}>
          {saving ? t("enquiries.submittingRating") : t("enquiries.submitRating")}
        </Button>
      </div>
      <div className="km-enq-comment">
        <label className="km-label" htmlFor={commentId}>
          {t("enquiries.commentLabel")}
        </label>
        <textarea
          id={commentId}
          className="km-textarea km-enq-comment-textarea"
          value={comment}
          maxLength={MAX_COMMENT}
          placeholder={t("enquiries.commentPlaceholder")}
          aria-describedby={`${commentId}-count`}
          onChange={(ev) => setComment(ev.target.value)}
          rows={2}
        />
        <span id={`${commentId}-count`} className="km-hint km-enq-comment-count">
          {t("enquiries.commentCount", { n: comment.length })}
        </span>
      </div>
      {error && (
        <p className="km-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
