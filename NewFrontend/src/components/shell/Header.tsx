"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BellIcon, CameraIcon, ChevronDownIcon, MapPinIcon } from "@/components/icons";
import { HeaderLandscape } from "@/components/shell/Scenery";
import { MobileNav } from "@/components/shell/Sidebar";
import { api, describeError, type Reminder, type User } from "@/lib/api";
import { STATES } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";

/** "Demo Farmer (Ramesh)" -> "Ramesh"; "Sunita Devi" -> "Sunita". */
export function greetingName(name: string | undefined): string {
  if (!name) return "";
  const paren = name.match(/\(([^)]+)\)/);
  if (paren) return paren[1].split(/\s+/)[0];
  return name.split(/\s+/)[0];
}

export function Header() {
  const { t } = useI18n();
  const { user } = useSession();
  const first = greetingName(user?.name);

  return (
    <header className="km-header">
      <HeaderLandscape />
      <div className="km-header-inner">
        <div className="km-header-left">
          <span className="km-mobile-only">
            <MobileNav />
          </span>
          <div style={{ minWidth: 0 }}>
            <p className="km-greeting" role="heading" aria-level={1}>
              {first ? t("header.greeting", { name: first }) : t("header.greetingGuest")}
              <span aria-hidden="true" style={{ marginLeft: 8 }}>
                👋
              </span>
            </p>
            <p className="km-subtitle">{t("header.subtitle")}</p>
          </div>
        </div>

        <div className="km-header-actions">
          <LocationControl user={user} />
          <NotificationBell user={user} />
          <Link href="/health/diagnose" className="km-btn primary km-cta">
            <CameraIcon size={19} />
            <span>{t("header.analyze")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Location = the profile's state/district (PATCH /me). Market and scheme filters read it. */
function LocationControl({ user }: { user: User | null }) {
  const { t, lang } = useI18n();
  const { refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function toggle() {
    if (!open && user) {
      setState(user.state);
      setDistrict(user.district);
      setErr(null);
    }
    setOpen((v) => !v);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!district.trim()) {
      setErr(t("header.districtRequired"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api<User>("/me", { method: "PATCH", body: { state, district: district.trim() } });
      await refresh();
      setOpen(false);
    } catch (e2) {
      setErr(describeError(e2));
    } finally {
      setBusy(false);
    }
  }

  const label = user ? `${user.district}, ${user.state}` : t("header.noLocation");

  return (
    <div style={{ position: "relative" }} ref={box}>
      <button
        type="button"
        className="km-location"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t("header.location")}: ${label}`}
        onClick={toggle}
        disabled={!user}
      >
        <MapPinIcon size={19} style={{ color: "var(--km-green-700)", flex: "none" }} />
        <span>{label}</span>
        <ChevronDownIcon size={16} style={{ color: "var(--km-muted)", flex: "none" }} />
      </button>
      {open && user && (
        <form
          role="dialog"
          aria-label={t("header.location")}
          className="km-popover"
          style={{ right: 0, top: "calc(100% + 8px)", width: 286, display: "grid", gap: 10 }}
          onSubmit={save}
        >
          <p style={{ fontWeight: 700, fontSize: 13 }}>{t("header.farmLocation")}</p>
          <label className="km-field">
            <span className="km-label">{t("header.state")}</span>
            <select className="km-select" value={state} onChange={(e) => setState(e.target.value)}>
              {!STATES.some((s) => s.value === state) && state && <option value={state}>{state}</option>}
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {lang === "hi" ? s.hi : s.value}
                </option>
              ))}
            </select>
          </label>
          <label className="km-field">
            <span className="km-label">{t("header.district")}</span>
            <input
              className="km-input"
              value={district}
              maxLength={60}
              onChange={(e) => setDistrict(e.target.value)}
              aria-invalid={Boolean(err)}
            />
          </label>
          <p className="km-hint">{t("header.locationHint")}</p>
          {err && (
            <p className="km-error" role="alert">
              {err}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="km-btn secondary sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="km-btn primary sm" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * The backend has no notification feed. The one real, per-user alert it computes is "reminders due now"
 * (GET /me/reminders?due=true), so the bell reflects that for farmers and links to the reminders list.
 */
function NotificationBell({ user }: { user: User | null }) {
  const { t } = useI18n();
  const due = useApi<Reminder[]>(user?.role === "farmer" ? "/me/reminders?due=true" : null);
  const count = due.data?.length ?? 0;
  const href = user?.role === "farmer" ? "/advice#reminders" : "/updates";
  const label =
    user?.role === "farmer"
      ? count > 0
        ? t("header.remindersDue", { count })
        : t("header.noRemindersDue")
      : t("header.updates");

  return (
    <Link href={href} className="km-bell" aria-label={label} title={label}>
      <BellIcon size={21} />
      {count > 0 && <span className="km-bell-dot" aria-hidden="true" />}
    </Link>
  );
}
