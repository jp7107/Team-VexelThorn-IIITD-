"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BasketIcon, LeafScanIcon, PriceIcon } from "@/components/icons";
import { ButtonLink, TopBar } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

function ActionTile({ href, icon, label, hint, action }: {
  href: string;
  icon: ReactNode;
  label: string;
  hint: string;
  action: string;
}) {
  return (
    <Link href={href} className="glass flex flex-col rounded-2xl border border-white/15 p-4 transition hover:border-white/40">
      <span className="mb-4 flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-white/90 text-ink-strong">{icon}</span>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-semibold text-lime">{action}</span>
      </span>
      <span className="block font-display text-lg font-semibold leading-snug text-ink">{label}</span>
      <span className="mt-1 block text-sm text-muted">{hint}</span>
    </Link>
  );
}

export default function Landing() {
  const { t } = useI18n();
  // The three tiles mirror the diagram's core promises; signed-out visitors are sent to log in first.
  return (
    <>
      <TopBar />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-end px-4 pb-10 pt-10 lg:pt-24">
        <section className="mb-8 max-w-2xl">
          <p className="mb-3 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-muted backdrop-blur">
            {t("app.motto")}
          </p>
          <h1 className="text-[2.1rem] font-semibold leading-[1.05] text-ink lg:text-6xl">{t("app.tagline")}</h1>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" className="sm:w-auto sm:px-8">{t("landing.createAccount")}</ButtonLink>
            <ButtonLink href="/login" variant="secondary" className="sm:w-auto sm:px-8">{t("landing.login")}</ButtonLink>
          </div>
        </section>
        <nav className="grid gap-3 sm:grid-cols-3">
          <ActionTile href="/farmer/diagnose" icon={<LeafScanIcon className="size-5" />} label={t("landing.checkCrop")}
            hint={t("landing.checkCropHint")} action={t("chat.c_photo_action")} />
          <ActionTile href="/market/prices" icon={<PriceIcon className="size-5" />} label={t("landing.prices")}
            hint={t("landing.pricesHint")} action={t("chat.c_price_action")} />
          <ActionTile href="/farmer/listings" icon={<BasketIcon className="size-5" />} label={t("landing.sell")}
            hint={t("landing.sellHint")} action={t("home.sell")} />
        </nav>
        <p className="mt-6 flex flex-wrap items-center gap-x-4 text-sm text-muted">
          {t("app.installHint")}
          <Link href="/help" className="inline-flex min-h-11 items-center font-semibold text-ink underline">{t("home.help")}</Link>
        </p>
      </main>
    </>
  );
}
