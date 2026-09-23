import { errorResponse, jsonResponse, readJson } from "./_lib/http.js";
import { recordStimulusResponse } from "./_lib/repository.js";
import { validateStimulusResponse } from "./_lib/validation.js";

export async function POST(request) {
  try {
    const response = validateStimulusResponse(await readJson(request));
    await recordStimulusResponse(response);
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
