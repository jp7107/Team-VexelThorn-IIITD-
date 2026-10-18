"use client";

// One assistant turn: answer paragraphs, uncertainty chip, evidence, follow-ups, safety notes.
import type { Ref } from "react";
import { ArrowUpRightIcon, BotIcon, InfoIcon, AlertIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import type { ChatEvidence, ChatReply } from "@/lib/api";
import type { AssistantCopy } from "./copy";

const EVIDENCE_TYPES: ChatEvidence["type"][] = ["ml_prediction", "db_record", "kb_article", "llm_general"];

function uncertaintyTone(u: ChatReply["uncertainty"]): "good" | "info" | "guidance" | "neutral" {
  if (u === "low") return "good";
  if (u === "medium") return "info";
  if (u === "high") return "guidance";
  return "neutral";
}

function uncertaintyLabel(u: ChatReply["uncertainty"], copy: AssistantCopy): string {
  if (u === "low") return copy("uncertaintyLow");
  if (u === "medium") return copy("uncertaintyMedium");
  if (u === "high") return copy("uncertaintyHigh");
  return copy("uncertaintyUnknown");
}

function paragraphsOf(answer: string): string[] {
  return answer
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function AssistantReply({
  reply,
  copy,
  onFollowUp,
  containerRef,
}: {
  reply: ChatReply;
  copy: AssistantCopy;
  onFollowUp: (question: string) => void;
  containerRef?: Ref<HTMLElement>;
}) {
  const evidenceByType = EVIDENCE_TYPES.map((type) => ({
    type,
    items: reply.evidence.filter((e) => e.type === type),
  })).filter((group) => group.items.length > 0);

  return (
    <article className="km-ai-msg assistant" ref={containerRef} tabIndex={-1} aria-label={copy("assistant")}>
      <span className="km-ai-avatar" aria-hidden="true">
        <BotIcon size={17} />
      </span>
      <div className="km-ai-body">
        <div className="km-ai-meta">
          <span className="km-ai-who">{copy("assistant")}</span>
          <Badge
            tone={uncertaintyTone(reply.uncertainty)}
            title={`${copy("uncertainty")}: ${uncertaintyLabel(reply.uncertainty, copy)}`}
          >
            {copy("uncertainty")} · {uncertaintyLabel(reply.uncertainty, copy)}
          </Badge>
          {reply.llm_status === "fallback" && <span className="km-ai-fallback">{copy("fallbackNote")}</span>}
        </div>

        <div className="km-ai-bubble km-ai-answer">
          {paragraphsOf(reply.answer).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {evidenceByType.length > 0 && (
          <section className="km-ai-evidence" aria-label={copy("evidenceTitle")}>
            <h4 className="km-ai-subhead">{copy("evidenceTitle")}</h4>
            <ul>
              {evidenceByType.map((group) =>
                group.items.map((e, i) => {
                  const label = copy(`evidenceType.${group.type}`);
                  return (
                    <li key={`${group.type}-${i}`}>
                      <span className="km-ai-ev-type">{label}</span>
                      {e.url ? (
                        <a
                          className="km-linkish"
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${e.label} — ${copy("openLink")}`}
                        >
                          {e.label}
                          <ArrowUpRightIcon size={12} />
                        </a>
                      ) : (
                        <span className="km-ai-ev-label">{e.label}</span>
                      )}
                    </li>
                  );
                }),
              )}
            </ul>
          </section>
        )}

        {reply.safety_notes.length > 0 && (
          <section className="km-ai-safety" aria-label={copy("safetyTitle")} role="note">
            <span className="km-ai-safety-title">
              <AlertIcon size={13} />
              {copy("safetyTitle")}
            </span>
            <ul>
              {reply.safety_notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        {reply.follow_up_questions.length > 0 && (
          <div className="km-ai-followups">
            <span className="km-ai-subhead">{copy("followUps")}</span>
            <div className="km-ai-chips">
              {reply.follow_up_questions.map((q, i) => (
                <button key={i} type="button" className="km-ai-chip" onClick={() => onFollowUp(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/** Small status line used while a turn is in flight. */
export function AssistantThinking({ copy, slow }: { copy: AssistantCopy; slow: boolean }) {
  return (
    <div className="km-ai-msg assistant" aria-hidden="true">
      <span className="km-ai-avatar" aria-hidden="true">
        <BotIcon size={17} />
      </span>
      <div className="km-ai-body">
        <div className="km-ai-typing">
          <span className="km-ai-dot" />
          <span className="km-ai-dot" />
          <span className="km-ai-dot" />
          <span>{copy("thinking")}</span>
        </div>
        {slow && (
          <p className="km-ai-slow-note">
            <InfoIcon size={12} /> {copy("stillThinking")}
          </p>
        )}
      </div>
    </div>
  );
}
