import { errorResponse, jsonResponse } from "./_lib/http.js";
import { getStimuli } from "./_lib/stimuli.js";

export function GET() {
  try {
    return jsonResponse({ stimuli: getStimuli() });
  } catch (error) {
    return errorResponse(error);
  }
}
