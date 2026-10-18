"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui";

/** Keeps one widget's render failure from blanking the whole dashboard. */
export function WidgetBoundary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ErrorBoundaryInner label={label}>
      <WidgetBoundaryInner label={label}>{children}</WidgetBoundaryInner>
    </ErrorBoundaryInner>
  );
}

import { Component } from "react";

class ErrorBoundaryInner extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="km-state error" role="alert">
          <span className="km-state-title">{this.props.label} could not be displayed</span>
        </div>
      );
    }
    return this.props.children;
  }
}

class WidgetBoundaryInner extends Component<{ label: string; children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };
  static getDerivedStateFromError(e: unknown) {
    return { message: e instanceof Error ? e.message : "Unexpected error" };
  }
  render() {
    if (this.state.message) {
      return (
        <div className="km-state error" role="alert">
          <span className="km-state-title">{this.props.label} could not be displayed</span>
          <span>{this.state.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Retry affordance for an ApiError inside a widget. */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="km-state error" role="alert" style={{ padding: 10 }}>
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
