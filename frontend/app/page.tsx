"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BasketIcon, LeafScanIcon, PriceIcon } from "@/components/icons";
import { ButtonLink, TopBar } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

function ActionTile({ href, icon, label, hint }: { href: string; icon: ReactNode; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 shadow-[0_2px_0_0_var(--color-line)] ring-1 ring-line"
    >
      <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-haldi text-ink-strong">
        {icon}
      </span>
      <span>
        <span className="block text-xl font-extrabold leading-snug text-ink">{label}</span>
        <span className="block text-base text-muted">{hint}</span>
      </span>
    </Link>
  );
}

export default function Landing() {
  const { t } = useI18n();
  // The three tiles mirror the diagram's core promises. They lead to login until those features exist.
  return (
    <>
      <TopBar />
      <section className="pb-24 text-white">
        <p className="mx-auto max-w-md px-4 pt-6 text-3xl font-extrabold leading-tight">{t("app.tagline")}</p>
      </section>
      <main className="mx-auto -mt-16 w-full max-w-md flex-1 px-4 pb-12">
        <nav className="flex flex-col gap-3">
          <ActionTile href="/farmer/diagnose" icon={<LeafScanIcon className="size-9" />} label={t("landing.checkCrop")}
            hint={t("landing.checkCropHint")} />
          <ActionTile href="/market/prices" icon={<PriceIcon className="size-9" />} label={t("landing.prices")}
            hint={t("landing.pricesHint")} />
          <ActionTile href="/farmer/listings" icon={<BasketIcon className="size-9" />} label={t("landing.sell")}
            hint={t("landing.sellHint")} />
        </nav>
        <div className="mt-8 flex flex-col gap-3">
          <ButtonLink href="/register">{t("landing.createAccount")}</ButtonLink>
          <ButtonLink href="/login" variant="secondary">{t("landing.login")}</ButtonLink>
        </div>
        <p className="mt-6 text-base text-muted">{t("app.installHint")}</p>
        <Link href="/help" className="mt-4 inline-flex min-h-11 items-center text-lg font-semibold text-ink underline">{t("home.help")}</Link>
      </main>
    </>
  );
}
