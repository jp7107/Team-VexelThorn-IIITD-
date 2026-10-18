"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRightIcon, InfoIcon, AlertIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";

/* ---------- panel ---------- */

export function Panel({
  title,
  icon,
  badge,
  action,
  children,
  className = "",
  bodyClassName = "",
  glass = false,
  style,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  glass?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`${glass ? "km-glass" : "km-panel"} ${className}`} style={style}>
      {(title || badge || action) && (
        <header className="km-panel-head">
          <h2 className="km-panel-title">
            {icon}
            {title}
          </h2>
          {badge && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>{badge}</span>}
          {action && !badge && <span style={{ marginLeft: "auto" }}>{action}</span>}
        </header>
      )}
      <div className={`km-panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* ---------- badges ---------- */

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "demo" | "sample" | "guidance" | "bad" | "good" | "info" | "neutral";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`km-badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function DemoBadge({ label }: { label?: string }) {
  const { t } = useI18n();
  return <Badge tone="demo">{label ?? t("demo.data")}</Badge>;
}

/* ---------- section heading inside a page ---------- */

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 4,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</h1>
        {subtitle && <p className="km-caption" style={{ marginTop: 3 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </header>
  );
}

/* ---------- buttons / links ---------- */

type BtnProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "md" | "sm" };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }: BtnProps) {
  return <button type={type} className={`km-btn ${variant} ${size === "sm" ? "sm" : ""} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "md" | "sm" }) {
  return <Link className={`km-btn ${variant} ${size === "sm" ? "sm" : ""} ${className}`} {...props} />;
}

/* ---------- async states ---------- */

export function LoadingBlock({ lines = 3, height = 14 }: { lines?: number; height?: number }) {
  return (
    <div aria-busy="true" style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="km-skeleton"
          style={{ height, width: i === lines - 1 ? "62%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="km-state error" role="alert">
      <span className="km-state-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <AlertIcon size={15} />
        {t("common.errorTitle")}
      </span>
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} style={{ marginTop: 4 }}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="km-state">
      <span className="km-state-title">{title}</span>
      {hint && <span>{hint}</span>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}

export function UnavailableState({ what, hint }: { what: string; hint?: string }) {
  return (
    <div className="km-state" style={{ background: "#fbfbf9" }}>
      <span className="km-state-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <InfoIcon size={15} />
        {what}
      </span>
      {hint && <span>{hint}</span>}
    </div>
  );
}

/* ---------- misc ---------- */

export function Divider() {
  return <div style={{ height: 1, background: "var(--km-border)", margin: "10px 0" }} />;
}

export function DataRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
      <span className="km-caption">{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", minWidth: 0 }}>{value}</span>
    </div>
  );
}

/** Full-width chevron row used by quick actions and list links. */
export function ChevronRow({
  icon,
  title,
  subtitle,
  href,
  onClick,
  tint = "var(--km-green-50)",
  iconColor = "var(--km-green-700)",
  ariaLabel,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  href?: string;
  onClick?: () => void;
  tint?: string;
  iconColor?: string;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      <span className="km-icon-tile" style={{ background: tint, color: iconColor, width: 34, height: 34, borderRadius: 9 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{title}</span>
        {subtitle && <span className="km-caption" style={{ display: "block", marginTop: 1 }}>{subtitle}</span>}
      </span>
      <ChevronRightIcon size={15} style={{ color: "var(--km-subtle)", flex: "none" }} />
    </>
  );
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--km-border-soft)",
    background: "#fff",
    textAlign: "left",
  };
  if (href) {
    return (
      <Link href={href} style={style} aria-label={ariaLabel} className="km-chevron-row">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={style} aria-label={ariaLabel} className="km-chevron-row">
      {inner}
    </button>
  );
}
