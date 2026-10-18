"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode,
} from "react";
import { ChatIcon, LeafScanIcon, PriceIcon, SchemeIcon, SproutIcon } from "@/components/icons";
import { FormError, Loading, Screen } from "@/components/ui";
import { api, type Analysis, type ChatEvidence, type ChatReply } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type Entry = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; reply: ChatReply };

const HISTORY = 10; // the backend accepts the last 10 messages
const MAX_CHARS = 1000;

// Browser speech-to-text (Chrome, Edge, Safari). The question is only typed into the box; the farmer still
// reads it and presses send. Not in TypeScript's DOM lib, so the shape we use is declared here.
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
function recognitionClass(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
const noop = () => () => {};

function SparkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2c.6 4.9 2.9 7.3 8 8-5.1.7-7.4 3.1-8 8-.6-4.9-2.9-7.3-8-8 5.1-.7 7.4-3.1 8-8Z" />
    </svg>
  );
}

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function EvidenceChip({ e }: { e: ChatEvidence }) {
  const { t } = useI18n();
  const kind = { kb_article: "ev_kb", db_record: "ev_record", ml_prediction: "ev_result", llm_general: "ev_general" }[e.type];
  const text = e.type === "kb_article" || e.type === "db_record" ? `${t(`chat.${kind}`)}: ${e.label}` : t(`chat.${kind}`);
  const look = e.type === "llm_general" ? "border-line text-muted" : "border-field/60 text-field";
  const cls = `inline-flex min-h-8 items-center rounded-full border bg-white/5 px-3 text-sm font-semibold ${look}`;
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
    <div className="flex gap-3 pr-6">
      <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-lime/15 text-lime"><SparkIcon className="size-4" /></span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-3">
        {reply.route !== "H" && <p className="whitespace-pre-line">{reply.answer}</p>}
        {reply.safety_notes.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-muted">
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
                className="min-h-11 rounded-xl border border-lime/40 bg-lime/5 px-3 py-2 text-left font-semibold text-ink">
                {q}
              </button>
            ))}
          </div>
        )}
        {reply.llm_status === "fallback" && <p className="mt-2 text-sm text-muted">{t("chat.fallbackNote")}</p>}
      </div>
    </div>
  );
}

