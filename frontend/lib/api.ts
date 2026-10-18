// Thin fetch wrapper for the FastAPI backend (same-origin via the /api rewrite).

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
  upi_id?: string | null;
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

export type CropUpdate = { id: string; condition: "good" | "concern" | "bad"; note: string | null; created_at: string };

export type Reminder = {
  id: string;
  title: string;
  due_at: string;
  done_at: string | null;
  farm_crop_id: string | null;
  source: "user" | "system";
};

/** Backend error envelope (plan §8.1). status 0 means the request never reached the server. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** `body` is sent as JSON; `form` as multipart (the browser sets the boundary header). */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData; timeoutMs?: number } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.form ? "POST" : "GET"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      credentials: "same-origin",
      signal: init.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new ApiError(0, "TIMEOUT", "Timed out");
    throw new ApiError(0, "NETWORK", "Network error");
  }
  // Logging in, registering or out changes who "me" is.
  if (path.startsWith("/auth/") && init.method === "POST") forgetMe();
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? res.statusText);
  }
  return data as T;
}

export type AnalysisStatus = "ok" | "uncertain" | "unsupported" | "rejected_quality" | "error";

/** Mirrors the backend inference contract (plan §8.3). */
export type Analysis = {
  id: string;
  status: AnalysisStatus;
  crop_code_claimed: string;
  farm_crop_id: string | null;
  prediction: { class_code: string; crop_code: string; name: string; name_hi: string; is_healthy: boolean } | null;
  confidence: number | null;
  top_k: { class_code: string; p: number; name: string | null; name_hi: string | null }[];
  quality: { blur_var: number | null; brightness: number | null; passed: boolean; reasons: string[] };
  policy: { accept_threshold: number | null; uncertain_floor: number | null };
  model: { version: string; provenance: "trained_in_house" | "third_party_pretrained" | "mock" };
  message_key: string;
  latency_ms: number;
  created_at: string;
};

/** Farmer report (plan §10.3). `result` is copied from the analysis; the rest is LLM or template text. */
export type Report = {
  id: string;
  analysis_id: string;
  language: "hi" | "en";
  llm_status: "ok" | "fallback";
  content: {
    summary: string;
    symptoms_to_check: string[];
    what_this_means: string;
    info_needed: string[];
    recommended_actions: { text: string; evidence_ref: string | null }[];
    safety_notes: string[];
    consult_expert: boolean;
    sources: { name: string; url: string }[];
  };
};

export type ChatEvidence = {
  type: "ml_prediction" | "db_record" | "kb_article" | "llm_general";
  ref: string | null;
  label: string;
  url: string | null;
};

/** Assistant reply (plan §8.4). */
export type ChatReply = {
  answer: string;
  language: "hi" | "en";
  route: string;
  evidence: ChatEvidence[];
  uncertainty: "low" | "medium" | "high" | "unknown";
  follow_up_questions: string[];
  safety_notes: string[];
  llm_status: "ok" | "fallback";
};

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
  status: "open" | "closed" | "hidden" | "sold_out";
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
  buyer_first_name: string;
  buyer_type: "retail" | "wholesale" | null;
  farmer_first_name: string;
  farmer_phone: string | null;
  can_rate: boolean;
  my_rating: number | null;
  order_id: string | null;
  order_status: OrderStatus | null;
};

export type OrderStatus = "awaiting_payment" | "payment_submitted" | "paid" | "dispatched" | "delivered" | "cancelled";
export type PayMethod = "online" | "upi" | "cash";

export type Order = {
  id: string;
  enquiry_id: string;
  listing_id: string;
  crop_code: string;
  title: string;
  unit: Unit;
  quantity: string;
  price_per_unit: string;
  subtotal: string;
  platform_fee: string;
  total: string;
  status: OrderStatus;
  payment_method: PayMethod | null;
  payment_ref: string | null;
  receipt_no: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  paid_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  role: "buyer" | "farmer" | "admin";
  buyer_name: string;
  buyer_district: string;
  farmer_name: string;
  farmer_district: string;
  farmer_phone: string | null;
  buyer_phone: string | null;
  farmer_upi_id: string | null;
  pay_methods: PayMethod[];
};

export type Receipt = { receipt_no: string; issued_at: string; order: Order };

/** Admin-maintained crop catalogue entry (GET /crops). */
export type CropType = {
  code: string;
  name_en: string;
  name_hi: string;
  mandi_commodity: string | null;
  marketplace: boolean;
  active: boolean;
  sort_order: number;
  leaf_check: boolean;
};

/** Admin-maintained platform parameters everyone may read (GET /config). */
export type PublicConfig = {
  helpline_number: string;
  helpline_short: string;
  helpline_open_hour: number;
  helpline_close_hour: number;
  helpline_languages: number;
  support_phone: string;
  support_email: string;
  platform_fee_percent: string;
  payment_methods: PayMethod[];
  assistant_enabled: boolean;
  show_demo_prices: boolean;
  announcement: string;
};

export type AdminSettings = Omit<PublicConfig, "payment_methods"> & {
  payments_online: boolean;
  payments_upi: boolean;
  payments_cash: boolean;
  unpaid_order_hours: number;
  online_gateway_configured: boolean;
};

export type Named = { key: string; label: string; value: string };

export type AdminStats = {
  days: number;
  totals: Record<string, string>;
  daily: { date: string; signups: number; orders: number; sales: string; leaf_checks: number; chats: number }[];
  funnel: Named[];
  orders_by_status: Named[];
  listings_by_crop: Named[];
  top_diseases: Named[];
  users_by_state: Named[];
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
  meta: { commodity: string; source_status: "live" | "cached" | "demo" | "none"; last_fetch_at: string | null; live_configured: boolean };
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

export type FarmUpdate = { id: string; title: string; body: string; source_url: string | null; published_at: string };

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

export type AdminUser = {
  id: string;
  name: string;
  role: UserRole;
  customer_type: "retail" | "wholesale" | null;
  state: string;
  district: string;
  is_active: boolean;
  created_at: string;
};

export type WaterEstimate = {
  crop_code: string;
  stage: Crop["stage"];
  kc: number;
  area_acres: number;
  location: { lat: number; lon: number };
  weather_status: "ok" | "unavailable";
  days: { date: string; et0_mm: number; rain_mm: number; crop_need_mm: number; net_mm: number }[];
  totals: { crop_need_mm: number; rain_mm: number; net_mm: number; litres_for_field: number } | null;
  method: string;
  sources: { name: string; url: string }[];
  label: "estimate";
};

let me: Promise<User> | null = null;

/** The logged-in user, fetched once per page load and shared by the app shell and the pages. */
export function getMe(): Promise<User> {
  me ??= api<User>("/auth/me").catch((e) => {
    me = null;
    throw e;
  });
  return me;
}

export function forgetMe() {
  me = null;
}

/** Where each role lands after logging in. */
export function homeFor(user: User): string {
  if (user.role === "farmer") return "/farmer";
  if (user.role === "customer") return "/market";
  return "/admin";
}
