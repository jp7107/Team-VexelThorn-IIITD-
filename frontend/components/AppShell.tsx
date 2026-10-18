"use client";

// Signed-in chrome: a glass sidebar on desktop; on phones a slim header and an app-style bottom tab bar.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  BasketIcon, ChatIcon, DropIcon, HelpIcon, HomeIcon, InboxIcon, LeafScanIcon, LogoMark, LogoutIcon, MenuIcon,
  NewsIcon, PinIcon, PriceIcon, ReceiptIcon, SchemeIcon, ShieldIcon, StoreIcon, UserIcon,
} from "@/components/icons";
import { LanguageSwitch } from "@/components/ui";
import { api, getMe, type User, type UserRole } from "@/lib/api";
import { useConfig } from "@/lib/catalogue";
import { useI18n } from "@/lib/i18n";

type Item = { href: string; key: string; Icon: typeof HomeIcon };

const NAV: Record<UserRole, Item[]> = {
  farmer: [
    { href: "/farmer", key: "overview", Icon: HomeIcon },
    { href: "/farmer/diagnose", key: "cropHealth", Icon: LeafScanIcon },
    { href: "/assistant", key: "assistant", Icon: ChatIcon },
    { href: "/market/prices", key: "prices", Icon: PriceIcon },
    { href: "/farmer/listings", key: "sell", Icon: StoreIcon },
    { href: "/enquiries", key: "enquiries", Icon: InboxIcon },
    { href: "/orders", key: "orders", Icon: ReceiptIcon },
    { href: "/farmer/water", key: "water", Icon: DropIcon },
    { href: "/schemes", key: "schemes", Icon: SchemeIcon },
    { href: "/updates", key: "updates", Icon: NewsIcon },
    { href: "/profile", key: "profile", Icon: UserIcon },
    { href: "/help", key: "help", Icon: HelpIcon },
  ],
  customer: [
    { href: "/market", key: "marketplace", Icon: BasketIcon },
    { href: "/enquiries", key: "enquiries", Icon: InboxIcon },
    { href: "/orders", key: "orders", Icon: ReceiptIcon },
    { href: "/market/prices", key: "prices", Icon: PriceIcon },
    { href: "/assistant", key: "assistant", Icon: ChatIcon },
    { href: "/schemes", key: "schemes", Icon: SchemeIcon },
    { href: "/updates", key: "updates", Icon: NewsIcon },
    { href: "/profile", key: "profile", Icon: UserIcon },
    { href: "/help", key: "help", Icon: HelpIcon },
  ],
  admin: [
    { href: "/admin", key: "admin", Icon: ShieldIcon },
    { href: "/market", key: "marketplace", Icon: BasketIcon },
    { href: "/market/prices", key: "prices", Icon: PriceIcon },
    { href: "/schemes", key: "schemes", Icon: SchemeIcon },
    { href: "/updates", key: "updates", Icon: NewsIcon },
    { href: "/profile", key: "profile", Icon: UserIcon },
    { href: "/help", key: "help", Icon: HelpIcon },
  ],
};

// Four thumb-reach tabs per role on phones, plus "More" for every other page, the profile and logout.
const TABS: Record<UserRole, string[]> = {
  farmer: ["/farmer", "/farmer/diagnose", "/orders", "/assistant"],
  customer: ["/market", "/enquiries", "/orders", "/market/prices"],
  admin: ["/admin", "/market", "/market/prices", "/schemes"],
};

function isActive(pathname: string, href: string, items: Item[]) {
  // The longest matching item wins, so /market/prices doesn't also light up /market.
  const best = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return best?.href === href;
}

// The URL is request data under cacheComponents, so only this part reads it, inside <Suspense>;
// the fallback draws the same links without a highlight.
function WithPath({ render }: { render: (pathname: string) => ReactNode }) {
  return render(usePathname());
}

function ActiveAware({ render }: { render: (pathname: string) => ReactNode }) {
  return <Suspense fallback={render("")}><WithPath render={render} /></Suspense>;
}

function ChevronLeft({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
  );
}

