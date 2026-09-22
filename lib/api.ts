import { ZodError, type ZodType } from "zod";

/** JSON response with no-store so dashboards always poll fresh data. */
export function json<T>(data: T, init: number | ResponseInit = 200): Response {
  const responseInit: ResponseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...responseInit, headers });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function apiError(status: number, message: string, details?: unknown): Response {
  return json({ error: message, details }, status);
}

/** Parses and validates a JSON body; throws ApiError(400) on failure. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "Validation failed",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

/** Wraps a handler so thrown ApiError / ZodError become clean JSON responses. */
export function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  return Promise.resolve()
    .then(fn)
    .catch((err: unknown) => {
      if (err instanceof ApiError) return apiError(err.status, err.message, err.details);
      if (err instanceof ZodError) return apiError(400, "Validation failed", err.issues);
      const message = err instanceof Error ? err.message : "Unexpected error";
      console.error("[api]", message);
      return apiError(500, "Internal error");
    });
}
