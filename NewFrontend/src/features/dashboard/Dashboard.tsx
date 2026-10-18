"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BarChartIcon,
  BotIcon,
  CalendarIcon,
  CameraIcon,
  CartIcon,
  ChartIcon,
  ChevronRightIcon,
  CloudSunIcon,
  DatabaseIcon,
  DropletIcon,
  FileTextIcon,
  ImageIcon,
  InfoIcon,
  LandmarkIcon,
  LeafIcon,
  LightningIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  SproutIcon,
  UsersIcon,
} from "@/components/icons";
import { Badge, Button, ButtonLink, EmptyState, LoadingBlock, Panel } from "@/components/ui";
import { WidgetBoundary } from "@/components/WidgetBoundary";
import {
  api,
  describeError,
  type Analysis,
  type Crop,
  type Enquiry,
  type FarmUpdate,
  type Listing,
  type Prices,
  type Reminder,
  type Report,
  type Scheme,
  type User,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useI18n, type Lang } from "@/lib/i18n";
import { cropLabel, dayMonth, inr, num, shortDate, stageLabel, timeAgo, analysisStatusLabel } from "@/lib/format";
import "./dashboard.css";

/* ============================================================
   Kisan Mitra overview (reference: Kisan Mitra Smart Farming Dashboard.png)
   Every value below comes from a verified backend endpoint. Where the
   backend has no capability (weather, listing photos, notification feed),
   the card says so instead of showing invented data.
   ============================================================ */

export function Dashboard({ user }: { user: User }) {
  return (
    <div className="km-dashboard">
      <WidgetBoundary label="Key figures">
        <KpiRow />
      </WidgetBoundary>

      <div className="km-primary-row">
        <WidgetBoundary label="Crop health">
          <CropHealthPanel />
        </WidgetBoundary>
        <div className="km-right-stack">
          <WidgetBoundary label="Today on your farm">
            <FarmTodayPanel user={user} />
          </WidgetBoundary>
          <WidgetBoundary label="Mandi price snapshot">
            <MandiSnapshot user={user} />
          </WidgetBoundary>
        </div>
      </div>

      <div className="km-lower-row">
        <WidgetBoundary label="Crop observations">
          <ObservationsPanel />
        </WidgetBoundary>
        <WidgetBoundary label="Quick actions">
          <QuickActions />
        </WidgetBoundary>
        <div className="km-lower-right">
          <WidgetBoundary label="Government schemes">
            <SchemesPanel user={user} />
          </WidgetBoundary>
          <WidgetBoundary label="Marketplace">
            <MarketplacePreview />
          </WidgetBoundary>
        </div>
      </div>

      <WidgetBoundary label="System flow">
        <SystemFlow />
      </WidgetBoundary>
    </div>
  );
}

/* ---------------- KPI row ---------------- */

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function KpiRow() {
  const analyses = useApi<Analysis[]>("/me/analyses?limit=100");
  const listings = useApi<Listing[]>("/me/listings");
  const enquiries = useApi<Enquiry[]>("/me/enquiries");
  const prices = useApi<Prices>("/market/prices?commodity=Tomato&limit=1");
  const { t, lang } = useI18n();

  const checks = analyses.data?.length ?? null;
  const active = listings.data?.filter((l) => l.status === "open").length ?? null;
  const pending = enquiries.data?.filter((e) => e.status === "pending").length ?? null;
  const meta = prices.data?.meta;
  const latestCheck = analyses.data?.[0];

  const fail = (e: unknown) => <span style={{ fontSize: 15, color: "var(--km-muted)" }} title={describeError(e)}>—</span>;

  return (
    <div className="km-kpis">
      <KpiCard
        href="/history"
        bg="linear-gradient(135deg, #f4faf2, #eef7ec)"
        tile="#dcefd7"
        icon={<LeafIcon size={25} />}
        iconColor="var(--km-green-700)"
        label={t("dash.kpiChecks")}
        metric={analyses.error ? fail(analyses.error) : checks === null ? <Skel /> : num(checks, lang)}
        caption={
          checks === null ? t("dash.loading") : latestCheck ? t("dash.lastCheck", { when: timeAgo(latestCheck.created_at, lang) }) : t("dash.noChecks")
        }
      />
      <KpiCard
        href="/market/mine"
        bg="linear-gradient(135deg, #fef8ee, #fdf3e4)"
        tile="#fde7c4"
        icon={<CartIcon size={25} />}
        iconColor="#e3860c"
        label={t("dash.kpiListings")}
        metric={listings.error ? fail(listings.error) : active === null ? <Skel /> : num(active, lang)}
        caption={t("dash.onMarketplace")}
      />
      <KpiCard
        href="/enquiries"
        bg="linear-gradient(135deg, #f3f6fe, #edf2fd)"
        tile="#dde7fb"
        icon={<UsersIcon size={25} />}
        iconColor="var(--km-blue-600)"
        label={t("dash.kpiEnquiries")}
        metric={enquiries.error ? fail(enquiries.error) : pending === null ? <Skel /> : num(pending, lang)}
        caption={t("dash.fromBuyers")}
      />
      <KpiCard
        href="/prices"
        bg="linear-gradient(135deg, #f7f3fe, #f2edfd)"
        tile="#e7dcfb"
        icon={<BarChartIcon size={25} />}
        iconColor="var(--km-purple-600)"
        label={t("dash.kpiMarket")}
        metric={
          prices.loading ? (
            <Skel />
          ) : prices.error ? (
            fail(prices.error)
          ) : meta?.last_fetch_at ? (
            isToday(meta.last_fetch_at) ? t("dash.today") : dayMonth(meta.last_fetch_at, lang)
          ) : (
            <span style={{ fontSize: 18 }}>{t("common.unavailable")}</span>
          )
        }
        caption={
          meta?.source_status === "demo"
            ? t("demo.samplePrices")
            : meta?.source_status === "none"
              ? t("dash.noPriceFeed")
              : t("dash.latestPrices")
        }
      />
    </div>
  );
}