/** On phones the page title and back arrow live in the sticky header, like a native app. */
export function AppShell({ children, wide, title, back }: {
  children: ReactNode;
  wide?: boolean;
  title?: string;
  back?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const config = useConfig();
  const [user, setUser] = useState<User | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    getMe().then(setUser, () => setUser(null));
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  const items = user ? NAV[user.role] : [];
  const tabs = user ? TABS[user.role].map((h) => items.find((i) => i.href === h)!) : [];
  const initials = user?.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-full flex-1">
      <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/15 lg:flex">
        <Link href={user ? items[0].href : "/"} className="flex items-center gap-3 px-5 pb-4 pt-5">
          <LogoMark className="size-11" />
          <span>
            <span className="block font-display text-xl font-semibold leading-tight tracking-tight text-ink">{t("app.name")}</span>
            <span className="block text-sm text-muted">{t("app.motto")}</span>
          </span>
        </Link>
        <nav aria-label={t("nav.label")} className="flex-1 overflow-y-auto px-3 [scrollbar-width:thin]">
          <ActiveAware render={(pathname) => <ul className="flex flex-col gap-1">
            {items.map(({ href, key, Icon }) => {
              const active = isActive(pathname, href, items);
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined}
                    className={`relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.95rem] ${
                      active ? "bg-white/15 font-semibold text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-lime"
                        : "text-muted hover:bg-white/5 hover:text-text"}`}>
                    <Icon className="size-5 shrink-0" />
                    {t(`nav.${key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>} />
        </nav>
        <div className="flex flex-col gap-3 px-4 pb-2 pt-3">
          <div className="self-start rounded-full bg-white/10"><LanguageSwitch /></div>
          {user ? (
            <div className="flex items-center gap-3 rounded-xl bg-white/10 p-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/90 font-bold text-ink-strong">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{user.name}</span>
                <span className="block text-sm text-muted">{t(`nav.role.${user.role}`)}</span>
              </span>
              <button type="button" onClick={logout} aria-label={t("auth.logout")} title={t("auth.logout")}
                className="grid size-10 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
                <LogoutIcon className="size-5" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="flex min-h-11 items-center justify-center rounded-xl bg-lime font-bold text-ink-strong">
              {t("landing.login")}
            </Link>
          )}
        </div>
        {user && user.role !== "admin" && (
          <Link href="/assistant" className="glass mx-4 mb-4 flex items-center gap-3 rounded-2xl border border-white/15 p-3 hover:ring-1 hover:ring-lime/40">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/90 text-ink-strong"><ChatIcon className="size-5" /></span>
            <span className="min-w-0">
              <span className="block font-bold">{t("nav.assistant")}</span>
              <span className="block text-sm leading-snug text-muted">{t("nav.assistantPitch")}</span>
            </span>
          </Link>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-white/10 bg-[#0e3328]/70 px-3 py-2 backdrop-blur-2xl lg:hidden">
          {back ? (
            <Link href={back} aria-label={t("common.back")} title={t("common.back")}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white active:bg-white/20">
              <ChevronLeft className="size-5" />
            </Link>
          ) : (
            <Link href={user ? items[0].href : "/"} aria-label={t("app.name")} className="shrink-0">
              <LogoMark className="size-9" />
            </Link>
          )}
          <span className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight text-ink">
            {title ?? t("app.name")}
          </span>
          <div className="shrink-0 rounded-full bg-white/10"><LanguageSwitch compact /></div>
        </header>

        {user && (
          <div className="hidden items-center justify-between gap-4 px-8 pt-6 lg:flex">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight text-ink">{t("home.greeting", { name: user.name })}</p>
              <p className="text-muted">{t(`nav.tagline.${user.role}`)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="glass flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 font-semibold">
                <PinIcon className="size-5 text-lime" /> {user.district}, {user.state}
              </span>
              {user.role === "farmer" && (
                <Link href="/farmer/diagnose"
                  className="flex min-h-11 items-center gap-2 rounded-full bg-lime px-5 font-bold text-ink-strong shadow-[0_0_24px_rgb(196_239_94/0.45)] hover:brightness-105">
                  <LeafScanIcon className="size-5" /> {t("nav.analyze")}
                </Link>
              )}
            </div>
          </div>
        )}

        {config?.announcement && (
          <p role="status" className="mx-4 mt-3 rounded-xl border border-haldi/40 bg-haldi-soft px-4 py-2 text-sm font-semibold lg:mx-8">
            {config.announcement}
          </p>
        )}

        <main className={`mx-auto w-full flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-5 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          {wide ? children : <div className="lg:glass lg:rounded-3xl lg:border lg:border-white/15 lg:p-8">{children}</div>}
        </main>

        {user && (
          <nav aria-label={t("nav.label")}
            className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0e3328]/80 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgb(0_0_0/0.15)] backdrop-blur-2xl lg:hidden">
            <ActiveAware render={(pathname) => <ul className="mx-auto grid max-w-md grid-cols-5">
              {tabs.map(({ href, key, Icon }) => {
                const active = isActive(pathname, href, items);
                return (
                  <li key={href}>
                    <Link href={href} aria-current={active ? "page" : undefined}
                      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold leading-tight ${
                        active ? "text-white" : "text-muted"}`}>
                      <span className={`grid h-7 w-11 place-items-center rounded-full ${active ? "bg-white text-ink-strong" : ""}`}>
                        <Icon className="size-5" />
                      </span>
                      <span className="max-w-full truncate px-1">{t(`nav.short.${key}`)}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={() => setMore(true)} aria-expanded={more}
                  className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold leading-tight text-muted">
                  <span className="grid h-7 w-11 place-items-center rounded-full"><MenuIcon className="size-5" /></span>
                  <span>{t("nav.short.more")}</span>
                </button>
              </li>
            </ul>} />
          </nav>
        )}

        {user && more && (
          // Bottom sheet with every page, the profile and logout (phones only).
          <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.short.more")}>
            <button type="button" aria-label={t("common.close")} onClick={() => setMore(false)} className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-white/15 bg-[#0e3328]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/30" />
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/90 font-bold text-ink-strong">{initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{user.name}</span>
                  <span className="block text-sm text-muted">{t(`nav.role.${user.role}`)}</span>
                </span>
              </div>
              <ul className="grid grid-cols-3 gap-2">
                {items.map(({ href, key, Icon }) => (
                  <li key={href}>
                    <Link href={href} onClick={() => setMore(false)}
                      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/10 p-2 text-center text-xs font-semibold leading-tight">
                      <span className="grid size-9 place-items-center rounded-xl bg-white/90 text-ink-strong"><Icon className="size-5" /></span>
                      {t(`nav.${key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={logout}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 font-semibold text-danger">
                <LogoutIcon className="size-5" /> {t("auth.logout")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
