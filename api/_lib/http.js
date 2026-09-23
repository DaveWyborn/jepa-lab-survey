export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }

  const text = await request.text();
  if (!text || text.length > 16384) {
    throw new HttpError(400, "Invalid request size");
  }

  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error();
    }
    return value;
  } catch (_error) {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message }, error.status);
  }
  if (error instanceof Error && error.message === "DATABASE_URL is not configured") {
    return jsonResponse({ error: "Response storage is not configured." }, 503);
  }
  return jsonResponse({ error: "The response could not be saved. Please try again." }, 500);
}
