"use client";

import { useEffect, useState } from "react";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, type FarmUpdate } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function UpdatesPage() {
  const { t, lang } = useI18n();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [updates, setUpdates] = useState<FarmUpdate[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api<FarmUpdate[]>("/updates").then(setUpdates).catch((e) => setError(t(errorKey(e))));
  }, [user, t]);

  if (!user) return <Screen><Loading /></Screen>;
  const day = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long" });
  return (
    <Screen title={t("updates.title")} back={user.role === "farmer" ? "/farmer" : "/"}>
      <FormError message={error} />
      {updates === null ? (!error && <Loading />) : updates.length === 0 ? (
        <p className="text-base text-muted">{t("updates.none")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id} className="glass rounded-2xl border border-white/15 p-4">
              <p className="text-base text-muted">{day.format(new Date(u.published_at))}</p>
              <h2 className="text-base font-bold text-ink">{u.title}</h2>
              <p className="whitespace-pre-line text-base">{u.body}</p>
              {u.source_url && (
                <a href={u.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block min-h-11 content-center font-semibold text-ink underline">
                  {t("updates.source")}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
