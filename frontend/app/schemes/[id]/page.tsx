"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, ApiError, type Scheme } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

function SchemeView() {
  const { t, lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<Scheme>(`/schemes/${id}`).then(setScheme)
      .catch((e) => setError(t(e instanceof ApiError && (e.status === 404 || e.status === 422) ? "schemes.notFound" : errorKey(e))));
  }, [user, id, t]);

  if (error) return <Screen back="/schemes"><FormError message={error} /></Screen>;
  if (!scheme) return <Screen back="/schemes"><Loading /></Screen>;
  const day = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Screen title={scheme.name} back="/schemes">
      <p className="mb-5 text-lg">{scheme.summary}</p>
      <p className="mb-4 text-base text-muted">
        {scheme.states.length ? t("schemes.statesList", { states: scheme.states.join(", ") }) : t("schemes.allIndia")}
      </p>
      <section className="mb-4 rounded-2xl bg-surface p-4">
        <h2 className="mb-1 text-xl font-extrabold text-ink">{t("schemes.eligibility")}</h2>
        <p className="whitespace-pre-line text-lg">{scheme.eligibility_text}</p>
      </section>
      {scheme.benefit_text && (
        <section className="mb-4 rounded-2xl bg-field-soft p-4">
          <h2 className="mb-1 text-xl font-extrabold text-field">{t("schemes.benefit")}</h2>
          <p className="whitespace-pre-line text-lg">{scheme.benefit_text}</p>
        </section>
      )}
      <p className="mb-4 rounded-xl border-l-8 border-haldi bg-haldi-soft px-4 py-3 text-lg font-semibold">{t("schemes.checkThere")}</p>
      <a href={scheme.official_url} target="_blank" rel="noopener noreferrer"
        className="mb-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-haldi px-5 text-lg font-extrabold text-ink-strong">
        {t("schemes.official")}
      </a>
      <p className="text-base text-muted">{t("schemes.verified", { date: day.format(new Date(scheme.last_verified_at)) })}</p>
    </Screen>
  );
}

// The id comes from the URL (request data under cacheComponents), so it is read inside <Suspense>.
export default function SchemePage() {
  return (
    <Suspense fallback={<Screen back="/schemes"><Loading /></Screen>}>
      <SchemeView />
    </Suspense>
  );
}
