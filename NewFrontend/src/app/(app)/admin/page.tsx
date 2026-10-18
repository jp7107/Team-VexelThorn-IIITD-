"use client";

import { useSyncExternalStore, type KeyboardEvent } from "react";
import { PageHeading } from "@/components/ui";
import { ListingsAdmin } from "@/features/admin/ListingsAdmin";
import { SchemesAdmin } from "@/features/admin/SchemesAdmin";
import { UpdatesAdmin } from "@/features/admin/UpdatesAdmin";
import { UsersAdmin } from "@/features/admin/UsersAdmin";
import { useContentI18n } from "@/features/content/ns";
import { RequireRole } from "@/lib/session";

const TABS = ["schemes", "updates", "users", "listings"] as const;
type Tab = (typeof TABS)[number];

// The selected tab lives in the URL hash, so a section can be linked to and survives a reload.
function readTab(): Tab {
  const h = window.location.hash.slice(1);
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : "schemes";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function AdminConsole() {
  const { t } = useContentI18n();
  const tab = useSyncExternalStore(subscribe, readTab, () => "schemes" as Tab);

  function select(next: Tab, focus = false) {
    window.location.hash = next;
    if (focus) document.getElementById(`admin-tab-${next}`)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.indexOf(tab);
    if (e.key === "ArrowRight") select(TABS[(i + 1) % TABS.length], true);
    else if (e.key === "ArrowLeft") select(TABS[(i + TABS.length - 1) % TABS.length], true);
    else if (e.key === "Home") select(TABS[0], true);
    else if (e.key === "End") select(TABS[TABS.length - 1], true);
    else return;
    e.preventDefault();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PageHeading title={t("admin.title")} subtitle={`${t("admin.subtitle")} ${t("admin.roleNote")}`} />
      <div role="tablist" aria-label={t("admin.tabs.label")} onKeyDown={onKeyDown} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map((k) => (
          <button
            key={k}
            id={`admin-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls="admin-panel"
            tabIndex={tab === k ? 0 : -1}
            className={`km-btn sm ${tab === k ? "primary" : "secondary"}`}
            onClick={() => select(k)}
          >
            {t(`admin.tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="admin-panel" aria-labelledby={`admin-tab-${tab}`}>
        {tab === "schemes" ? <SchemesAdmin /> : tab === "updates" ? <UpdatesAdmin /> : tab === "users" ? <UsersAdmin /> : <ListingsAdmin />}
      </div>
    </div>
  );
}

export default function AdminRoute() {
  return <RequireRole roles={["admin"]}>{() => <AdminConsole />}</RequireRole>;
}