function Skel() {
  return <span className="km-skeleton" style={{ display: "inline-block", width: 46, height: 24, verticalAlign: "middle" }} />;
}

function KpiCard({
  href,
  icon,
  bg,
  tile,
  iconColor,
  label,
  metric,
  caption,
}: {
  href: string;
  icon: React.ReactNode;
  bg: string;
  tile: string;
  iconColor: string;
  label: string;
  metric: React.ReactNode;
  caption: React.ReactNode;
}) {
  return (
    <Link href={href} className="km-kpi" style={{ background: bg }}>
      <span className="km-kpi-tile" style={{ background: tile, color: iconColor }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1, paddingRight: 24 }}>
        <span className="km-kpi-label">{label}</span>
        <span className="km-kpi-metric">{metric}</span>
        <span className="km-kpi-cap">{caption}</span>
      </span>
      <ChevronRightIcon size={17} className="km-kpi-chevron" />
    </Link>
  );
}

/* ---------------- Crop health at a glance ---------------- */

// The backend never serves uploaded images back, so the photo is either the farmer's own upload kept on
// this device by the diagnose flow (sessionStorage "km:lastUpload" = {id, dataUrl}) or a labelled sample.
type LocalUpload = { id: string; dataUrl: string };

function readLocalUpload(): string {
  try {
    return sessionStorage.getItem("km:lastUpload") ?? "";
  } catch {
    return "";
  }
}

function useLocalUpload(): LocalUpload | null {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    readLocalUpload,
    () => "",
  );
  return useMemo(() => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as LocalUpload;
      return v && typeof v.id === "string" && typeof v.dataUrl === "string" && v.dataUrl.startsWith("data:image/") ? v : null;
    } catch {
      return null;
    }
  }, [raw]);
}

