"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChartIcon,
  BotIcon,
  BrandMark,
  CartIcon,
  ChevronRightIcon,
  ClockIcon,
  GlobeIcon,
  HelpIcon,
  HomeIcon,
  LandmarkIcon,
  LeafIcon,
  LogOutIcon,
  MenuIcon,
  SproutIcon,
  UsersIcon,
} from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type NavItem = { key: string; href: string; icon: (p: { size?: number }) => ReactNode };

// Order and labels follow the reference sidebar exactly.
const NAV: NavItem[] = [
  { key: "nav.overview", href: "/", icon: HomeIcon },
  { key: "nav.cropHealth", href: "/health", icon: SproutIcon },
  { key: "nav.assistant", href: "/assistant", icon: BotIcon },
  { key: "nav.prices", href: "/prices", icon: BarChartIcon },
  { key: "nav.marketplace", href: "/market", icon: CartIcon },
  { key: "nav.advice", href: "/advice", icon: LeafIcon },
  { key: "nav.schemes", href: "/schemes", icon: LandmarkIcon },
  { key: "nav.history", href: "/history", icon: ClockIcon },
  { key: "nav.help", href: "/help", icon: HelpIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/health") return pathname.startsWith("/health") || pathname.startsWith("/analyses");
  if (href === "/market") return pathname === "/market" || pathname.startsWith("/market/") || pathname === "/enquiries";
  if (href === "/schemes") return pathname.startsWith("/schemes") || pathname.startsWith("/updates");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  const clean = name.replace(/\(.*?\)/g, " ");
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  const roleLabel =
    user?.role === "farmer" ? t("common.farmer") : user?.role === "customer" ? t("common.buyer") : t("common.admin");

  return (
    <div className="km-sidebar-inner">
      <Link href="/" className="km-brand" onClick={onNavigate} aria-label={t("brand.name")}>
        <BrandMark size={50} />
        <span>
          <span className="km-brand-name">{t("brand.name")}</span>
          <span className="km-brand-tag">{t("brand.tagline")}</span>
          <span className="km-brand-tag">{t("brand.tagline2")}</span>
        </span>
      </Link>

      <nav aria-label="Main" className="km-nav">
        <ul>
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`km-nav-link${active ? " active" : ""}`}
                >
                  <Icon size={21} />
                  <span>{t(item.key)}</span>
                </Link>
              </li>
            );
          })}
          {user?.role === "admin" && (
            <li>
              <Link
                href="/admin"
                onClick={onNavigate}
                aria-current={isActive(pathname, "/admin") ? "page" : undefined}
                className={`km-nav-link${isActive(pathname, "/admin") ? " active" : ""}`}
              >
                <UsersIcon size={21} />
                <span>{t("nav.admin")}</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className="km-sidebar-foot">
        <div className="km-lang" role="group" aria-label={t("common.language")}>
          <GlobeIcon size={21} style={{ color: "#3c5560" }} />
          <span className="km-lang-pill">
            <button
              type="button"
              lang="en"
              aria-pressed={lang === "en"}
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              {t("common.english")}
            </button>
            <button
              type="button"
              lang="hi"
              aria-pressed={lang === "hi"}
              className={lang === "hi" ? "active" : ""}
              onClick={() => setLang("hi")}
            >
              {t("common.hindi")}
            </button>
          </span>
        </div>

        {user ? (
          <div className="km-profile" ref={menuRef}>
            <span className="km-avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="km-profile-name" title={user.name}>
                {user.name}
              </span>
              <span className="km-profile-role">{roleLabel}</span>
            </span>
            <button
              type="button"
              className="km-icon-btn"
              style={{ width: 30, height: 30, border: "none", background: "transparent" }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t("common.account")}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <ChevronRightIcon size={17} style={{ transform: menuOpen ? "rotate(-90deg)" : undefined }} />
            </button>
            {menuOpen && (
              <div className="km-profile-menu km-popover" role="menu">
                <p style={{ fontSize: 12.5, fontWeight: 600 }}>{user.name}</p>
                <p className="km-caption" style={{ marginTop: 2 }}>
                  {user.district}, {user.state}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="km-btn secondary sm"
                  style={{ width: "100%", marginTop: 10 }}
                  onClick={() => void logout().then(() => window.location.assign("/login"))}
                >
                  <LogOutIcon size={15} /> {t("common.signOut")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <Link href="/login" className="km-btn primary sm" onClick={onNavigate} style={{ width: "100%" }}>
              {t("common.signIn")}
            </Link>
            <Link href="/register" className="km-btn secondary sm" onClick={onNavigate} style={{ width: "100%" }}>
              {t("common.createAccount")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- mobile drawer ---------- */

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);
  const lastPath = useRef(pathname);

  // close the drawer after navigation
  if (lastPath.current !== pathname) {
    lastPath.current = pathname;
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="km-bell"
        aria-label={open ? t("header.closeMenu") : t("header.menu")}
        aria-expanded={open}
        aria-controls="km-mobile-drawer"
        onClick={() => setOpen((v) => !v)}
        style={{ width: 40, height: 40 }}
      >
        <MenuIcon size={19} />
      </button>
      {open && (
        <div className="km-drawer-backdrop" onClick={close}>
          <div
            id="km-mobile-drawer"
            className="km-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("header.menu")}
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onNavigate={close} />
          </div>
        </div>
      )}
    </>
  );
}
