/**
 * The only place this app talks to the backend.
 *
 * Runs server-side exclusively — from route handlers and server components.
 * The browser never reaches the API directly, which is what lets the session
 * tokens stay in httpOnly cookies.
 */

export const API_URL = (process.env.API_URL ?? "http://localhost:4100").replace(
  /\/$/,
  "",
);

export type ApiResponse = {
  status: number;
  /** Parsed JSON, or null for an empty body (204). */
  body: unknown;
};

export type ApiInit = {
  method?: "GET" | "POST";
  body?: unknown;
  /** Sent as `Authorization: Bearer …`. */
  accessToken?: string | null;
  /** Sent as the reCAPTCHA header the backend guard reads. */
  captchaToken?: string | null;
};

/**
 * Calls the API and hands back status + parsed body without throwing.
 *
 * Proxy routes forward both verbatim, so a validation message written once in
 * the backend reaches the user unchanged instead of being flattened into a
 * generic failure somewhere in the middle.
 */
export async function callApi(
  path: string,
  init: ApiInit = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.accessToken) headers["Authorization"] = `Bearer ${init.accessToken}`;
  if (init.captchaToken) headers["x-recaptcha-token"] = init.captchaToken;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch (err) {
    console.error(`Cannot reach the API at ${API_URL}${path}:`, err);
    return {
      status: 503,
      body: { error: "The service is unavailable. Please try again shortly." },
    };
  }

  if (res.status === 204) return { status: 204, body: null };

  const text = await res.text();
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } catch {
    console.error(`Non-JSON response from ${path}:`, text.slice(0, 200));
    return {
      status: res.status,
      body: { error: "The service returned an unexpected response." },
    };
  }
}

/**
 * Convenience for server components: returns the typed body on success, null on
 * any failure. Use `callApi` when the caller needs the status or the message.
 */
export async function apiGet<T>(
  path: string,
  accessToken?: string | null,
): Promise<T | null> {
  const { status, body } = await callApi(path, { accessToken });
  return status >= 200 && status < 300 ? (body as T) : null;
}

/** Pulls the human-readable message out of an error body. */
export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const message = (body as { error?: unknown }).error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}
