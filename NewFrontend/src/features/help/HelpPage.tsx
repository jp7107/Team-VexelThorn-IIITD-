"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRightIcon,
  BarChartIcon,
  BotIcon,
  CalendarIcon,
  CameraIcon,
  CartIcon,
  HelpIcon,
  LandmarkIcon,
  SproutIcon,
  PlayIcon,
  UsersIcon,
} from "@/components/icons";
import { Badge, ButtonLink, PageHeading, Panel, UnavailableState } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import type { UserRole } from "@/lib/api";
import { FaqAccordion } from "@/features/help/FaqAccordion";
import { StatusPanel } from "@/features/help/StatusPanel";
import "./help.css";

type IconType = ComponentType<{ size?: number }>;

type StepKey =
  | "diagnose"
  | "prices"
  | "listProduce"
  | "reminders"
  | "assistant"
  | "schemes"
  | "market"
  | "admin"
  | "schemesReview";

type Step = { key: StepKey; href: string; Icon: IconType };

/**
 * The tour only ever links to screens that exist for that role. /market/mine and /advice#reminders are
 * farmer-only, so buyers and admins get a shorter route list rather than links that bounce them home.
 */
const STEPS: Record<UserRole, Step[]> = {
  farmer: [
    { key: "diagnose", href: "/health/diagnose", Icon: CameraIcon },
    { key: "prices", href: "/prices", Icon: BarChartIcon },
    { key: "listProduce", href: "/market/mine", Icon: CartIcon },
    { key: "reminders", href: "/advice#reminders", Icon: CalendarIcon },
    { key: "assistant", href: "/assistant", Icon: BotIcon },
    { key: "schemes", href: "/schemes", Icon: LandmarkIcon },
  ],
  customer: [
    { key: "market", href: "/market", Icon: CartIcon },
    { key: "prices", href: "/prices", Icon: BarChartIcon },
    { key: "assistant", href: "/assistant", Icon: BotIcon },
    { key: "schemes", href: "/schemes", Icon: LandmarkIcon },
  ],
  admin: [
    { key: "admin", href: "/admin", Icon: UsersIcon },
    { key: "schemesReview", href: "/schemes", Icon: LandmarkIcon },
    { key: "prices", href: "/prices", Icon: BarChartIcon },
    { key: "assistant", href: "/assistant", Icon: BotIcon },
  ],
};

export function HelpPage({ role }: { role: UserRole }) {
  const { t } = useI18n();
  const steps = STEPS[role];

  const primary: { href: string; label: string; icon: ReactNode } =
    role === "farmer"
      ? { href: "/health/diagnose", label: t("help.startCheck"), icon: <CameraIcon size={15} /> }
      : role === "customer"
        ? { href: "/market", label: t("help.browseMarket"), icon: <CartIcon size={15} /> }
        : { href: "/admin", label: t("help.openAdmin"), icon: <UsersIcon size={15} /> };

  return (
    <div className="km-help">
      <PageHeading
        title={t("help.title")}
        subtitle={t("help.subtitle")}
        actions={
          <>
            <ButtonLink href={primary.href} variant="primary" size="sm">
              {primary.icon}
              {primary.label}
            </ButtonLink>
            <ButtonLink href="/assistant" variant="secondary" size="sm">
              <BotIcon size={15} />
              {t("help.askAssistant")}
            </ButtonLink>
          </>
        }
      />

      <div className="km-help-grid">
        <div className="km-help-col">
          <Panel
            title={t("help.gettingStarted")}
            icon={<SproutIcon size={17} />}
            badge={<Badge tone="neutral">{t("help.stepCount", { count: steps.length })}</Badge>}
          >
            <p className="km-caption" style={{ marginBottom: 10 }}>
              {t("help.gettingStartedHint")}
            </p>
            <ol className="km-help-steps" role="list">
              {steps.map((step, index) => (
                <li key={step.key} className="km-help-step">
                  <span className="km-help-step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="km-help-step-main">
                    <div className="km-help-step-head">
                      <span className="km-icon-tile km-help-step-icon">
                        <step.Icon size={17} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <h3 className="km-help-step-title">{t(`help.steps.${step.key}.title`)}</h3>
                        <Badge tone="neutral">{t(`help.steps.${step.key}.tag`)}</Badge>
                      </div>
                    </div>
                    <p className="km-caption km-help-step-body">{t(`help.steps.${step.key}.body`)}</p>
                    <Link href={step.href} className="km-linkish">
                      {t(`help.steps.${step.key}.cta`)}
                      <ArrowRightIcon size={13} />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={t("help.faq.title")} icon={<HelpIcon size={17} />} badge={<Badge tone="info">{t("help.faq.badge")}</Badge>}>
            <p className="km-caption" style={{ marginBottom: 4 }}>
              {t("help.faq.hint")}
            </p>
            <FaqAccordion />
          </Panel>
        </div>

        <div className="km-help-col">
          <StatusPanel />

          <Panel title={t("help.videos.panel")} icon={<PlayIcon size={17} />} badge={<Badge tone="neutral">{t("help.videos.badge")}</Badge>}>
            <UnavailableState what={t("help.videos.state")} hint={t("help.videos.body")} />
            <p className="km-footnote" style={{ marginTop: 8 }}>
              {t("help.videos.request")}
            </p>
          </Panel>

          <Panel title={t("help.support.title")} icon={<HelpIcon size={17} />}>
            <p className="km-help-support-lead">{t("help.support.body")}</p>
            <p className="km-caption" style={{ marginTop: 8 }}>
              {t("help.support.extension")}
            </p>
            <div style={{ marginTop: 10 }}>
              <ButtonLink href="/schemes" variant="secondary" size="sm">
                <LandmarkIcon size={15} />
                {t("help.support.schemesLink")}
              </ButtonLink>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
