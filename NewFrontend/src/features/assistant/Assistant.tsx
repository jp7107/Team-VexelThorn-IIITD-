"use client";

// AI assistant chat. One verified endpoint: POST /assistant/chat with the last 10 turns, the active UI
// language, and (farmers only) an optional analysis_id used as context.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  ArrowRightIcon,
  BotIcon,
  CloseIcon,
  InfoIcon,
  LeafIcon,
  SendIcon,
  SparklesIcon,
} from "@/components/icons";
import { Badge, Button, LoadingBlock, Panel } from "@/components/ui";
import {
  ApiError,
  api,
  type Analysis,
  type ChatMessage,
  type ChatReply,
  type User,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useI18n } from "@/lib/i18n";
import { analysisStatusLabel, cropLabel, shortDate } from "@/lib/format";
import { useAssistantCopy } from "./copy";
import { AssistantReply, AssistantThinking } from "./AssistantReply";
import "./assistant.css";

const MAX_TURNS = 10;
const MAX_CHARS = 1000;
const TIMEOUT_MS = 40_000;
const SLOW_AFTER_MS = 8_000;

type Turn =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; reply: ChatReply };

let turnSeq = 0;
function nextId(): string {
  turnSeq += 1;
  return `t${turnSeq}-${Date.now()}`;
}

/** Fold the visible thread into the wire shape: last 10 turns, assistant turns send their answer. */
function toPayload(turns: Turn[]): ChatMessage[] {
  return turns.slice(-MAX_TURNS).map((turn) =>
    turn.role === "user"
      ? { role: "user", content: turn.content }
      : { role: "assistant", content: turn.reply.answer.slice(0, MAX_CHARS) },
  );
}

