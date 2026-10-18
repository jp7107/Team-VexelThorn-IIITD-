"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, type ChatEvidence, type ChatReply } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type Entry = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; reply: ChatReply };

const HISTORY = 10; // the backend accepts the last 10 messages
const MAX_CHARS = 1000;

function EvidenceChip({ e }: { e: ChatEvidence }) {
  const { t } = useI18n();
  const kind = { kb_article: "ev_kb", db_record: "ev_record", ml_prediction: "ev_result", llm_general: "ev_general" }[e.type];
  const text = e.type === "kb_article" || e.type === "db_record" ? `${t(`chat.${kind}`)}: ${e.label}` : t(`chat.${kind}`);
  const look = e.type === "llm_general" ? "border-line text-muted" : "border-field text-field";
  const cls = `inline-flex min-h-9 items-center rounded-full border-2 bg-white/10 px-3 text-base font-semibold ${look}`;
  if (e.type === "ml_prediction" && e.ref?.startsWith("analysis:")) {
    return <Link href={`/farmer/analyses/${e.ref.slice("analysis:".length)}`} className={`${cls} underline`}>{text}</Link>;
  }
  if (e.url) {
    return <a href={e.url} target="_blank" rel="noopener noreferrer" className={`${cls} underline`}>{text}</a>;
  }
  return <span className={cls}>{text}</span>;
}

function AssistantBubble({ reply, onFollowUp }: { reply: ChatReply; onFollowUp: (q: string) => void }) {
  const { t } = useI18n();
  // Route H answers are the follow-up questions themselves; don't repeat them as buttons and text.
  const followUps = reply.route === "H" ? reply.follow_up_questions : reply.follow_up_questions.slice(0, 2);
  return (
    <div className="mr-8 rounded-2xl rounded-tl-sm bg-surface px-4 py-3">
      {reply.route !== "H" && <p className="whitespace-pre-line text-lg">{reply.answer}</p>}
      {reply.safety_notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-base text-muted">
          {reply.safety_notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      {reply.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {reply.evidence.map((e, i) => <EvidenceChip key={`${e.ref}-${i}`} e={e} />)}
        </div>
      )}
      {followUps.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {followUps.map((q) => (
            <button key={q} type="button" onClick={() => onFollowUp(q)}
              className="min-h-11 rounded-xl border-2 border-ink bg-white/10 px-3 py-2 text-left text-lg font-semibold text-ink">
              {q}
            </button>
          ))}
        </div>
      )}
      {reply.llm_status === "fallback" && <p className="mt-2 text-base text-muted">{t("chat.fallbackNote")}</p>}
    </div>
  );
}

function Chat() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const analysisId = params.get("analysis");
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only return a cleanup.
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries, busy]);

  if (!user) return <Screen><Loading /></Screen>;

  async function send(question: string) {
    const q = question.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    const mine: Entry = { id: nextId.current++, role: "user", text: q };
    const history = [...entries, mine].slice(-HISTORY).map((e) => e.role === "user"
      ? { role: "user", content: e.text }
      // Include the assistant's questions so the model knows what the farmer is answering.
      : { role: "assistant", content: [e.reply.answer, ...e.reply.follow_up_questions].join("\n").slice(0, MAX_CHARS) });
    setEntries((es) => [...es, mine]);
    setText("");
    setReplyTo(null);
    setError("");
    setBusy(true);
    try {
      const reply = await api<ChatReply>("/assistant/chat", {
        method: "POST",
        body: { messages: history, language: lang, ...(analysisId ? { analysis_id: analysisId } : {}) },
        timeoutMs: 45_000,
      });
      setEntries((es) => [...es, { id: nextId.current++, role: "assistant", reply }]);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(text);
    }
  }

  function answerFollowUp(q: string) {
    setReplyTo(q);
    inputRef.current?.focus();
  }

  const suggestions = analysisId
    ? ["chat.s_check"]
    : user.role === "farmer" ? ["chat.s_farmer_1", "chat.s_farmer_2", "chat.s_farmer_3"] : ["chat.s_buyer_1", "chat.s_buyer_2"];

  return (
    <Screen title={t("chat.title")} back={analysisId ? `/farmer/analyses/${analysisId}` : user.role === "farmer" ? "/farmer" : "/"}>
      {analysisId && (
        <p className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-haldi-soft px-4 py-3 text-lg font-semibold">
          <span>{t("chat.aboutCheck")}</span>
          <Link href={`/farmer/analyses/${analysisId}`} className="min-h-11 content-center font-extrabold text-ink underline">
            {t("chat.viewCheck")}
          </Link>
        </p>
      )}

      <div role="log" aria-live="polite" aria-label={t("chat.title")} className="mb-4 flex flex-col gap-3">
        {entries.length === 0 && (
          <>
            <p className="text-lg text-muted">{t("chat.intro")}</p>
            {suggestions.map((key) => (
              <button key={key} type="button" onClick={() => send(t(key))}
                className="min-h-12 rounded-xl border-2 border-line bg-white/10 px-4 py-2 text-left text-lg font-semibold text-text">
                {t(key)}
              </button>
            ))}
          </>
        )}
        {entries.map((e) => e.role === "user" ? (
          <p key={e.id} className="ml-8 self-end whitespace-pre-line rounded-2xl rounded-tr-sm bg-brand px-4 py-3 text-lg text-white">
            {e.text}
          </p>
        ) : (
          <AssistantBubble key={e.id} reply={e.reply} onFollowUp={answerFollowUp} />
        ))}
        {busy && <p className="mr-8 rounded-2xl bg-surface px-4 py-3 text-lg text-muted" role="status">{t("chat.thinking")}</p>}
        <div ref={endRef} />
      </div>

      <FormError message={error} />
      <form onSubmit={submit} className="sticky bottom-0 -mx-4 border-t-2 border-line bg-white/10 px-4 pb-4 pt-3">
        {replyTo && (
          <p className="mb-2 flex items-start justify-between gap-2 text-base text-muted">
            <span>{t("chat.answering", { question: replyTo })}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="min-h-9 shrink-0 font-semibold text-ink underline">
              {t("chat.cancelReply")}
            </button>
          </p>
        )}
        <label htmlFor="chat-input" className="sr-only">{t("chat.inputLabel")}</label>
        <div className="flex items-end gap-2">
          <textarea id="chat-input" ref={inputRef} rows={2} maxLength={MAX_CHARS} value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} placeholder={t("chat.placeholder")}
            className="min-h-14 flex-1 resize-none rounded-xl border-2 border-line px-4 py-3 text-lg focus:border-ink" />
          <button type="submit" disabled={busy || !text.trim()}
            className="min-h-14 rounded-xl bg-haldi px-5 text-lg font-extrabold text-ink-strong disabled:opacity-50">
            {t("chat.send")}
          </button>
        </div>
      </form>
    </Screen>
  );
}

// The ?analysis= param is request data under cacheComponents, so the reader sits inside <Suspense>.
export default function AssistantPage() {
  return (
    <Suspense fallback={<Screen><Loading /></Screen>}>
      <Chat />
    </Suspense>
  );
}
