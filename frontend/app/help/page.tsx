"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink, Field, FormError, Screen, inputClass } from "@/components/ui";
import { api, type User } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";

type Ticket = { id: string; subject: string; message: string; status: "open" | "closed"; created_at: string };

// These are real step sequences, so they are numbered.
const GUIDES: { title: string; steps: string[] }[] = [
  { title: "help.g_check", steps: ["help.g_check_1", "help.g_check_2", "help.g_check_3", "help.g_check_4"] },
  { title: "help.g_sell", steps: ["help.g_sell_1", "help.g_sell_2", "help.g_sell_3", "help.g_sell_4"] },
  { title: "help.g_price", steps: ["help.g_price_1", "help.g_price_2", "help.g_price_3"] },
];
const KCC_SOURCE = "https://www.dackkms.gov.in/account/aboutus.aspx";

function SupportForm() {
  const { t } = useI18n();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Ticket[]>("/me/support/tickets").then(setTickets).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return setError(t("errors.required"));
    setBusy(true);
    setError("");
    try {
      await api("/support/tickets", { method: "POST", body: { subject, message } });
      setSubject("");
      setMessage("");
      setSent(true);
      load();
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="mb-4">
        <FormError message={error} />
        {sent && <p role="status" className="mb-4 rounded-xl bg-field-soft px-4 py-3 text-lg font-semibold text-field">{t("help.sent")}</p>}
        <Field id="subject" label={t("help.subject")}>
          <input id="subject" maxLength={120} className={inputClass} value={subject} onChange={(e) => { setSubject(e.target.value); setSent(false); }} />
        </Field>
        <Field id="message" label={t("help.message")}>
          <textarea id="message" rows={4} maxLength={2000} className={`${inputClass} py-3`} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("help.send")}</Button>
      </form>
      {tickets.length > 0 && (
        <>
          <h3 className="mb-2 text-lg font-extrabold text-ink">{t("help.myTickets")}</h3>
          <ul className="flex flex-col gap-2">
            {tickets.map((tk) => (
              <li key={tk.id} className="flex items-start justify-between gap-2 rounded-xl bg-surface px-4 py-3 text-lg">
                <span>{tk.subject}</span>
                <span className={`shrink-0 rounded-full px-3 text-base font-semibold ${tk.status === "open" ? "bg-haldi-soft text-ink" : "bg-white/10 text-muted"}`}>
                  {t(`help.${tk.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function HelpPage() {
  const { t } = useI18n();
  // Help is public; only the support form needs a login, so this checks the session without redirecting.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api<User>("/auth/me").then(setUser).catch(() => setUser(null));
  }, []);

  return (
    <Screen title={t("help.title")} back={user?.role === "farmer" ? "/farmer" : "/"}>
      <section className="mb-6 rounded-2xl border-l-8 border-field bg-field-soft p-4" aria-labelledby="kcc">
        <h2 id="kcc" className="text-xl font-extrabold text-field">{t("help.kcc")}</h2>
        <p className="mt-1 text-3xl font-extrabold text-ink">
          {t("help.kccNumber")} <span className="text-lg font-semibold">{t("help.kccShort")}</span>
        </p>
        <p className="mt-1 text-lg">{t("help.kccDetails")}</p>
        <a href="tel:18001801551" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-brand text-lg font-extrabold text-white">
          {t("help.kccCall")}
        </a>
        <a href={KCC_SOURCE} target="_blank" rel="noopener noreferrer" className="mt-2 block text-base text-muted underline">
          {t("help.kccSource")}
        </a>
      </section>

      <h2 className="mb-3 text-xl font-extrabold text-ink">{t("help.guides")}</h2>
      <div className="mb-6 flex flex-col gap-3">
        {GUIDES.map((g) => (
          <section key={g.title} className="rounded-2xl border-2 border-line p-4">
            <h3 className="mb-2 text-lg font-extrabold text-ink">{t(g.title)}</h3>
            <ol className="list-decimal space-y-1 pl-6 text-lg">
              {g.steps.map((s) => <li key={s}>{t(s)}</li>)}
            </ol>
          </section>
        ))}
      </div>

      <h2 className="mb-3 text-xl font-extrabold text-ink">{t("help.contact")}</h2>
      {user === undefined ? null : user ? <SupportForm /> : (
        <>
          <p className="mb-3 text-lg text-muted">{t("help.loginToSend")}</p>
          <ButtonLink href="/login" variant="secondary">{t("landing.login")}</ButtonLink>
        </>
      )}
    </Screen>
  );
}
