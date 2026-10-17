import type {
  PeopleCourtEvidenceSubmission,
  PeopleCourtPartnerTransport,
  PreparedAdjudicationFiling,
} from "./types.js";

export interface PeopleCourtHttpTransportOptions {
  /** Forum origin, for example `https://peoplescourt.ai`. */
  baseUrl: string;
  /** Partner credential with filing authority (`Authorization: Bearer`). */
  apiKey: string;
  fetch?: typeof fetch;
}

/** RFC 9457 problem returned by the People’s Court API. */
export class PeopleCourtApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  /** Seconds from a `Retry-After` header, for 429 and 503 responses. */
  readonly retryAfterSeconds?: number;
  /**
   * The full problem body. For `acceptance_required`, `details` carries a
   * fresh `hostedAcceptanceUrl` (relative to the forum origin).
   */
  readonly problem: Record<string, unknown>;

  constructor(status: number, problem: Record<string, unknown>, retryAfterSeconds?: number) {
    const detail = typeof problem.detail === "string" ? problem.detail : "";
    const code = typeof problem.code === "string" ? problem.code : undefined;
    super(`People’s Court API ${status}${code ? ` ${code}` : ""}${detail ? `: ${detail}` : ""}`);
    this.name = "PeopleCourtApiError";
    this.status = status;
    this.problem = problem;
    if (code !== undefined) this.code = code;
    if (typeof problem.requestId === "string") this.requestId = problem.requestId;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The API's Idempotency-Key grammar. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

function segment(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return encodeURIComponent(value);
}

/**
 * HTTP transport for the canonical People’s Court partner operations:
 * `POST /api/filings`, `GET /api/filings/{id}`,
 * `POST /api/filings/{id}/confirmations`, `POST /api/cases/{id}/submissions`,
 * `GET /api/cases/{id}` and `GET /api/cases/{id}/award`.
 */
export function createPeopleCourtHttpTransport(
  options: PeopleCourtHttpTransportOptions,
): PeopleCourtPartnerTransport {
  const base = new URL(options.baseUrl);
  // Keep any deployment path prefix: resolve operation paths below it.
  if (!base.pathname.endsWith("/")) base.pathname = `${base.pathname}/`;
  base.search = "";
  base.hash = "";
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
    throw new Error("baseUrl must use https outside localhost.");
  }
  if (!options.apiKey) throw new Error("apiKey is required.");
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    init: { json?: unknown; form?: FormData; idempotencyKey?: string; headers?: Record<string, string> } = {},
  ): Promise<{ data: T; requestId?: string }> {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${options.apiKey}`,
      ...init.headers,
    };
    if (init.idempotencyKey !== undefined) {
      if (!IDEMPOTENCY_KEY.test(init.idempotencyKey)) {
        throw new Error("idempotencyKey must be 8-128 characters from A-Z, a-z, 0-9, '.', '_', ':' and '-'.");
      }
      headers["idempotency-key"] = init.idempotencyKey;
    }
    let body: string | FormData | undefined;
    if (init.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form;
    }
    const response = await doFetch(new URL(path, base), {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      // Never forward the credential or replay a mutation to a redirect target.
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      throw new Error(
        `People’s Court API ${method} ${path} redirected${location ? ` to ${location}` : ""}; set baseUrl to the forum's canonical origin.`,
      );
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { detail: text.slice(0, 500) };
    }
    if (!response.ok) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new PeopleCourtApiError(
        response.status,
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {},
        Number.isFinite(retryAfter) && retryAfter >= 0 && response.headers.has("retry-after") ? retryAfter : undefined,
      );
    }
    const envelope = parsed as { data?: T; requestId?: string };
    if (!envelope || typeof envelope !== "object" || envelope.data === undefined) {
      throw new Error(`People’s Court API ${method} ${path} returned no data.`);
    }
    return {
      data: envelope.data,
      ...(typeof envelope.requestId === "string" ? { requestId: envelope.requestId } : {}),
    };
  }

  function withAbsoluteAcceptanceUrl(filing: PreparedAdjudicationFiling): PreparedAdjudicationFiling {
    if (typeof filing.hostedAcceptanceUrl !== "string") return filing;
    return { ...filing, hostedAcceptanceUrl: new URL(filing.hostedAcceptanceUrl, base).toString() };
  }

  function submissionForm(input: PeopleCourtEvidenceSubmission): FormData {
    const form = new FormData();
    form.set("party", input.party);
    form.set("brief", input.brief);
    for (const file of input.files ?? []) {
      // Copy into a plain ArrayBuffer so every Blob implementation accepts it.
      const bytes = new Uint8Array(file.bytes.byteLength);
      bytes.set(file.bytes);
      form.append("files", new Blob([bytes.buffer], { type: file.mediaType }), file.filename);
    }
    return form;
  }

  return {
    async prepareFiling(input, idempotencyKey) {
      const response = await request<PreparedAdjudicationFiling>("POST", "api/filings", { json: input, idempotencyKey });
      return { ...response, data: withAbsoluteAcceptanceUrl(response.data) };
    },
    getFiling(draftId) {
      return request("GET", `api/filings/${segment(draftId, "draftId")}`);
    },
    confirmFiling(draftId, input, idempotencyKey) {
      return request("POST", `api/filings/${segment(draftId, "draftId")}/confirmations`, { json: input, idempotencyKey });
    },
    submitEvidence(caseId, input, idempotencyKey) {
      return request("POST", `api/cases/${segment(caseId, "caseId")}/submissions`, {
        form: submissionForm(input),
        idempotencyKey,
        headers: { "x-pc-party": input.party },
      });
    },
    getCase(caseId) {
      return request("GET", `api/cases/${segment(caseId, "caseId")}`);
    },
    getServedAward(caseId) {
      return request("GET", `api/cases/${segment(caseId, "caseId")}/award`);
    },
  };
}
