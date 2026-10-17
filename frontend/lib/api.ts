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
  init: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.form ? "POST" : "GET"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Network error");
  }
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

/** Where each role lands after logging in. */
export function homeFor(user: User): string {
  if (user.role === "farmer") return "/farmer";
  if (user.role === "customer") return "/market";
  return "/admin";
}
