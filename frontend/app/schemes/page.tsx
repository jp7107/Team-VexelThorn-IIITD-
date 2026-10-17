"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, type Scheme } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function SchemesPage() {
  const { t } = useI18n();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [schemes, setSchemes] = useState<Scheme[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    // Farmers see central schemes plus their own state's; others see everything published.
    const query = user.role === "farmer" ? `?state=${encodeURIComponent(user.state)}` : "";
    api<Scheme[]>(`/schemes${query}`).then(setSchemes).catch((e) => setError(t(errorKey(e))));
  }, [user, t]);

  if (!user) return <Screen><Loading /></Screen>;
  return (
    <Screen title={t("schemes.title")} back={user.role === "farmer" ? "/farmer" : "/"}>
      <p className="mb-5 text-lg text-muted">{t("schemes.intro")}</p>
      <FormError message={error} />
      {schemes === null ? (!error && <Loading />) : schemes.length === 0 ? (
        <p className="text-lg text-muted">{t("schemes.none")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {schemes.map((s) => (
            <li key={s.id}>
              <Link href={`/schemes/${s.id}`} className="block rounded-2xl border-2 border-line p-4">
                <span className="block text-lg font-extrabold text-ink">{s.name}</span>
                <span className="block text-lg">{s.summary}</span>
                <span className="mt-1 block text-base font-semibold text-ink underline">{t("schemes.view")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
