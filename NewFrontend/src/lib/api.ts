// Typed client for the verified Kisan Mitra FastAPI contract (backend/app/routers/*).
// All calls go same-origin through the Next rewrite at /api/*, so the httpOnly `session` cookie is sent
// and set without any CORS configuration. Every error carries the backend envelope
// {"error": {code, message, details, request_id}}.

export type UserRole = "farmer" | "customer" | "admin";

export type User = {
  id: string;
  name: string;
  role: UserRole;
  customer_type: "retail" | "wholesale" | null;
  language: "hi" | "en";
  state: string;
  district: string;
  lat: number | null;
  lon: number | null;
};

export type Crop = {
  id: string;
  crop_code: string;
  variety: string | null;
  area_acres: string;
  sowing_date: string;
  stage: "initial" | "development" | "mid" | "late";
  soil_type: string | null;
  created_at: string;
};

export type Reminder = {
  id: string;
  title: string;
  due_at: string;
  done_at: string | null;
  farm_crop_id: string | null;
  source: "user" | "system";
};

export type AnalysisStatus = "ok" | "uncertain" | "unsupported" | "rejected_quality" | "error";

/** GET/POST /analyses — immutable record of what the classifier said. */
export type Analysis = {
  id: string;
  status: AnalysisStatus;
  crop_code_claimed: string;
  farm_crop_id: string | null;
  prediction: {
    class_code: string;
    crop_code: string;
    name: string;
    name_hi: string;
    is_healthy: boolean;
  } | null;
  confidence: number | null;
  top_k: { class_code: string; p: number; name: string | null; name_hi: string | null }[];
  quality: { blur_var: number | null; brightness: number | null; passed: boolean; reasons: string[] };
  policy: { accept_threshold: number | null; uncertain_floor: number | null };
  model: { version: string; provenance: "trained_in_house" | "third_party_pretrained" | "mock" };
  message_key: string;
  latency_ms: number;
  created_at: string;
};

/** GET/POST /analyses/{id}/report */
export type ReportContent = {
  summary: string;
  symptoms_to_check: string[];
  what_this_means: string;
  info_needed: string[];
  recommended_actions: { text: string; evidence_ref: string | null }[];
  safety_notes: string[];
  consult_expert: boolean;
  sources: { name: string; url: string }[];
};

export type Report = {
  id: string;
  analysis_id: string;
  language: "hi" | "en";
  content: ReportContent;
  evidence: unknown[];
  llm_status: "ok" | "fallback";
  llm_model: string | null;
  created_at: string;
};

export type ChatEvidence = {
  type: "ml_prediction" | "db_record" | "kb_article" | "llm_general";
  ref: string | null;
  label: string;
  url: string | null;
};

/** POST /assistant/chat — last 10 turns only, must end with a user message. */
export type ChatReply = {
  answer: string;
  language: "hi" | "en";
  route: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  evidence: ChatEvidence[];
  uncertainty: "low" | "medium" | "high" | "unknown";
  follow_up_questions: string[];
  safety_notes: string[];
  llm_status: "ok" | "fallback";
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Unit = "kg" | "quintal" | "tonne" | "dozen";

export type Listing = {
  id: string;
  crop_code: string;
  title: string;
  description: string | null;
  quantity: string;
  unit: Unit;
  price_per_unit: string | null;
  min_order_qty: string | null;
  state: string;
  district: string;
  status: "open" | "closed" | "hidden";
  created_at: string;
  farmer: { id: string; first_name: string; rating_avg: number | null; rating_count: number };
  is_mine: boolean;
  pending_enquiries: number | null;
};

export type Enquiry = {
  id: string;
  listing_id: string;
  listing_title: string;
  crop_code: string;
  unit: Unit;
  quantity: string;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  created_at: string;
  responded_at: string | null;
  buyer_first_name: string;
  buyer_type: "retail" | "wholesale" | null;
  farmer_first_name: string;
  farmer_phone: string | null;
  can_rate: boolean;
  my_rating: number | null;
};

export type FarmerRatings = {
  farmer_id: string;
  avg: number | null;
  count: number;
  recent: { stars: number; comment: string | null; buyer_first_name: string; created_at: string }[];
};

export type PriceRow = {
  id: string;
  commodity: string;
  variety: string;
  market: string;
  district: string;
  state: string;
  arrival_date: string;
  min_price: string;
  max_price: string;
  modal_price: string;
  unit: string;
  source: string;
  fetched_at: string;
  is_demo: boolean;
  stale: boolean;
};

export type Prices = {
  meta: {
    commodity: string;
    source_status: "live" | "cached" | "demo" | "none";
    last_fetch_at: string | null;
    live_configured: boolean;
  };
  rows: PriceRow[];
};

export type Scheme = {
  id: string;
  name: string;
  summary: string;
  eligibility_text: string;
  benefit_text: string | null;
  official_url: string;
  states: string[];
  last_verified_at: string;
  published: boolean;
};

export type FarmUpdate = {
  id: string;
  title: string;
  body: string;
  source_url: string | null;
  published_at: string;
};

export type KbArticle = {
  id: string;
  title: string;
  body: string;
  topic: "disease" | "productivity" | "irrigation" | "general";
  language: "en" | "hi";
  disease_class_code: string | null;
  crop_code: string | null;
  source_name: string;
  source_url: string;
  verified_by: string;
  verified_at: string;
};

export type Ready = {
  db: "ok" | "error";
  model: { loaded: boolean; version?: string; provenance?: string; arch?: string };
  llm_configured: boolean;
};

/** Backend error envelope. status 0 = request never reached the server. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/v1";

type Init = { method?: string; body?: unknown; form?: FormData; timeoutMs?: number; signal?: AbortSignal };

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const { method, body, form, timeoutMs = 20_000, signal } = init;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: method ?? (form ? "POST" : "GET"),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      credentials: "same-origin",
      cache: "no-store",
      signal: signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ApiError(0, "TIMEOUT", "The request timed out.");
    }
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", "The server could not be reached.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "ERROR",
      err?.message ?? res.statusText ?? "Request failed",
      err?.request_id ?? res.headers.get("x-request-id"),
    );
  }
  return data as T;
}

/** Upload a leaf photo for diagnosis. Multipart per POST /analyses. */
export async function uploadAnalysis(
  file: File,
  cropCode: string,
  farmCropId?: string,
): Promise<Analysis> {
  const form = new FormData();
  form.set("image", file);
  form.set("crop_code", cropCode);
  if (farmCropId) form.set("farm_crop_id", farmCropId);
  return api<Analysis>("/analyses", { form, timeoutMs: 45_000 });
}

/** Where each role lands after login. */
export function homeFor(user: User): string {
  if (user.role === "farmer") return "/";
  if (user.role === "customer") return "/market";
  return "/admin";
}

/** Human message for an ApiError, without leaking internals. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return e.message;
    if (e.status === 401) return "Your session has expired. Please sign in again.";
    if (e.status === 403) return "Your account is not allowed to do that.";
    if (e.status === 404) return "That record could not be found.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
