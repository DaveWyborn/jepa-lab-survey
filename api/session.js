import { errorResponse, jsonResponse, readJson } from "./_lib/http.js";
import { createSession } from "./_lib/repository.js";
import { validateSession } from "./_lib/validation.js";

export async function POST(request) {
  try {
    const session = validateSession(await readJson(request));
    await createSession(session);
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
