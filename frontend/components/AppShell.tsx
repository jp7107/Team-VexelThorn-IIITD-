"use client";

// Signed-in chrome: a glass sidebar on desktop; on phones a slim header and an app-style bottom tab bar.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  BasketIcon, ChatIcon, DropIcon, HelpIcon, HomeIcon, InboxIcon, LeafScanIcon, LogoMark, LogoutIcon,
  NewsIcon, PinIcon, PriceIcon, SchemeIcon, ShieldIcon, StoreIcon,
} from "@/components/icons";
import { LanguageSwitch } from "@/components/ui";
import { api, getMe, type User, type UserRole } from "@/lib/api";
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
    { href: "/farmer/water", key: "water", Icon: DropIcon },
    { href: "/schemes", key: "schemes", Icon: SchemeIcon },
    { href: "/updates", key: "updates", Icon: NewsIcon },
    { href: "/help", key: "help", Icon: HelpIcon },
  ],
  customer: [
    { href: "/market", key: "marketplace", Icon: BasketIcon },
    { href: "/enquiries", key: "enquiries", Icon: InboxIcon },
    { href: "/market/prices", key: "prices", Icon: PriceIcon },
    { href: "/assistant", key: "assistant", Icon: ChatIcon },
    { href: "/schemes", key: "schemes", Icon: SchemeIcon },
    { href: "/updates", key: "updates", Icon: NewsIcon },
    { href: "/help", key: "help", Icon: HelpIcon },
  ],
  admin: [
    { href: "/admin", key: "admin", Icon: ShieldIcon },
    { href: "/market", key: "marketplace", Icon: BasketIcon },
    { href: "/market/prices", key: "prices", Icon: PriceIcon },
    { href: "/schemes", key: "schemes", Icon: SchemeIcon },
    { href: "/updates", key: "updates", Icon: NewsIcon },
    { href: "/help", key: "help", Icon: HelpIcon },
  ],
};

// Five thumb-reach tabs per role on phones; everything else is one tap away on the home grid or "More".
const TABS: Record<UserRole, string[]> = {
  farmer: ["/farmer", "/farmer/diagnose", "/assistant", "/market/prices", "/farmer/listings"],
  customer: ["/market", "/enquiries", "/market/prices", "/assistant", "/help"],
  admin: ["/admin", "/market", "/market/prices", "/schemes", "/help"],
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

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

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
                      active ? "bg-white/10 font-semibold text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-lime"
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
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-haldi-soft font-extrabold text-ink">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{user.name}</span>
                <span className="block text-sm text-lime">{t(`nav.role.${user.role}`)}</span>
              </span>
              <button type="button" onClick={logout} aria-label={t("auth.logout")} title={t("auth.logout")}
                className="grid size-10 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
                <LogoutIcon className="size-5" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="flex min-h-11 items-center justify-center rounded-xl bg-brand font-extrabold text-white">
              {t("auth.login")}
            </Link>
          )}
        </div>
        {user && user.role !== "admin" && (
          <Link href="/assistant" className="glass mx-4 mb-4 flex items-center gap-3 rounded-2xl border border-white/15 p-3 hover:ring-1 hover:ring-lime/40">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime/20 text-lime"><ChatIcon className="size-6" /></span>
            <span className="min-w-0">
              <span className="block font-extrabold">{t("nav.assistant")}</span>
              <span className="block text-sm leading-snug text-muted">{t("nav.assistantPitch")}</span>
            </span>
          </Link>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/15 bg-[#0f2915]/80 px-4 py-2 backdrop-blur-xl lg:hidden">
          <Link href={user ? items[0].href : "/"} className="flex items-center gap-2">
            <LogoMark className="size-9" />
            <span className="font-display text-lg font-semibold tracking-tight text-ink">{t("app.name")}</span>
          </Link>
          <div className="rounded-full bg-white/10"><LanguageSwitch /></div>
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
                  className="flex min-h-11 items-center gap-2 rounded-full bg-lime px-5 font-extrabold text-ink-strong shadow-[0_0_24px_rgb(196_239_94/0.45)] hover:brightness-105">
                  <LeafScanIcon className="size-5" /> {t("nav.analyze")}
                </Link>
              )}
            </div>
          </div>
        )}

        <main className={`mx-auto w-full flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-12 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          {wide ? children : <div className="glass rounded-3xl border border-white/15 p-4 lg:p-8">{children}</div>}
        </main>

        {user && (
          <nav aria-label={t("nav.label")}
            className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-[#0f2915]/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgb(23_81_44/0.08)] backdrop-blur-xl lg:hidden">
            <ActiveAware render={(pathname) => <ul className="mx-auto grid max-w-md grid-cols-5">
              {tabs.map(({ href, key, Icon }) => {
                const active = isActive(pathname, href, items);
                return (
                  <li key={href}>
                    <Link href={href} aria-current={active ? "page" : undefined}
                      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold leading-tight ${
                        active ? "text-lime" : "text-muted"}`}>
                      <span className={`grid h-8 w-12 place-items-center rounded-full ${active ? "bg-brand-soft" : ""}`}>
                        <Icon className="size-6" />
                      </span>
                      <span className="max-w-full truncate px-1">{t(`nav.short.${key}`)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>} />
          </nav>
        )}
      </div>
    </div>
  );
}
