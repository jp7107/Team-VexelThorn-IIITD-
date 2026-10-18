"use client";

// Farmer's own listings: GET /me/listings (every status, with pending enquiry counts), create and edit
// through ListingForm. `?new=1` opens the create form on load; `?edit={id}` opens that listing's editor.
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import { CartIcon, CheckIcon, PlusIcon, SproutIcon } from "@/components/icons";
import { describeError, type Listing, type User } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cropLabel, inr, num, shortDate, statusTone } from "@/lib/format";
import { ProduceArt, produceArtLabel } from "@/features/market/MarketArt";
import { ListingForm } from "@/features/market/ListingForm";
import { useMarketLabels } from "@/features/market/i18n";
import "./market.css";

type Tab = "all" | "open" | "closed" | "hidden";

export function MyListings({ user }: { user: User }) {
  const { t } = useMarketLabels();
  const search = useSearchParams();
  const router = useRouter();
  const mine = useApi<Listing[]>("/me/listings");

  // null = no form, "new" = create form, anything else = id of the listing being edited.
  const [formFor, setFormFor] = useState<string | null>(() =>
    search.get("new") === "1" ? "new" : search.get("edit"),
  );
  const [tab, setTab] = useState<Tab>("all");
  const [flash, setFlash] = useState<string | null>(null);

  const rows = mine.data ?? [];
  const editing = formFor && formFor !== "new" ? (rows.find((l) => l.id === formFor) ?? null) : null;
  const showForm = formFor === "new" || editing !== null;

  const counts: Record<Tab, number> = {
    all: rows.length,
    open: rows.filter((l) => l.status === "open").length,
    closed: rows.filter((l) => l.status === "closed").length,
    hidden: rows.filter((l) => l.status === "hidden").length,
  };
  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: t("market.tabAll") },
    { key: "open", label: t("market.tabOpen") },
    { key: "closed", label: t("market.tabClosed") },
    ...(counts.hidden > 0 ? [{ key: "hidden" as const, label: t("market.hidden") }] : []),
  ];
  const visible = tab === "all" ? rows : rows.filter((l) => l.status === tab);

  function clearQuery() {
    if (search.get("new") || search.get("edit")) router.replace("/market/mine", { scroll: false });
  }

  function openForm(target: string) {
    setFlash(null);
    setFormFor(target);
  }

  function closeForm() {
    setFormFor(null);
    clearQuery();
  }

  function onSaved(_saved: Listing, kind: "created" | "updated") {
    setFormFor(null);
    clearQuery();
    setFlash(kind === "created" ? t("market.created") : t("market.updated"));
    mine.reload();
  }

  return (
    <div className="kmx-market">
      <PageHeading
        title={t("market.mineTitle")}
        subtitle={t("market.mineSubtitle")}
        actions={
          <>
            <ButtonLink href="/market" variant="secondary" size="sm">
              <CartIcon size={14} /> {t("market.title")}
            </ButtonLink>
            <ButtonLink href="/enquiries" variant="secondary" size="sm">
              {t("market.manageEnquiries")}
            </ButtonLink>
            {!showForm && (
              <Button size="sm" onClick={() => openForm("new")}>
                <PlusIcon size={14} /> {t("market.newListing")}
              </Button>
            )}
          </>
        }
      />

      <div aria-live="polite" aria-atomic="true">
        {flash && (
          <p className="kmx-success">
            <CheckIcon size={14} />
            <span>{flash}</span>
            <Button variant="ghost" size="sm" className="kmx-success-dismiss" onClick={() => setFlash(null)}>
              {t("market.dismiss")}
            </Button>
          </p>
        )}
      </div>

      {showForm && (
        <ListingForm
          key={formFor ?? "new"}
          user={user}
          listing={editing ?? undefined}
          onSaved={onSaved}
          onCancel={closeForm}
        />
      )}

      <Panel
        title={t("market.yourProduce")}
        icon={<SproutIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        badge={mine.data ? <Badge tone="neutral">{t("market.listingsCount", { count: rows.length })}</Badge> : undefined}
      >
        {mine.loading && !mine.data ? (
          <div role="status" aria-busy="true">
            <span className="km-sr-only">{t("market.loadingMine")}</span>
            <LoadingBlock lines={4} height={52} />
          </div>
        ) : mine.error && !mine.data ? (
          <ErrorState message={describeError(mine.error)} onRetry={mine.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("market.noListings")}
            hint={t("market.noListingsHint")}
            action={
              showForm ? undefined : (
                <Button size="sm" onClick={() => openForm("new")}>
                  <PlusIcon size={14} /> {t("market.createFirstListing")}
                </Button>
              )
            }
          />
        ) : (
          <div className="kmx-mine">
            {mine.error && <ErrorState message={describeError(mine.error)} onRetry={mine.reload} />}
            <div className="kmx-tabs" role="group" aria-label={t("market.statusFilter")}>
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="kmx-tab"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label} <span className="kmx-tab-count">{counts[key]}</span>
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <EmptyState
                title={t("market.noListingsInTab")}
                action={
                  <Button size="sm" variant="secondary" onClick={() => setTab("all")}>
                    {t("market.showAll")}
                  </Button>
                }
              />
            ) : (
              <ul className="kmx-mine-list" aria-busy={mine.loading}>
                {visible.map((l) => (
                  <MineRow key={l.id} listing={l} editing={formFor === l.id} onEdit={() => openForm(l.id)} />
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
      <p className="km-footnote">{t("market.artNote")}</p>
    </div>
  );
}

function MineRow({ listing: l, editing, onEdit }: { listing: Listing; editing: boolean; onEdit: () => void }) {
  const { t, lang, unitLabel, statusLabel } = useMarketLabels();
  const unit = unitLabel(l.unit);
  const pending = l.pending_enquiries ?? 0;
  const price = l.price_per_unit !== null ? `${inr(l.price_per_unit, lang)} / ${unit}` : t("market.priceOnEnquiry");

  return (
    <li className="kmx-mine-row">
      <span className="kmx-mine-art" role="img" aria-label={produceArtLabel(l.crop_code, lang)}>
        <ProduceArt crop={l.crop_code} height={56} glyphSize={26} />
      </span>
      <div style={{ minWidth: 0 }}>
        <Link href={`/market/${l.id}`} className="kmx-mine-title">
          {l.title}
        </Link>
        <div className="kmx-mine-meta">
          {l.status === "hidden" ? (
            <Badge tone="bad">{t("market.hiddenByModerator")}</Badge>
          ) : (
            <Badge tone={statusTone(l.status)}>{statusLabel(l.status)}</Badge>
          )}
          {pending > 0 && (
            <Link href="/enquiries" className="km-badge info">
              {t("market.pendingBadge", { count: pending })}
            </Link>
          )}
          <span>{cropLabel(l.crop_code, lang)}</span>
          <span className="kmx-dot" aria-hidden="true" />
          <span>{`${num(l.quantity, lang)} ${unit}`}</span>
          <span className="kmx-dot" aria-hidden="true" />
          <span>{price}</span>
          <span className="kmx-dot" aria-hidden="true" />
          <span>{t("market.location", { district: l.district, state: l.state })}</span>
          <span className="kmx-dot" aria-hidden="true" />
          <span>{t("market.listedOnDate", { date: shortDate(l.created_at, lang) })}</span>
        </div>
      </div>
      <div className="kmx-mine-actions">
        <ButtonLink
          href={`/market/${l.id}`}
          size="sm"
          variant="ghost"
          aria-label={t("market.viewNamed", { title: l.title })}
        >
          {t("market.view")}
        </ButtonLink>
        <Button
          size="sm"
          variant="secondary"
          onClick={onEdit}
          disabled={editing}
          aria-label={t("market.editNamed", { title: l.title })}
        >
          {t("market.edit")}
        </Button>
      </div>
    </li>
  );
}
