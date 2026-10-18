"use client";

// Farmer home. Phones: greeting, a big "check my crop" action and an app-style feature grid.
// Desktop: stat cards and dashboard panels, all from the farmer's own data.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ChatIcon, CROP_ICONS, DropIcon, HelpIcon, InboxIcon, LeafScanIcon, NewsIcon, PriceIcon, SchemeIcon, SproutIcon,
  StoreIcon,
} from "@/components/icons";
import { FormError, Loading, Screen } from "@/components/ui";
import {
  api, type Analysis, type Crop, type Enquiry, type FarmUpdate, type Listing, type PriceRow, type Prices,
  type Reminder, type Scheme, type User, type WaterEstimate,
} from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

// Our crop codes → the commodity names AGMARKNET uses (same mapping as the prices page).
const COMMODITY: Record<string, string> = { tomato: "Tomato", potato: "Potato", maize: "Maize" };

const FEATURES = [
  { href: "/farmer/diagnose", key: "checkCrop", Icon: LeafScanIcon, tint: "bg-white/15 text-white" },
  { href: "/assistant", key: "askAssistant", Icon: ChatIcon, tint: "bg-white/15 text-white" },
  { href: "/market/prices", key: "prices", Icon: PriceIcon, tint: "bg-white/15 text-white" },
  { href: "/farmer/listings", key: "sell", Icon: StoreIcon, tint: "bg-white/15 text-white" },
  { href: "/enquiries", key: "enquiries", Icon: InboxIcon, tint: "bg-white/15 text-white" },
  { href: "/farmer/water", key: "water", Icon: DropIcon, tint: "bg-white/15 text-white" },
  { href: "/schemes", key: "schemes", Icon: SchemeIcon, tint: "bg-white/15 text-white" },
  { href: "/updates", key: "updates", Icon: NewsIcon, tint: "bg-white/15 text-white" },
  { href: "/help", key: "help", Icon: HelpIcon, tint: "bg-white/15 text-white" },
];

type Dashboard = {
  crops: Crop[];
  reminders: Reminder[];
  analyses: Analysis[];
  listings: Listing[];
  enquiries: Enquiry[];
  prices: { code: string; row: PriceRow | null }[];
  water: { crop: Crop; estimate: WaterEstimate } | null;
  schemes: Scheme[];
  updates: FarmUpdate[];
};

// Only crops, reminders and checks are essential; every other panel just hides if its call fails.
async function loadDashboard(user: User): Promise<Dashboard> {
  const [crops, reminders, analyses] = await Promise.all([
    api<Crop[]>("/me/crops"), api<Reminder[]>("/me/reminders?due=true"), api<Analysis[]>("/me/analyses?limit=20"),
  ]);
  const optional = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const firstCrop = crops.find((c) => c.crop_code in COMMODITY);
  const [listings, enquiries, prices, water, schemes, updates] = await Promise.all([
    optional(api<Listing[]>("/me/listings"), []),
    optional(api<Enquiry[]>("/me/enquiries"), []),
    Promise.all(Object.entries(COMMODITY).map(([code, name]) =>
      optional(api<Prices>(`/market/prices?${new URLSearchParams({ commodity: name, state: user.state })}`), null)
        .then((p) => ({ code, row: p?.rows[0] ?? null })))),
    firstCrop
      ? optional(api<WaterEstimate>(`/irrigation/estimate?farm_crop_id=${firstCrop.id}`)
        .then((estimate) => ({ crop: firstCrop, estimate })), null)
      : null,
    optional(api<Scheme[]>("/schemes"), []),
    optional(api<FarmUpdate[]>("/updates"), []),
  ]);
  return { crops, reminders, analyses, listings, enquiries, prices, water, schemes, updates };
}

