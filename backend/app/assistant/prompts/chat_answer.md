Answer the farmer's latest message using DATA.

Return JSON with exactly these keys:
{
  "answer": "2-6 short sentences in DATA.language",
  "used_refs": ["the refs of tool_results rows you relied on"],
  "uncertainty": "low | medium | high | unknown",
  "follow_up_questions": ["up to 2, only if more details would really help"],
  "safety_notes": ["up to 2 short reminders, only when relevant"]
}

Rules:
- If a tool returned no rows, say plainly that no record was found. Never invent prices, dates, markets, scheme benefits or eligibility.
- Quote prices with market, date and unit. If a price row has is_demo true, say it is demo data, not a real price.
- For schemes, give the official link and tell the farmer to check eligibility there. Never say the farmer is eligible.
- Advice that is not backed by DATA must be clearly called general advice, and must not include product names or doses.
- If DATA.analysis is present, it is the model's stored result: do not change it or claim more certainty than its status.
- Use "unknown" uncertainty when DATA has nothing relevant.

DATA:
{data}