function CropHealthPanel() {
  const { t, lang } = useI18n();
  const latest = useApi<Analysis[]>("/me/analyses?limit=1");
  const a = latest.data?.[0] ?? null;
  const local = useLocalUpload();
  const ownPhoto = a && local && local.id === a.id ? local.dataUrl : null;

  const [report, setReport] = useState<Report | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErr, setReportErr] = useState<string | null>(null);

  const openReport = useCallback(
    async (analysis: Analysis) => {
      setReportBusy(true);
      setReportErr(null);
      try {
        setReport(await api<Report>(`/analyses/${analysis.id}/report?language=${lang}`));
      } catch {
        try {
          setReport(
            await api<Report>(`/analyses/${analysis.id}/report`, { method: "POST", body: { language: lang }, timeoutMs: 45_000 }),
          );
        } catch (e) {
          setReportErr(describeError(e));
        }
      } finally {
        setReportBusy(false);
      }
    },
    [lang],
  );

  const healthy = Boolean(a?.status === "ok" && a.prediction?.is_healthy);
  const diseased = Boolean(a?.status === "ok" && a.prediction && !a.prediction.is_healthy);
  const tone = !a ? "neutral" : healthy ? "healthy" : diseased ? "" : "neutral";
  const name = a?.prediction ? (lang === "hi" ? a.prediction.name_hi : a.prediction.name) : null;
  const title = !a
    ? t("dash.noChecksYet")
    : diseased
      ? t("dash.possible", { name: name && lang === "en" ? name.charAt(0).toLowerCase() + name.slice(1) : (name ?? "") })
      : healthy
        ? t("dash.looksHealthy")
        : analysisStatusLabel(a.status, lang);
  const confPct = a?.confidence === null || a?.confidence === undefined ? null : Math.round(a.confidence * 100);

  return (
    <Panel
      className="km-fill"
      title={t("dash.cropHealth")}
      icon={<LeafIcon size={23} style={{ color: "var(--km-green-600)" }} />}
      badge={!ownPhoto ? <Badge tone="demo">{t("dash.samplePhoto")}</Badge> : undefined}
    >
      <div className="km-health-grid">
        <figure className="km-health-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ownPhoto ?? "/assets/leaf-sample.jpg"}
            alt={ownPhoto ? t("dash.yourLeafAlt") : t("dash.sampleLeafAlt")}
          />
          <figcaption className="km-photo-caption">
            {ownPhoto
              ? t("dash.yourLeafCaption", { crop: cropLabel(a?.crop_code_claimed, lang) })
              : t("dash.sampleLeafCaption")}
          </figcaption>
        </figure>

        <div className="km-diag-col">
          <div className={`km-diagnosis ${tone}`} aria-live="polite">
            {latest.loading ? (
              <LoadingBlock lines={6} height={18} />
            ) : latest.error ? (
              <div className="km-state error" style={{ padding: 10 }}>
                <span>{describeError(latest.error)}</span>
                <Button size="sm" variant="secondary" onClick={latest.reload}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : !a ? (
              <>
                <div className="km-diagnosis-head">
                  <span className="km-diag-tile" style={{ background: "var(--km-green-100)", color: "var(--km-green-700)" }}>
                    <CameraIcon size={24} />
                  </span>
                  <h3 className="km-diagnosis-title">{t("dash.noChecksYet")}</h3>
                </div>
                <p className="km-caption">{t("dash.noChecksHint")}</p>
                <ButtonLink href="/health/diagnose" className="km-report-btn">
                  <CameraIcon size={16} /> {t("dash.scanLeaf")}
                </ButtonLink>
              </>
            ) : (
              <>
                <div className="km-diagnosis-head">
                  <span
                    className="km-diag-tile"
                    style={
                      healthy
                        ? { background: "var(--km-green-100)", color: "var(--km-green-700)" }
                        : !diseased
                          ? { background: "#eef1f2", color: "var(--km-muted)" }
                          : undefined
                    }
                  >
                    <LeafIcon size={26} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="km-diagnosis-title">{title}</h3>
                    <p className="km-conf-text">
                      {t("dash.modelConfidence")} <strong>{confPct === null ? "—" : `${confPct}%`}</strong>
                    </p>
                    <div
                      className="km-confidence-track"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={confPct ?? 0}
                      aria-label={t("dash.modelConfidence")}
                    >
                      <div className="km-confidence-fill" style={{ width: `${confPct ?? 0}%` }} />
                    </div>
                  </div>
                </div>

                <div className="km-warning">
                  <AlertIcon size={16} />
                  {t("dash.warning")}
                </div>

                <Button className="km-report-btn" disabled={reportBusy} onClick={() => void openReport(a)}>
                  {reportBusy ? t("dash.preparingReport") : t("common.viewReport")}
                  <ArrowRightIcon size={16} />
                </Button>

                <Link href="/health/diagnose" className="km-scan-link">
                  <CameraIcon size={20} /> {t("dash.scanAnother")}
                </Link>
                {reportErr && (
                  <p className="km-error" role="alert">
                    {reportErr}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="km-advisory-note">
            <InfoIcon size={19} style={{ color: "var(--km-blue-600)", flex: "none" }} />
            <span>{t("dash.advisoryNote")}</span>
          </div>
        </div>
      </div>

      {report && <ReportDialog report={report} onClose={() => setReport(null)} />}
    </Panel>
  );
}

function ReportDialog({ report, onClose }: { report: Report; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const c = report.content;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(12,30,20,.38)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="km-report-title"
        className="km-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: "100%", maxHeight: "84vh", overflowY: "auto", padding: 22 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <p className="km-caption" style={{ fontWeight: 600, color: "var(--km-green-700)" }}>
              {t("dash.reportTitle")}
            </p>
            <h3 id="km-report-title" style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>
              {c.summary}
            </h3>
          </div>
          <Button size="sm" variant="secondary" onClick={onClose} autoFocus>
            {t("common.close")}
          </Button>
        </div>
        <div className="km-warning" style={{ marginTop: 12 }}>
          <AlertIcon size={15} /> {t("dash.warning")}
        </div>
        <p style={{ marginTop: 12, fontSize: 13 }}>{c.what_this_means}</p>
        {c.recommended_actions.length > 0 && (
          <>
            <h4 style={{ marginTop: 14, fontSize: 13, fontWeight: 700 }}>{t("dash.recommendedActions")}</h4>
            <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13, display: "grid", gap: 5 }}>
              {c.recommended_actions.map((x, i) => (
                <li key={i}>{x.text}</li>
              ))}
            </ul>
          </>
        )}
        {c.safety_notes.length > 0 && (
          <p className="km-footnote" style={{ marginTop: 12 }}>
            {c.safety_notes.join(" ")}
          </p>
        )}
        {c.sources.length > 0 && (
          <p className="km-footnote" style={{ marginTop: 8 }}>
            {t("dash.sources")}:{" "}
            {c.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && " · "}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="km-linkish" style={{ fontSize: 10.5 }}>
                  {s.name}
                </a>
              </span>
            ))}
          </p>
        )}
        <p className="km-footnote" style={{ marginTop: 8 }}>
          {report.llm_status === "ok" ? t("dash.reportGenerated") : t("dash.reportTemplate")}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <ButtonLink href={`/analyses/${report.analysis_id}`} size="sm" variant="secondary">
            {t("dash.fullReport")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Today on your farm ---------------- */

function FarmTodayPanel({ user }: { user: User }) {
  const { t, lang } = useI18n();
  const crops = useApi<Crop[]>("/me/crops");
  const due = useApi<Reminder[]>("/me/reminders?due=true");
  const primary = crops.data?.[0] ?? null;
  const dueCount = due.data?.length ?? null;

  return (
    <Panel
      className="km-fill"
      title={t("dash.farmToday")}
      icon={<SproutIcon size={23} style={{ color: "var(--km-green-600)" }} />}
      badge={<Badge tone="guidance">{t("demo.guidance")}</Badge>}
    >
      <div className="km-farm-grid">
        <div className="km-weather" title={t("dash.weatherNotConnected")}>
          <CloudSunIcon size={44} style={{ color: "#9aa9ae", flex: "none" }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 17, fontWeight: 700, color: "var(--km-text-2)" }}>{t("dash.weather")}</span>
            <span className="km-caption" style={{ display: "block" }}>
              {t("dash.weatherNotConnected")}
            </span>
          </span>
        </div>
        <div className="km-farm-facts">
          <div className="km-farm-fact">
            <DropletIcon size={22} style={{ color: "#3b82f6", flex: "none" }} />
            <span>
              {due.error
                ? t("common.unavailable")
                : dueCount === null
                  ? t("dash.loading")
                  : dueCount === 0
                    ? t("dash.noDueShort")
                    : t("dash.dueShort", { count: dueCount })}
            </span>
          </div>
          <div className="km-farm-fact">
            <SproutIcon size={22} style={{ color: "var(--km-green-600)", flex: "none" }} />
            <span>
              {crops.error
                ? t("common.unavailable")
                : crops.loading
                  ? t("dash.loading")
                  : primary
                    ? `${cropLabel(primary.crop_code, lang)} · ${stageLabel(primary.stage, lang)}`
                    : t("dash.noCropsShort")}
            </span>
          </div>
        </div>
      </div>

      <Link href="/advice" className="km-advice-row km-chevron-row">
        <LightbulbGlyph />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{t("dash.irrigationAdvice")}</span>
          <span className="km-caption" style={{ display: "block", fontSize: 12.5, color: "var(--km-text-2)" }}>
            {primary
              ? t("dash.irrigationBodyCrop", { crop: cropLabel(primary.crop_code, lang), stage: stageLabel(primary.stage, lang).toLowerCase() })
              : t("dash.irrigationBody", { place: user.district })}
          </span>
        </span>
        <ChevronRightIcon size={17} style={{ color: "var(--km-text-2)", flex: "none" }} />
      </Link>
    </Panel>
  );
}

function LightbulbGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
      <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5Z" fill="#17924c" />
      <rect x="9" y="17.5" width="6" height="2" rx="1" fill="#17924c" />
      <rect x="10" y="20.5" width="4" height="1.6" rx=".8" fill="#17924c" />
      <path d="M12 6.5v4.5M10 9.5l2 1.5 2-1.5" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Mandi price snapshot ---------------- */

const SNAPSHOT: { commodity: string; glyph: string; tint: string }[] = [
  { commodity: "Tomato", glyph: "🍅", tint: "#fde3df" },
  { commodity: "Potato", glyph: "🥔", tint: "#f5ecdc" },
  { commodity: "Maize", glyph: "🌽", tint: "#fbf1cf" },
];

function MandiSnapshot({ user }: { user: User }) {
  const { t, lang } = useI18n();
  const tomato = useApi<Prices>("/market/prices?commodity=Tomato&limit=20");
  const potato = useApi<Prices>("/market/prices?commodity=Potato&limit=20");
  const maize = useApi<Prices>("/market/prices?commodity=Maize&limit=20");
  const results = [tomato, potato, maize];

  const rows = SNAPSHOT.map((s, i) => {
    const all = results[i].data?.rows ?? [];
    // Prefer the farmer's own state; otherwise the most recent row.
    const latest = all.find((r) => r.state.toLowerCase() === user.state.toLowerCase()) ?? all[0];
    const older = latest
      ? all.find((r) => r.market === latest.market && r.arrival_date < latest.arrival_date)
      : undefined;
    const change = latest && older && Number(older.modal_price) > 0
      ? (Number(latest.modal_price) - Number(older.modal_price)) / Number(older.modal_price)
      : null;
    return { ...s, latest, change, loading: results[i].loading, error: results[i].error };
  });

  const anyDemo = results.some((r) => r.data?.meta.source_status === "demo" || r.data?.rows.some((x) => x.is_demo));
  const dates = rows.map((r) => r.latest?.arrival_date).filter(Boolean) as string[];
  const newest = dates.sort().at(-1);
  const failed = results.every((r) => r.error);

  return (
    <Panel
      className="km-fill"
      title={t("dash.mandi")}
      icon={<ChartIcon size={22} style={{ color: "var(--km-green-600)" }} />}
      badge={
        anyDemo ? (
          <Badge tone="sample">{t("demo.samplePrices")}</Badge>
        ) : (
          <Link href="/prices" className="km-linkish">
            {t("common.viewAll")} <ArrowRightIcon size={12} />
          </Link>
        )
      }
    >
      {failed ? (
        <div className="km-state error" style={{ padding: 10 }}>
          <span>{t("dash.pricesUnavailable")}</span>
          <Button size="sm" variant="secondary" onClick={() => results.forEach((r) => r.reload())}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <div className="km-mandi">
          <table>
            <caption className="km-sr-only">{t("dash.mandi")}</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: "36%" }}>
                  {t("dash.crop")}
                </th>
                <th scope="col">{t("dash.priceUnit")}</th>
                <th scope="col" style={{ width: "22%" }}>
                  {t("dash.trend")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.commodity}>
                  <td>
                    <span className="km-produce-dot" style={{ background: r.tint }} aria-hidden="true">
                      {r.glyph}
                    </span>
                    <Link href={`/prices?commodity=${r.commodity}`}>{cropLabel(r.commodity.toLowerCase(), lang)}</Link>
                  </td>
                  <td>
                    {r.loading ? (
                      <span className="km-skeleton" style={{ display: "inline-block", width: 56, height: 13 }} />
                    ) : r.latest ? (
                      <span title={`${r.latest.market}, ${r.latest.state} · ${shortDate(r.latest.arrival_date, lang)} · ${r.latest.source}`}>
                        <strong style={{ fontSize: 14 }}>{inr(r.latest.modal_price, lang)}</strong>
                        <span className="km-footnote"> · {r.latest.market}</span>
                      </span>
                    ) : (
                      <span className="km-subtle">{t("common.unavailable")}</span>
                    )}
                  </td>
                  <td>
                    <Trend change={r.change} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="km-footnote" style={{ marginTop: 4, textAlign: "right" }}>
        {anyDemo
          ? t("dash.sampleFootnote", { date: newest ? shortDate(newest, lang) : "—" })
          : t("dash.liveFootnote", { date: newest ? shortDate(newest, lang) : "—" })}
      </p>
    </Panel>
  );
}

function Trend({ change, lang }: { change: number | null; lang: Lang }) {
  if (change === null || !Number.isFinite(change)) {
    const why = lang === "hi" ? "तुलना के लिए पिछला भाव नहीं" : "No earlier price to compare";
    return (
      <span className="km-trend flat" title={why}>
        —<span className="km-sr-only">{why}</span>
      </span>
    );
  }
  const up = change >= 0;
  return (
    <span className={`km-trend ${up ? "up" : "down"}`}>
      {up ? <ArrowUpRightIcon size={15} /> : <ArrowDownRightIcon size={15} />}
      {up ? "+" : "−"}
      {Math.abs(change * 100).toFixed(1)}%
    </span>
  );
}

/* ---------------- Crop observations ---------------- */

type Day = { key: string; label: string; healthy: number; issue: number };

function ObservationsPanel() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const analyses = useApi<Analysis[]>("/me/analyses?limit=100");

  const series = useMemo<Day[]>(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const days: Day[] = Array.from({ length: range }, (_, i) => {
      const d = new Date(end.getTime() - (range - 1 - i) * 86_400_000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      return { key, label: new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" }).format(d), healthy: 0, issue: 0 };
    });
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const a of analyses.data ?? []) {
      if (a.status !== "ok" || !a.prediction) continue; // only classified checks count
      const d = new Date(a.created_at);
      const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      if (!bucket) continue;
      if (a.prediction.is_healthy) bucket.healthy += 1;
      else bucket.issue += 1;
    }
    return days;
  }, [analyses.data, range, lang]);

  const totalHealthy = series.reduce((s, d) => s + d.healthy, 0);
  const totalIssue = series.reduce((s, d) => s + d.issue, 0);

  return (
    <Panel
      className="km-fill"
      title={t("dash.observations")}
      icon={<ChartIcon size={22} style={{ color: "var(--km-green-600)" }} />}
      badge={
        <>
          <Badge tone="good">{t("dash.fromYourChecks")}</Badge>
          <label>
            <span className="km-sr-only">{t("dash.range")}</span>
            <select
              className="km-select km-range"
              value={range}
              onChange={(e) => setRange(Number(e.target.value) as 7 | 30 | 90)}
            >
              <option value={7}>{t("dash.last7")}</option>
              <option value={30}>{t("dash.last30")}</option>
              <option value={90}>{t("dash.last90")}</option>
            </select>
          </label>
        </>
      }
    >
      <div className="km-legend" aria-hidden="true">
        <span>
          <i style={{ background: "#15934d" }} />
          {t("dash.healthy")}
        </span>
        <span>
          <i style={{ background: "#f5a524" }} />
          {t("dash.issue")}
        </span>
      </div>

      {analyses.loading ? (
        <div className="km-skeleton" style={{ flex: 1, minHeight: 150 }} />
      ) : analyses.error ? (
        <div className="km-state error" style={{ padding: 10 }}>
          <span>{describeError(analyses.error)}</span>
          <Button size="sm" variant="secondary" onClick={analyses.reload}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <>
          <ObservationsChart series={series} />
          <p className="km-footnote" style={{ marginTop: 2 }}>
            {totalHealthy + totalIssue === 0
              ? t("dash.noObservationsHint")
              : t("dash.observationsSummary", { healthy: totalHealthy, issue: totalIssue, days: range })}
          </p>
        </>
      )}
    </Panel>
  );
}