function Panel({ title, action, children, className = "" }: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-3xl border border-white/15 p-4 lg:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ href, Icon, tint, label, value, hint }: {
  href: string;
  Icon: typeof SproutIcon;
  tint: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Link href={href} className="glass flex items-center gap-4 rounded-2xl border border-white/15 p-4 hover:border-brand">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tint}`}><Icon className="size-6" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-muted">{label}</span>
        <span className="font-num block text-3xl font-semibold leading-tight text-ink">{value}</span>
        <span className="block truncate text-sm text-muted">{hint}</span>
      </span>
    </Link>
  );
}

export default function FarmerHome() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useSession(["farmer"]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    loadDashboard(user).then(setData, (e) => setError(t(errorKey(e))));
  }, [user, t]);

  async function markDone(id: string) {
    try {
      await api(`/me/reminders/${id}`, { method: "PATCH", body: { done: true } });
      setData((d) => d && { ...d, reminders: d.reminders.filter((r) => r.id !== id) });
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  if (!user) return <Screen><Loading /></Screen>;
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const cropName = (code: string) => (code in CROP_ICONS ? t(`crops.${code}`) : code);
  const last = data?.analyses[0];
  const lastTitle = last && (last.status === "ok" && last.prediction
    ? (lang === "hi" ? last.prediction.name_hi : last.prediction.name)
    : t(`home.checkStatus.${last.status}`));
  const viewAll = (href: string) => (
    <Link href={href} className="text-sm font-semibold text-lime underline">{t("home.viewAll")}</Link>
  );

  return (
    <Screen wide>
      <FormError message={error} />

      {/* Phone home: greeting, one big action, then the feature grid. */}
      <section className="mb-6 lg:hidden">
        <div className="glass mb-5 rounded-3xl border border-white/15 p-5">
          <h1 className="text-xl font-semibold leading-tight text-ink">{t("home.greeting", { name: user.name })}</h1>
          <p className="mb-4 text-sm text-muted">{t("nav.tagline.farmer")}</p>
          <Link href="/farmer/diagnose"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-lime font-bold text-ink-strong shadow-[0_0_24px_rgb(196_239_94/0.4)]">
            <LeafScanIcon className="size-5" /> {t("nav.analyze")}
          </Link>
        </div>
        <h2 className="mb-3 text-base font-semibold text-ink">{t("home.features")}</h2>
        <ul className="grid grid-cols-3 gap-3">
          {FEATURES.map(({ href, key, Icon, tint }) => (
            <li key={href}>
              <Link href={href}
                className="glass flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 p-2 text-center active:scale-95">
                <span className={`grid size-10 place-items-center rounded-xl ${tint}`}><Icon className="size-6" /></span>
                <span className="text-[0.8rem] font-semibold leading-tight">{t(`home.${key}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {!data ? (
        error ? null : <Loading />
      ) : (
        <>
          <div className="mb-5 hidden grid-cols-4 gap-4 lg:grid">
            <Stat href={last ? `/farmer/analyses/${last.id}` : "/farmer/diagnose"} Icon={LeafScanIcon}
              tint="bg-white/15 text-white" label={t("home.statChecks")} value={data.analyses.length}
              hint={last ? t("home.lastCheck", { date: dateFmt.format(new Date(last.created_at)) }) : t("home.noCheckShort")} />
            <Stat href="/farmer/listings" Icon={StoreIcon} tint="bg-white/15 text-white" label={t("home.statListings")}
              value={data.listings.filter((l) => l.status === "open").length} hint={t("home.statListingsHint")} />
            <Stat href="/enquiries" Icon={InboxIcon} tint="bg-white/15 text-white" label={t("home.statEnquiries")}
              value={data.enquiries.filter((e) => e.status === "pending").length} hint={t("home.statEnquiriesHint")} />
            <Stat href="#reminders" Icon={SproutIcon} tint="bg-white/15 text-white" label={t("home.statReminders")}
              value={data.reminders.length} hint={t("home.statRemindersHint")} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title={t("home.glance")} className="lg:col-span-2">
              {last ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap">
                  <span className={`grid size-14 shrink-0 place-items-center rounded-2xl sm:size-20 ${
                    last.status === "ok" && last.prediction?.is_healthy ? "bg-field-soft text-field"
                      : last.status === "ok" ? "bg-danger-soft text-danger" : "bg-haldi-soft text-ink"}`}>
                    <LeafScanIcon className="size-7 sm:size-10" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted">
                      {cropName(last.crop_code_claimed)}, {dateFmt.format(new Date(last.created_at))}
                    </p>
                    <p className="font-display text-xl font-semibold leading-tight sm:text-2xl">{lastTitle}</p>
                    {last.status === "ok" && last.confidence !== null && (
                      // A score, never certainty: capped at 99% like the assistant (plan §10).
                      <p className="text-sm text-muted">{t("result.confidence", { pct: Math.min(99, Math.round(last.confidence * 100)) })}</p>
                    )}
                    <p className="mt-1 hidden text-sm text-muted sm:block">{t("home.aiNote")}</p>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-44 sm:flex-col">
                    <Link href={`/farmer/analyses/${last.id}`}
                      className="flex min-h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-bold text-ink-strong">
                      {t("home.viewResult")}
                    </Link>
                    <Link href="/farmer/diagnose"
                      className="flex min-h-10 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-3 text-sm font-bold text-ink">
                      {t("home.scanAnother")}
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-muted">{t("home.noCheckYet")}</p>
              )}
            </Panel>

            <Panel title={t("home.todayFarm")}>
              <div id="reminders" className="flex flex-col gap-3">
                {data.water?.estimate.totals && (
                  <Link href="/farmer/water" className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 hover:bg-white/15">
                    <DropIcon className="size-8 shrink-0 text-white" />
                    <span>
                      <span className="block text-sm text-muted">{t("home.waterWeek", { crop: cropName(data.water.crop.crop_code) })}</span>
                      <span className="block font-bold">
                        {t("home.waterNet", { mm: data.water.estimate.totals.net_mm,
                          litres: num.format(data.water.estimate.totals.litres_for_field) })}
                      </span>
                    </span>
                  </Link>
                )}
                {data.reminders.length === 0 ? (
                  <p className="text-muted">{t("home.noReminders")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.reminders.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-haldi-soft px-3 py-2">
                        <span className="font-semibold">{r.title}</span>
                        <button type="button" onClick={() => markDone(r.id)}
                          className="min-h-11 shrink-0 rounded-lg border border-white/30 px-3 font-bold text-ink">
                          {t("home.markDone")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>

            <Panel title={t("home.priceSnapshot")} action={viewAll("/market/prices")} className="lg:col-span-2">
              <table className="w-full text-left">
                <thead className="text-sm text-muted">
                  <tr>
                    <th className="pb-2 font-semibold">{t("home.cropCol")}</th>
                    <th className="pb-2 font-semibold">{t("home.priceCol")}</th>
                    <th className="hidden pb-2 font-semibold sm:table-cell">{t("home.marketCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prices.map(({ code, row }) => {
                    const Icon = CROP_ICONS[code] ?? SproutIcon;
                    return (
                      <tr key={code} className="border-t border-line">
                        <td className="py-2">
                          <span className="flex items-center gap-2 font-semibold">
                            <Icon className="size-6 text-field" /> {cropName(code)}
                          </span>
                        </td>
                        <td className="py-2 font-bold">
                          {row ? `₹${num.format(Number(row.modal_price))}` : t("home.noPrice")}
                          {row?.is_demo && (
                            <span className="ml-2 rounded-full bg-haldi px-2 text-sm font-bold text-ink-strong">{t("prices.demoBadge")}</span>
                          )}
                        </td>
                        <td className="hidden py-2 text-muted sm:table-cell">{row ? `${row.market}, ${row.district}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>

            <Panel title={t("home.quickActions")} className="hidden lg:block">
              <ul className="flex flex-col gap-2">
                {[["/farmer/listings", "qaList", StoreIcon], ["/assistant", "qaAsk", ChatIcon],
                  ["/onboarding", "qaCrop", SproutIcon], ["/help", "qaHelp", HelpIcon]].map(([href, key, Icon]) => {
                  const I = Icon as typeof SproutIcon;
                  return (
                    <li key={href as string}>
                      <Link href={href as string} className="flex min-h-11 items-center gap-3 rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/15">
                        <I className="size-5 text-lime" /> {t(`home.${key}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel title={t("home.myCrops")} action={
              <Link href="/onboarding" className="text-sm font-semibold text-lime underline">{t("home.addCrop")}</Link>
            } className="lg:col-span-2">
              {data.crops.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.crops.map((c) => {
                    const Icon = CROP_ICONS[c.crop_code] ?? SproutIcon;
                    return (
                      <li key={c.id}>
                        <Link href={`/farmer/crops/${c.id}`}
                          className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 hover:bg-white/15">
                          <Icon className="size-10 shrink-0 text-field" />
                          <span>
                            <span className="block text-base font-bold">{cropName(c.crop_code)}</span>
                            <span className="block text-sm text-muted">
                              {t(`stages.${c.stage}`)}, {t("home.sownOn", { date: dateFmt.format(new Date(c.sowing_date)) })},{" "}
                              {t("home.acres", { area: Number(c.area_acres) })}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-base text-muted">{t("home.noCrops")}</p>
              )}
            </Panel>

            <Panel title={t("home.schemesUpdates")} action={viewAll("/schemes")}>
              <ul className="flex flex-col gap-2">
                {data.schemes.slice(0, 2).map((s) => (
                  <li key={s.id}>
                    <Link href={`/schemes/${s.id}`} className="flex items-start gap-3 rounded-xl bg-white/10 p-3 hover:bg-white/15">
                      <SchemeIcon className="mt-0.5 size-5 shrink-0 text-lime" />
                      <span className="font-semibold leading-snug">{s.name}</span>
                    </Link>
                  </li>
                ))}
                {data.updates.slice(0, 2).map((u) => (
                  <li key={u.id}>
                    <Link href="/updates" className="flex items-start gap-3 rounded-xl bg-white/10 p-3 hover:bg-white/15">
                      <NewsIcon className="mt-0.5 size-5 shrink-0 text-white" />
                      <span className="font-semibold leading-snug">{u.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <button type="button" onClick={logout} className="mt-8 min-h-12 text-base font-semibold text-ink underline lg:hidden">
        {t("auth.logout")}
      </button>
    </Screen>
  );
}
