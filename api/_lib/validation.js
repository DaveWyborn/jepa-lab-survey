import { HttpError } from "./http.js";
import { getStimuli } from "./stimuli.js";

const ageBands = new Set([
  "Under 18",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
  "Prefer not to say",
]);

const visualImpairments = new Set([
  "No",
  "Colour blindness / colour vision deficiency",
  "Other visual impairment",
  "Prefer not to say",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function textFromSet(body, field, allowed) {
  if (!allowed.has(body[field])) {
    throw new HttpError(400, `Invalid ${field}`);
  }
  return body[field];
}

function boundedNumber(body, field, minimum, maximum) {
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new HttpError(400, `Invalid ${field}`);
  }
  return value;
}

export function participantId(body) {
  if (typeof body.participant_id !== "string" || !uuidPattern.test(body.participant_id)) {
    throw new HttpError(400, "Invalid participant_id");
  }
  return body.participant_id;
}

export function validateSession(body) {
  const id = participantId(body);
  const ageBand = textFromSet(body, "age_band", ageBands);
  const visualImpairment = textFromSet(body, "visual_impairment", visualImpairments);

  const description = body.visual_impairment_description || "";
  if (typeof description !== "string" || description.trim().length > 200) {
    throw new HttpError(400, "Invalid visual_impairment_description");
  }

  const configuredIds = getStimuli().map((item) => item.stimulus_id);
  const order = body.stimulus_order;
  if (
    !Array.isArray(order) ||
    order.length !== configuredIds.length ||
    order.some((item) => typeof item !== "string") ||
    new Set(order).size !== configuredIds.length ||
    configuredIds.some((item) => !order.includes(item))
  ) {
    throw new HttpError(400, "Invalid stimulus_order");
  }

  const userAgent = body.user_agent;
  if (typeof userAgent !== "string" || userAgent.length > 500) {
    throw new HttpError(400, "Invalid user_agent");
  }

  return {
    participantId: id,
    ageBand,
    visualImpairment,
    visualImpairmentDescription:
      visualImpairment === "Other visual impairment" ? description.trim() : "",
    stimulusOrder: order,
    viewportWidth: Math.round(boundedNumber(body, "viewport_width", 1, 20000)),
    viewportHeight: Math.round(boundedNumber(body, "viewport_height", 1, 20000)),
    devicePixelRatio: boundedNumber(body, "device_pixel_ratio", 0.1, 20),
    userAgent,
  };
}

export function validateStimulusResponse(body) {
  const id = participantId(body);
  const stimulusId = body.stimulus_id;
  const configuredIds = new Set(getStimuli().map((item) => item.stimulus_id));
  if (typeof stimulusId !== "string" || !configuredIds.has(stimulusId)) {
    throw new HttpError(400, "Invalid stimulus_id");
  }

  return {
    participantId: id,
    stimulusId,
    stimulusVariant: textFromSet(body, "stimulus_variant", new Set(["desktop", "mobile"])),
    response: textFromSet(body, "response", new Set(["Yes", "No"])),
    actualDisplayDurationMs: boundedNumber(
      body,
      "actual_stimulus_display_duration_ms",
      0,
      86400000,
    ),
  };
}

export function validateCompletion(body) {
  const feedback = body.pilot_feedback || "";
  if (typeof feedback !== "string" || feedback.trim().length > 2000) {
    throw new HttpError(400, "Invalid pilot_feedback");
  }

  return {
    participantId: participantId(body),
    pilotFeedback: feedback.trim(),
    totalCompletionTimeSeconds: boundedNumber(
      body,
      "total_completion_time_seconds",
      0,
      86400,
    ),
  };
}