function ObservationsChart({ series }: { series: Day[] }) {
  const W = 404;
  const H = 182;
  const pad = { l: 26, r: 6, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const peak = Math.max(...series.map((d) => Math.max(d.healthy, d.issue)), 0);
  const max = Math.max(4, Math.ceil(peak / 4) * 4);
  const x = (i: number) => pad.l + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const line = (pick: (d: Day) => number) =>
    series.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(" ");
  const area = (pick: (d: Day) => number) =>
    `${line(pick)} L${x(series.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const step = Math.max(1, Math.round((series.length - 1) / 4));
  const labelIdx = new Set<number>();
  // Count back from today so the newest point always carries a date label.
  for (let i = series.length - 1; i >= 0; i -= step) labelIdx.add(i);

  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 200 }} role="img" aria-labelledby="km-obs-desc">
        <desc id="km-obs-desc">
          {series
            .filter((d) => d.healthy || d.issue)
            .map((d) => `${d.label}: ${d.healthy} healthy, ${d.issue} needing attention`)
            .join("; ") || "No classified checks in this period"}
        </desc>
        <defs>
          <linearGradient id="km-area-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#15934d" stopOpacity="0.2" />
            <stop offset="1" stopColor="#15934d" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="km-area-o" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f5a524" stopOpacity="0.2" />
            <stop offset="1" stopColor="#f5a524" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e7ece8" strokeWidth="0.8" />
            <text x={pad.l - 8} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#4a5d68">
              {Number.isInteger(v) ? v : ""}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={pad.t + ih} stroke="#c9d3cd" strokeWidth="0.8" />
        <path d={area((d) => d.healthy)} fill="url(#km-area-g)" />
        <path d={area((d) => d.issue)} fill="url(#km-area-o)" />
        <path d={line((d) => d.healthy)} fill="none" stroke="#1b9a52" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line((d) => d.issue)} fill="none" stroke="#f5a524" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((d, i) =>
          labelIdx.has(i) ? (
            <text key={d.key} x={x(i)} y={H - 6} fontSize="9" textAnchor={i === series.length - 1 ? "end" : i === 0 ? "start" : "middle"} fill="#4a5d68">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/* ---------------- Quick actions ---------------- */

function QuickActions() {
  const { t } = useI18n();
  const items = [
    { href: "/market/mine?new=1", icon: <CartIcon size={23} />, color: "#14864a", bg: "#eef7ed", title: t("dash.qaListing"), sub: t("dash.qaListingSub") },
    { href: "/assistant", icon: <BotIcon size={23} />, color: "#2563d9", bg: "#eef2fc", title: t("dash.qaAssistant"), sub: t("dash.qaAssistantSub") },
    { href: "/advice#reminders", icon: <CalendarIcon size={23} />, color: "#e2760b", bg: "#fdf4e7", title: t("dash.qaReminder"), sub: t("dash.qaReminderSub") },
    { href: "/help", icon: <PlayIcon size={25} />, color: "#d92d3a", bg: "#fdeef0", title: t("dash.qaDemo"), sub: t("dash.qaDemoSub") },
  ];
  return (
    <Panel className="km-fill" title={t("dash.quickActions")} icon={<LightningIcon size={22} style={{ color: "#f59e0b" }} />}>
      <nav aria-label={t("dash.quickActions")} style={{ display: "grid", gap: 8 }}>
        {items.map((it) => (
          <Link key={it.href} href={it.href} className="km-qa km-chevron-row" style={{ background: it.bg }}>
            <span style={{ color: it.color, display: "inline-flex", flex: "none", width: 26, justifyContent: "center" }}>{it.icon}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="km-qa-title">{it.title}</span>
              <span className="km-qa-sub">{it.sub}</span>
            </span>
            <ChevronRightIcon size={16} style={{ color: "var(--km-text-2)", flex: "none" }} />
          </Link>
        ))}
      </nav>
    </Panel>
  );
}

/* ---------------- Schemes & updates ---------------- */

function SchemesPanel({ user }: { user: User }) {
  const { t, lang } = useI18n();
  const schemes = useApi<Scheme[]>(`/schemes?state=${encodeURIComponent(user.state)}`);
  const updates = useApi<FarmUpdate[]>("/updates?limit=2");

  type Item = { id: string; title: string; body: string; date: string | null; dateLabel: string; href: string; kind: "update" | "scheme" };
  const items: Item[] = [
    ...(updates.data ?? []).map((u) => ({
      id: `u-${u.id}`, title: u.title, body: u.body, date: u.published_at, dateLabel: shortDate(u.published_at, lang), href: "/updates", kind: "update" as const,
    })),
    ...(schemes.data ?? []).map((s) => ({
      id: `s-${s.id}`, title: s.name, body: s.summary, date: s.last_verified_at, dateLabel: shortDate(s.last_verified_at, lang), href: `/schemes/${s.id}`, kind: "scheme" as const,
    })),
  ].slice(0, 2);

  const loading = schemes.loading || updates.loading;
  const failed = schemes.error && updates.error;

  return (
    <Panel
      className="km-fill"
      title={t("dash.schemes")}
      icon={<LandmarkIcon size={22} style={{ color: "var(--km-green-700)" }} />}
      badge={
        <Link href="/schemes" className="km-linkish" style={{ fontSize: 13 }}>
          {t("common.viewAll")} <ArrowRightIcon size={14} />
        </Link>
      }
    >
      {loading ? (
        <LoadingBlock lines={2} height={44} />
      ) : failed ? (
        <div className="km-state error" style={{ padding: 9 }}>
          <span>{describeError(schemes.error)}</span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t("dash.noSchemes")} hint={t("dash.noSchemesHint")} />
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((it) => (
            <Link key={it.id} href={it.href} className="km-scheme-row km-chevron-row">
              <span
                className="km-kpi-tile"
                style={
                  it.kind === "update"
                    ? { background: "#fde8ea", color: "#d92d3a" }
                    : { background: "#e3f3e2", color: "var(--km-green-700)" }
                }
              >
                {it.kind === "update" ? <FileTextIcon size={24} /> : <LeafIcon size={24} />}
              </span>
              <span className="km-scheme-date" title={it.kind === "scheme" ? t("dash.lastVerified") : t("dash.published")}>
                {it.dateLabel}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="km-scheme-title">{it.title}</span>
                <span className="km-scheme-body">{it.body}</span>
              </span>
              <ChevronRightIcon size={16} style={{ color: "var(--km-text-2)" }} />
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Marketplace preview ---------------- */

function MarketplacePreview() {
  const { t, lang } = useI18n();
  const listings = useApi<Listing[]>("/listings?limit=4");
  const rows = (listings.data ?? []).slice(0, 4);

  return (
    <Panel
      className="km-fill km-market-panel"
      title={
        <>
          {t("dash.marketplace")}
          <span className="km-caption" style={{ fontWeight: 400, fontSize: 12.5, marginLeft: 8 }}>
            {t("dash.connectBuyers")}
          </span>
        </>
      }
      icon={<CartIcon size={22} style={{ color: "#e3860c" }} />}
      badge={
        <Link href="/market" className="km-linkish" style={{ fontSize: 13 }}>
          {t("common.viewAll")} <ArrowRightIcon size={14} />
        </Link>
      }
    >
      {listings.loading ? (
        <LoadingBlock lines={1} height={80} />
      ) : listings.error ? (
        <div className="km-state error" style={{ padding: 9 }}>
          <span>{describeError(listings.error)}</span>
        </div>
      ) : (
        <div className="km-market-tiles">
          {rows.map((l) => (
            <Link key={l.id} href={`/market/${l.id}`} className="km-crop-tile" title={l.title}>
              <ProduceArt crop={l.crop_code} />
              <span className="km-crop-meta">
                <span className="km-crop-name">{l.title}</span>
                <span className="km-crop-price">
                  {l.price_per_unit ? (
                    <>
                      <strong>{inr(l.price_per_unit, lang)}</strong> / {l.unit}
                    </>
                  ) : (
                    t("dash.priceOnEnquiry")
                  )}
                </span>
              </span>
            </Link>
          ))}
          {rows.length < 4 && (
            <Link href="/market/mine?new=1" className="km-add-tile">
              <PlusIcon size={18} />
              {t("dash.addListing")}
            </Link>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Listings carry no photo in the backend, so the tile is drawn per crop instead of faking one. */
export function ProduceArt({ crop, height = 42 }: { crop: string; height?: number }) {
  const palette: Record<string, [string, string, string]> = {
    tomato: ["#f8b4a8", "#e2574c", "🍅"],
    potato: ["#ead6b0", "#c9a46b", "🥔"],
    maize: ["#fbe7a1", "#e9bf3f", "🌽"],
    wheat: ["#f2dfa6", "#d9b45c", "🌾"],
    mustard: ["#f6e48a", "#c9a227", "🌼"],
    onion: ["#e9b6cf", "#a8426f", "🧅"],
    rice: ["#eeeedc", "#cfcfa8", "🌾"],
    okra: ["#cfe9c4", "#6fae55", "🥬"],
  };
  const [a, b, glyph] = palette[crop.toLowerCase()] ?? ["#dfeedd", "#9cc58e", "🌱"];
  return (
    <span className="km-crop-art" style={{ height, background: `radial-gradient(120% 140% at 30% 20%, ${a}, ${b})` }}>
      <span className="km-crop-label" aria-hidden="true">
        {glyph} {glyph}
      </span>
    </span>
  );
}

/* ---------------- System flow (labels verified against the repository) ---------------- */

function SystemFlow() {
  const { t } = useI18n();
  return (
    <section className="km-panel km-flow-panel" aria-labelledby="km-flow-title">
      <div className="km-flow">
        <h2 id="km-flow-title" className="km-flow-title">
          <SettingsIcon size={17} style={{ color: "#3c5560" }} />
          {t("dash.systemFlow")}
        </h2>
        <div className="km-flow-node" style={{ background: "#e9f5e8" }}>
          <UsersIcon size={26} style={{ color: "var(--km-green-700)", flex: "none" }} />
          <span>
            <span className="t">{t("dash.flowFarmer")}</span>
            <span className="s">{t("dash.flowFarmerSub")}</span>
          </span>
        </div>
        <FlowArrow label={t("dash.flowHttps")} />
        <div className="km-flow-node" style={{ background: "#e7effc" }}>
          <LightningIcon size={26} style={{ color: "#2563d9", flex: "none" }} />
          <span>
            <span className="t">FastAPI REST API</span>
            <span className="s">{t("dash.flowApiSub")}</span>
          </span>
        </div>
        <FlowArrow />
        <div className="km-flow-group">
          <span className="km-flow-group-label">{t("dash.flowAi")}</span>
          <div className="km-flow-nodes">
            <div className="km-flow-node">
              <LeafIcon size={22} style={{ color: "var(--km-green-700)", flex: "none" }} />
              <span>
                <span className="t">{t("dash.flowModel")}</span>
                <span className="s">{t("dash.flowModelSub")}</span>
              </span>
            </div>
            <div className="km-flow-node">
              <BotIcon size={22} style={{ color: "#7c4ddb", flex: "none" }} />
              <span>
                <span className="t">{t("dash.flowLlm")}</span>
                <span className="s">{t("dash.flowLlmSub")}</span>
              </span>
            </div>
          </div>
          <span className="km-flow-note">{t("dash.flowScope")}</span>
        </div>
        <FlowArrow both />
        <div className="km-flow-group data">
          <span className="km-flow-group-label">
            {t("dash.flowDataTitle")} <span style={{ color: "#d93636" }}>({t("dash.flowDataNote")})</span>
          </span>
          <div className="km-flow-nodes">
            <div className="km-flow-node">
              <DatabaseIcon size={22} style={{ color: "#3c5560", flex: "none" }} />
              <span>
                <span className="t">PostgreSQL</span>
                <span className="s">{t("dash.flowDbSub")}</span>
              </span>
            </div>
            <div className="km-flow-node">
              <ImageIcon size={22} style={{ color: "var(--km-green-700)", flex: "none" }} />
              <span>
                <span className="t">{t("dash.flowImages")}</span>
                <span className="s">{t("dash.flowImagesSub")}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowArrow({ label, both = false }: { label?: string; both?: boolean }) {
  return (
    <span className="km-flow-arrow" aria-hidden="true">
      {label && <span>{label}</span>}
      <svg width="100%" height="10" viewBox="0 0 100 10" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M2 5h96" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ display: "flex", width: "100%", justifyContent: both ? "space-between" : "flex-end", marginTop: -9, fontSize: 10, lineHeight: 1 }}>
        {both && <span>◀</span>}
        <span>▶</span>
      </span>
    </span>
  );
}
