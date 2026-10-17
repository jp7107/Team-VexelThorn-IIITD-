"use client";

import { useRouter } from "next/navigation";
import { Loading, Screen } from "@/components/ui";
import { api, type UserRole } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** Signed-in landing for roles whose screens come in later plan tasks (marketplace, admin). */
export function Placeholder({ role, introKey }: { role: UserRole; introKey: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useSession([role]);
  if (!user) return <Screen><Loading /></Screen>;

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  return (
    <Screen title={t("home.greeting", { name: user.name })}>
      <p className="mb-2 text-xl font-extrabold text-ink">{t("home.comingSoon")}</p>
      <p className="mb-8 text-lg text-muted">{t(introKey)}</p>
      <button type="button" onClick={logout} className="min-h-12 text-lg font-semibold text-ink underline">
        {t("auth.logout")}
      </button>
    </Screen>
  );
}