function FeatureCard({ icon, action, title, body, onClick, href }: {
  icon: ReactNode;
  action: string;
  title: string;
  body: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className="mb-4 flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-ink">{icon}</span>
        <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-sm font-semibold text-lime">{action}</span>
      </span>
      <span className="block font-display text-lg font-semibold leading-snug">{title}</span>
      <span className="mt-1 block text-sm text-muted">{body}</span>
    </>
  );
  const cls = "glass block rounded-2xl border border-white/10 p-4 text-left transition hover:border-lime/40";
  return href ? <Link href={href} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
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
  const [checks, setChecks] = useState<Analysis[]>([]);
  const [listening, setListening] = useState(false);
  const canSpeak = useSyncExternalStore(noop, () => Boolean(recognitionClass()), () => false);
  const nextId = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only return a cleanup.
    if (entries.length) endRef.current?.scrollIntoView({ block: "end" });
  }, [entries, busy]);

  useEffect(() => {
    if (user?.role !== "farmer") return;
    api<Analysis[]>("/me/analyses?limit=6").then(setChecks, () => undefined);
  }, [user]);

  useEffect(() => () => recRef.current?.stop(), []);

  if (!user) return <Screen><Loading /></Screen>;
  const farmer = user.role === "farmer";

  async function send(question: string) {
    const q = question.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    recRef.current?.stop();
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

  function listen() {
    const Rec = recognitionClass();
    if (!Rec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Rec();
    rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
    rec.interimResults = true;
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(" ").slice(0, MAX_CHARS));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
    inputRef.current?.focus();
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

  function newChat() {
    recRef.current?.stop();
    setEntries([]);
    setText("");
    setReplyTo(null);
    setError("");
  }

  const empty = entries.length === 0;
  const topics = farmer ? ["t_disease", "t_yield", "t_water", "t_prices", "t_schemes"] : ["t_prices", "t_schemes", "t_buy"];
  const dayFmt = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" });
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const checkTitle = (a: Analysis) => a.status === "ok" && a.prediction
    ? (lang === "hi" ? a.prediction.name_hi : a.prediction.name) : t(`home.checkStatus.${a.status}`);

  const composer = (
    <form onSubmit={submit}
      className={`glass rounded-2xl border border-white/15 p-3 ${empty ? "" : "sticky bottom-[4.5rem] z-10 lg:bottom-4"}`}>
      {replyTo && (
        <p className="mb-2 flex items-start justify-between gap-2 text-sm text-muted">
          <span>{t("chat.answering", { question: replyTo })}</span>
          <button type="button" onClick={() => setReplyTo(null)} className="min-h-8 shrink-0 font-semibold text-ink underline">
            {t("chat.cancelReply")}
          </button>
        </p>
      )}
      <label htmlFor="chat-input" className="sr-only">{t("chat.inputLabel")}</label>
      <div className="flex items-start gap-2">
        <SparkIcon className="mt-2.5 size-4 shrink-0 text-lime" />
        <textarea id="chat-input" ref={inputRef} rows={empty ? 3 : 1} maxLength={MAX_CHARS} value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
          placeholder={listening ? t("chat.listening") : t("chat.askAnything")}
          className="min-h-10 flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-muted" />
      </div>
      <div className="mt-2 flex items-center gap-1 border-t border-white/10 pt-2 text-sm">
        {farmer && (
          <Link href="/farmer/diagnose" className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-muted hover:bg-white/5 hover:text-text">
            <LeafScanIcon className="size-4" /> {t("chat.attachPhoto")}
          </Link>
        )}
        {!empty && (
          <button type="button" onClick={newChat} className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-muted hover:bg-white/5 hover:text-text">
            <ChatIcon className="size-4" /> {t("chat.newChat")}
          </button>
        )}
        <span className="flex-1" />
        {canSpeak && (
          <button type="button" onClick={listen} aria-pressed={listening}
            aria-label={listening ? t("chat.stopListening") : t("chat.speak")} title={listening ? t("chat.stopListening") : t("chat.speak")}
            className={`grid size-10 place-items-center rounded-full border ${listening
              ? "animate-pulse border-lime bg-lime/20 text-lime" : "border-white/15 text-ink hover:bg-white/5"}`}>
            <MicIcon className="size-5" />
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} aria-label={t("chat.send")} title={t("chat.send")}
          className="grid size-10 place-items-center rounded-full bg-lime text-ink-strong shadow-[0_0_18px_rgb(196_239_94/0.4)] disabled:opacity-40 disabled:shadow-none">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </button>
      </div>
    </form>
  );

  return (
    <Screen wide>
      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)_17rem]">
        {/* Left rail: start over, and ready-made questions. */}
        <aside className="glass hidden self-start rounded-2xl border border-white/10 p-3 lg:block">
          <button type="button" onClick={newChat}
            className="mb-4 flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 font-semibold hover:border-lime/40">
            <ChatIcon className="size-4" /> {t("chat.newChat")}
          </button>
          <p className="mb-1 px-2 text-xs font-semibold text-muted">{t("chat.askAbout")}</p>
          <ul className="flex flex-col">
            {topics.map((key) => (
              <li key={key}>
                <button type="button" onClick={() => send(t(`chat.${key}_q`))} disabled={busy}
                  className="flex min-h-10 w-full items-center rounded-lg px-2 text-left text-sm hover:bg-white/5">
                  {t(`chat.${key}`)}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {analysisId && (
            <p className="flex items-center justify-between gap-3 rounded-xl border border-haldi/40 bg-haldi-soft px-4 py-2 text-sm font-semibold">
              <span>{t("chat.aboutCheck")}</span>
              <Link href={`/farmer/analyses/${analysisId}`} className="min-h-10 content-center font-bold text-ink underline">
                {t("chat.viewCheck")}
              </Link>
            </p>
          )}

          {empty ? (
            <div className="pt-2 lg:pt-10">
              <h1 className="text-3xl font-semibold leading-[1.05] text-ink lg:text-5xl">{t("chat.heroTitle")}</h1>
              <p className="mt-3 max-w-xl text-muted">{analysisId ? t("chat.intro") : t("chat.heroSub")}</p>
              <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
                {(analysisId ? ["s_check"] : farmer ? ["s_farmer_1", "s_farmer_2", "s_farmer_3"] : ["s_buyer_1", "s_buyer_2"]).map((k) => (
                  <button key={k} type="button" onClick={() => send(t(`chat.${k}`))}
                    className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-black/10 px-3 text-sm backdrop-blur hover:border-lime/40">
                    <SparkIcon className="size-3 text-lime" /> {t(`chat.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div role="log" aria-live="polite" aria-label={t("chat.title")} className="flex flex-col gap-4 pb-2">
              {entries.map((e) => e.role === "user" ? (
                <p key={e.id} className="ml-10 self-end whitespace-pre-line rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-white">
                  {e.text}
                </p>
              ) : (
                <AssistantBubble key={e.id} reply={e.reply} onFollowUp={answerFollowUp} />
              ))}
              {busy && (
                <p className="flex items-center gap-3 text-muted" role="status">
                  <span className="grid size-8 place-items-center rounded-full bg-lime/15 text-lime"><SparkIcon className="size-4 animate-pulse" /></span>
                  {t("chat.thinking")}
                </p>
              )}
              <div ref={endRef} />
            </div>
          )}

          <FormError message={error} />
          {composer}

          {empty && (
            <div className="grid gap-3 sm:grid-cols-2">
              {farmer && (
                <FeatureCard href="/farmer/diagnose" icon={<LeafScanIcon className="size-5" />} action={t("chat.c_photo_action")}
                  title={t("chat.c_photo_title")} body={t("chat.c_photo_body")} />
              )}
              {canSpeak && (
                <FeatureCard onClick={listen} icon={<MicIcon className="size-5" />} action={t("chat.c_voice_action")}
                  title={t("chat.c_voice_title")} body={t("chat.c_voice_body")} />
              )}
              <FeatureCard onClick={() => send(t("chat.t_prices_q"))} icon={<PriceIcon className="size-5" />}
                action={t("chat.c_price_action")} title={t("chat.c_price_title")} body={t("chat.c_price_body")} />
              <FeatureCard onClick={() => send(t(farmer ? "chat.c_plan_q" : "chat.t_schemes_q"))}
                icon={farmer ? <SproutIcon className="size-5" /> : <SchemeIcon className="size-5" />}
                action={t("chat.c_plan_action")} title={t(farmer ? "chat.c_plan_title" : "chat.t_schemes")}
                body={t(farmer ? "chat.c_plan_body" : "chat.c_schemes_body")} />
            </div>
          )}
        </section>

        {/* Right rail: the farmer's recent leaf checks, each one tap from a chat about it. */}
        {farmer && (
          <aside className="hidden self-start lg:block">
            <h2 className="mb-3 text-base font-semibold text-ink">{t("chat.yourChecks")}</h2>
            {checks.length === 0 ? (
              <p className="glass rounded-2xl border border-white/10 p-4 text-sm text-muted">{t("home.noCheckYet")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {checks.map((a) => (
                  <li key={a.id} className="glass rounded-2xl border border-white/10 p-3">
                    <p className="text-xs text-muted">{isToday(a.created_at) ? t("chat.today") : dayFmt.format(new Date(a.created_at))}</p>
                    <p className="mt-0.5 flex items-center gap-2 font-semibold leading-snug">
                      <LeafScanIcon className="size-4 shrink-0 text-lime" /> {checkTitle(a)}
                    </p>
                    <Link href={`/assistant?analysis=${a.id}`} className="mt-2 inline-flex min-h-8 items-center text-sm font-semibold text-lime underline">
                      {t("chat.askAboutThis")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </Screen>
  );
}

// A different leaf check starts a fresh conversation instead of carrying the old one over.
function ChatForCheck() {
  return <Chat key={useSearchParams().get("analysis") ?? ""} />;
}

// The ?analysis= param is request data under cacheComponents, so the reader sits inside <Suspense>.
export default function AssistantPage() {
  return (
    <Suspense fallback={<Screen><Loading /></Screen>}>
      <ChatForCheck />
    </Suspense>
  );
}
