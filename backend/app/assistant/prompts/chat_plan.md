Decide which data the assistant needs to answer the farmer's latest message. Do not answer it yet.

Return JSON with exactly these keys:
{
  "tool_calls": [{"name": "a tool name from DATA.tools", "args": {"arg": "value"}}],
  "follow_up_questions": ["only if the message cannot be answered without more details from the farmer"]
}

Rules:
- Use only tools listed in DATA.tools, with only their listed args. At most 4 calls.
- Use English names for crops and commodities in args (for example "Tomato", "Potato", "Maize").
- If the farmer asks about "my crop", "my report" or a past check, use their crop or analysis tools.
- For any question about growing a crop, yield, fertiliser, watering, pests or a disease, also call search_knowledge with English keywords and the crop_code (lowercase, e.g. "tomato"), or get_disease_info for a named disease. Do this even when you also call the farmer's own tools.
- If key details are missing (which crop, which place, which growth stage) and no tool can supply them, return no tool calls and up to 2 short follow-up questions in DATA.language.
- For greetings or general farming questions that need no data, return two empty lists.

DATA:
{data}
