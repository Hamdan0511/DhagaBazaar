/** Thin fetch wrapper for the Dhaaga Bazaar REST API. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

async function request<T>(method: string, url: string, body?: Json | FormData): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'dhaaga' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'We could not reach Dhaaga Bazaar. Check your connection and try again.', 'NETWORK');
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: Record<string, string[]> } } | null)?.error;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.code, err?.details);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: Json | FormData) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: Json) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: Json) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export const errorMessage = (e: unknown, fallback = 'Something went wrong. Please try again.') =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;

export function toQuery(params: Record<string, string | number | undefined | null | string[]>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
    } else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
