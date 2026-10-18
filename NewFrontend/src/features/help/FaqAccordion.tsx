"use client";

import { useId, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";

export type FaqKey =
  | "photos"
  | "accuracy"
  | "reports"
  | "prices"
  | "contact"
  | "roles"
  | "assistant"
  | "language";

const FAQ_KEYS: FaqKey[] = ["photos", "accuracy", "reports", "prices", "contact", "roles", "assistant", "language"];

/**
 * Accordion built on native buttons + aria-expanded / aria-controls. Panels stay in the DOM (hidden) so the
 * control target always exists, and each heading is a real h3 so screen-reader users can skim the questions.
 * Several answers may be open at once; nothing is collapsed automatically.
 */
export function FaqAccordion() {
  const { t } = useI18n();
  const [open, setOpen] = useState<Set<FaqKey>>(() => new Set());

  function toggle(key: FaqKey) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="km-faq">
      {FAQ_KEYS.map((key) => {
        const expanded = open.has(key);
        return (
          <FaqItem
            key={key}
            faqKey={key}
            expanded={expanded}
            question={t(`help.faq.items.${key}.q`)}
            answer={t(`help.faq.items.${key}.a`)}
            onToggle={() => toggle(key)}
          />
        );
      })}
    </div>
  );
}

function FaqItem({
  faqKey,
  expanded,
  question,
  answer,
  onToggle,
}: {
  faqKey: FaqKey;
  expanded: boolean;
  question: string;
  answer: string;
  onToggle: () => void;
}) {
  const uid = useId();
  const buttonId = `${uid}-button`;
  const panelId = `${uid}-panel`;

  return (
    <div className={`km-faq-item${expanded ? " open" : ""}`} data-faq={faqKey}>
      <h3 className="km-faq-h">
        <button
          type="button"
          id={buttonId}
          className="km-faq-trigger"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="km-faq-q">{question}</span>
          <ChevronDownIcon size={16} className="km-faq-chevron" />
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={buttonId} className="km-faq-panel" hidden={!expanded}>
        <p>{answer}</p>
      </div>
    </div>
  );
}
