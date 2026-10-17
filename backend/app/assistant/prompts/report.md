Write a short report for a farmer about one leaf photo, using only DATA below.

Return JSON with exactly these keys:
{
  "summary": "2-3 short sentences: what the model found and how sure it is",
  "symptoms_to_check": ["signs the farmer can look for, taken only from DATA articles; empty list if there are none"],
  "what_this_means": "1-2 sentences on what this result means and its limits (one photo, AI check, not a lab test)",
  "info_needed": ["up to 3 short questions or photos that would make the check more reliable"],
  "recommended_actions": [{"text": "one practical step", "evidence_ref": "a ref from DATA articles, or null for general advice"}],
  "safety_notes": ["short safety reminders"]
}

Limits: at most 5 items in each list; each string under 300 characters.
If the status is "uncertain", do not name any disease as the diagnosis; you may mention the possibilities as possibilities.

DATA:
{data}