export function Assistant({ user }: { user: User }) {
  const { lang } = useI18n();
  const copy = useAssistantCopy();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [analysisId, setAnalysisId] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastReplyRef = useRef<HTMLElement | null>(null);
  const focusNextReply = useRef(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);

  // GET /me/analyses is farmer-only on the backend; other roles get no context selector.
  const analyses = useApi<Analysis[]>(
    user.role === "farmer" ? "/me/analyses?limit=20" : null,
  );
  const analysisOptions = useMemo(() => analyses.data ?? [], [analyses.data]);
  const selected = analysisOptions.find((a) => a.id === analysisId) ?? null;

  const clearSlowTimer = useCallback(() => {
    if (slowTimer.current) {
      clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  // Keep the newest turn in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, sending]);

  const send = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      if (!text || sending) return;
      const content = text.slice(0, MAX_CHARS);

      const userTurn: Turn = { id: nextId(), role: "user", content };
      const history = [...turns, userTurn];
      const payloadMessages = toPayload(history);
      // The backend requires the last turn to be the user's; send() only ever appends one.
      if (payloadMessages.at(-1)?.role !== "user") return;

      setTurns(history);
      setDraft("");
      setError(null);
      setSending(true);
      setSlow(false);
      clearSlowTimer();
      slowTimer.current = setTimeout(() => {
        if (alive.current) setSlow(true);
      }, SLOW_AFTER_MS);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const reply = await api<ChatReply>("/assistant/chat", {
          method: "POST",
          body: {
            messages: payloadMessages,
            language: lang,
            ...(user.role === "farmer" && analysisId ? { analysis_id: analysisId } : {}),
          },
          timeoutMs: TIMEOUT_MS,
          signal: controller.signal,
        });
        if (!alive.current) return;
        focusNextReply.current = true;
        setTurns((prev) => [...prev, { id: nextId(), role: "assistant", reply }]);
        setAnnouncement(`${copy("assistant")}: ${reply.answer.slice(0, 280)}`);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!alive.current) return;
        // Drop the optimistic turn so the next request does not end with two user turns.
        setTurns((prev) => prev.filter((t) => t.id !== userTurn.id));
        setDraft((prev) => (prev.trim() ? prev : content));
        setError(describeChatError(e, copy));
        composerRef.current?.focus();
      } finally {
        if (alive.current) {
          setSending(false);
          setSlow(false);
        }
        clearSlowTimer();
        abortRef.current = null;
      }
    },
    [draft, sending, turns, lang, analysisId, user.role, copy, clearSlowTimer],
  );

  // Move focus to a fresh reply once it lands, so keyboard users land on the new answer.
  useEffect(() => {
    if (!focusNextReply.current) return;
    focusNextReply.current = false;
    lastReplyRef.current?.focus({ preventScroll: true });
  }, [turns.length]);

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const onFollowUp = (question: string) => {
    setDraft(question.slice(0, MAX_CHARS));
    setError(null);
    composerRef.current?.focus();
  };

  const onStarter = (question: string) => {
    void send(question);
  };

  const clearConversation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearSlowTimer();
    setTurns([]);
    setDraft("");
    setError(null);
    setSending(false);
    setSlow(false);
    setAnnouncement(copy("cleared"));
    composerRef.current?.focus();
  };

  const starters = [copy("starterDisease"), copy("starterPrice"), copy("starterScheme"), copy("starterIrrigation")];
  const composerId = useId();
  const hintId = `${composerId}-hint`;
  const countId = `${composerId}-count`;
  const overLimit = draft.length > MAX_CHARS;

  const lastTurn = turns.at(-1);
  const showStarters = turns.length === 0;

  return (
    <div className="km-assistant">
      <header className="km-ai-head">
        <div className="km-ai-head-text">
          <h1 className="km-ai-title">
            <SparklesIcon size={19} />
            {copy("title")}
          </h1>
          <p className="km-caption">{copy("subtitle")}</p>
        </div>
        <div className="km-ai-head-actions">
          <Badge tone="neutral" title={copy("memoryBadge")}>
            {copy("memoryBadge")}
          </Badge>
          <Button variant="secondary" size="sm" onClick={clearConversation} disabled={sending || turns.length === 0}>
            <CloseIcon size={14} />
            {copy("clear")}
          </Button>
        </div>
      </header>

      <div className="km-ai-grid">
        <section className="km-panel km-ai-chat" aria-label={copy("conversation")}>
          <div ref={scrollRef} className="km-ai-thread" role="log" aria-label={copy("conversation")}>
            {showStarters && (
              <div className="km-ai-empty">
                <span className="km-ai-empty-icon" aria-hidden="true">
                  <BotIcon size={24} />
                </span>
                <h2 className="km-ai-empty-title">{copy("emptyTitle")}</h2>
                <p className="km-caption">{copy("emptyHint")}</p>
                <div className="km-ai-starters" role="group" aria-label={copy("startersLabel")}>
                  {starters.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="km-ai-starter"
                      onClick={() => onStarter(q)}
                      disabled={sending}
                    >
                      <span>{q}</span>
                      <ArrowRightIcon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="km-ai-msg user">
                  <div className="km-ai-bubble km-ai-user-bubble">{turn.content}</div>
                  <span className="km-ai-avatar user" aria-hidden="true">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>
              ) : (
                <AssistantReply
                  key={turn.id}
                  reply={turn.reply}
                  copy={copy}
                  onFollowUp={onFollowUp}
                  containerRef={
                    turn === lastTurn && !sending
                      ? (el: HTMLElement | null) => {
                          lastReplyRef.current = el;
                        }
                      : undefined
                  }
                />
              ),
            )}

            {sending && <AssistantThinking copy={copy} slow={slow} />}
            <div ref={endRef} />
          </div>

          {/* Polite live region: the reply is also focusable, this covers the in-between states. */}
          <div className="km-sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>

          {error && (
            <div className="km-ai-error" role="alert">
              <span className="km-ai-error-title">
                <AlertIcon size={14} />
                {copy("errorTitle")}
              </span>
              <span>{error}</span>
              <span className="km-footnote">{copy("errorRestored")}</span>
            </div>
          )}

          <div className="km-ai-composer">
            <label htmlFor={composerId} className="km-label">
              {copy("composerLabel")}
            </label>
            <div className={`km-ai-input-wrap${overLimit ? " invalid" : ""}`}>
              <textarea
                id={composerId}
                ref={composerRef}
                className="km-ai-input"
                rows={3}
                value={draft}
                maxLength={MAX_CHARS}
                placeholder={copy("composerPlaceholder")}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKeyDown}
                disabled={sending}
                aria-describedby={`${hintId} ${countId}`}
                aria-invalid={overLimit || undefined}
              />
              <div className="km-ai-composer-foot">
                <span id={hintId} className="km-hint">
                  {copy("enterHint")}
                </span>
                <span
                  id={countId}
                  className={`km-ai-count${draft.length > MAX_CHARS * 0.9 ? " near" : ""}`}
                  aria-live="off"
                >
                  {copy("charCount", { count: draft.length })}
                </span>
              </div>
            </div>
            <div className="km-ai-composer-actions">
              <Button onClick={() => void send()} disabled={sending || draft.trim().length === 0}>
                <SendIcon size={15} />
                {sending ? copy("sending") : copy("send")}
              </Button>
            </div>
          </div>
        </section>

        <aside className="km-ai-rail">
          {user.role === "farmer" && (
            <Panel title={copy("contextTitle")} icon={<LeafIcon size={16} />}>
              <div className="km-field">
                <select
                  id="km-ai-analysis"
                  className="km-select"
                  value={analysisId}
                  onChange={(e) => setAnalysisId(e.target.value)}
                  disabled={analyses.loading || sending}
                  aria-label={copy("contextTitle")}
                  aria-describedby="km-ai-analysis-hint"
                >
                  <option value="">{copy("contextNone")}</option>
                  {analysisOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {copy("contextOption", {
                        crop: cropLabel(a.crop_code_claimed, lang),
                        status: analysisStatusLabel(a.status, lang),
                        when: shortDate(a.created_at, lang),
                      })}
                    </option>
                  ))}
                </select>
                <span id="km-ai-analysis-hint" className="km-hint">
                  {copy("contextHint")}
                </span>

                {analyses.loading && <LoadingBlock lines={1} height={12} />}
                {analyses.error && (
                  <p className="km-error" role="alert">
                    {copy("contextError")}
                  </p>
                )}
                {!analyses.loading && !analyses.error && analysisOptions.length === 0 && (
                  <p className="km-hint">{copy("contextEmpty")}</p>
                )}

                {selected && (
                  <div className="km-ai-context-pill">
                    <span>
                      {copy("usingContext", {
                        label: `${cropLabel(selected.crop_code_claimed, lang)} · ${shortDate(selected.created_at, lang)}`,
                      })}
                    </span>
                    <button
                      type="button"
                      className="km-linkish"
                      onClick={() => setAnalysisId("")}
                      aria-label={copy("contextClear")}
                    >
                      {copy("contextClear")}
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          )}

          <Panel title={copy("goodToKnow")} icon={<InfoIcon size={16} />}>
            <ul className="km-ai-notes">
              <li>{copy("note1")}</li>
              <li>{copy("note2")}</li>
              <li>{copy("note3")}</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/** Map the API envelope onto honest, localised copy. */
function describeChatError(e: unknown, copy: ReturnType<typeof useAssistantCopy>): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return copy("sessionExpired");
    if (e.status === 422) return copy("validation");
    if (e.status === 0) return e.code === "TIMEOUT" ? copy("timeout") : copy("offline");
    return copy("serverError");
  }
  const message = e instanceof Error ? e.message : "";
  return message || copy("serverError");
}
