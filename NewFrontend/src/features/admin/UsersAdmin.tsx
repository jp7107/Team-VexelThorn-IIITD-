"use client";

// Admin → Users tab. GET /admin/users?role= is read-only by contract (no create/update/delete).
// The server omits phone numbers on purpose and returns at most 200 rows.

import { useState } from "react";
import { UsersIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock, Panel } from "@/components/ui";
import { describeError, type User, type UserRole } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { shortDate } from "@/lib/format";
import { useContentI18n } from "@/features/content/ns";

type AdminUserRow = User & { created_at?: string };
type RoleFilter = UserRole | "";

export function UsersAdmin() {
  const { t, lang } = useContentI18n();
  const [role, setRole] = useState<RoleFilter>("");
  const { data, error, loading, reload } = useApi<AdminUserRow[]>(
    `/admin/users${role ? `?role=${encodeURIComponent(role)}` : ""}`,
  );
  const rows = data ?? [];

  return (
    <Panel
      title={t("admin.users.heading")}
      icon={<UsersIcon size={17} style={{ color: "var(--km-green-700)" }} />}
      badge={
        <span className="km-badge neutral">
          {rows.length === 1
            ? t("admin.common.rowCountOne", { n: rows.length })
            : t("admin.common.rowCountMany", { n: rows.length })}
        </span>
      }
      action={
        <label className="ka-toolbar-meta" style={{ marginLeft: "auto", gap: 6, paddingBottom: 0 }}>
          <span className="km-caption">{t("admin.users.roleLabel")}</span>
          <select
            className="km-select"
            value={role}
            onChange={(ev) => setRole(ev.target.value as RoleFilter)}
            style={{ minHeight: 30, fontSize: 11.5, padding: "2px 8px", width: 130 }}
          >
            <option value="">{t("admin.users.roleAll")}</option>
            <option value="farmer">{t("common.farmer")}</option>
            <option value="customer">{t("common.buyer")}</option>
            <option value="admin">{t("common.admin")}</option>
          </select>
        </label>
      }
      bodyClassName=""
    >
      <p className="km-caption" style={{ marginBottom: 8 }}>
        {t("admin.users.subtitle")}
      </p>

      {loading ? (
        <LoadingBlock lines={5} height={26} />
      ) : error ? (
        <ErrorState message={describeError(error)} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("admin.users.emptyTitle")} hint={t("admin.users.emptyHint")} />
      ) : (
        <div className="km-scroll-x ka-table-wrap">
          <table className="km-table ka-table">
            <caption className="km-sr-only">{t("admin.users.heading")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.users.colName")}</th>
                <th scope="col">{t("admin.users.colRole")}</th>
                <th scope="col">{t("admin.users.colType")}</th>
                <th scope="col">{t("admin.users.colState")}</th>
                <th scope="col">{t("admin.users.colDistrict")}</th>
                <th scope="col">{t("admin.users.colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="ka-cell-title">{u.name}</div>
                  </td>
                  <td>
                    <span className={`ka-status ${u.role === "admin" ? "warn" : "neutral"}`}>
                      {u.role === "farmer"
                        ? t("common.farmer")
                        : u.role === "customer"
                          ? t("common.buyer")
                          : t("common.admin")}
                    </span>
                  </td>
                  <td>
                    {u.customer_type === "retail"
                      ? t("admin.users.retail")
                      : u.customer_type === "wholesale"
                        ? t("admin.users.wholesale")
                        : t("admin.users.noType")}
                  </td>
                  <td>{u.state}</td>
                  <td>{u.district}</td>
                  <td className="ka-cell-nowrap">
                    {u.created_at ? shortDate(u.created_at, lang) : t("admin.common.none")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="ka-note">{t("admin.users.limitNote")}</p>
    </Panel>
  );
}
