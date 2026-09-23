import { errorResponse, jsonResponse, readJson } from "./_lib/http.js";
import { completeSession } from "./_lib/repository.js";
import { validateCompletion } from "./_lib/validation.js";

export async function POST(request) {
  try {
    const completion = validateCompletion(await readJson(request));
    await completeSession(completion);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
