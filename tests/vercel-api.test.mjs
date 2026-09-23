import assert from "node:assert/strict";
import test from "node:test";

import { HttpError } from "../api/_lib/http.js";
import {
  validateCompletion,
  validateSession,
  validateStimulusResponse,
} from "../api/_lib/validation.js";

const participantId = "123e4567-e89b-42d3-a456-426614174000";

test("validates a complete session payload", () => {
  const value = validateSession({
    participant_id: participantId,
    age_band: "25-34",
    visual_impairment: "No",
    visual_impairment_description: "discard this",
    stimulus_order: ["placeholder-001"],
    viewport_width: 390,
    viewport_height: 844,
    device_pixel_ratio: 3,
    user_agent: "Test browser",
  });

  assert.equal(value.participantId, participantId);
  assert.equal(value.visualImpairmentDescription, "");
  assert.deepEqual(value.stimulusOrder, ["placeholder-001"]);
});

test("validates stimulus response timing and variant", () => {
  const value = validateStimulusResponse({
    participant_id: participantId,
    stimulus_id: "placeholder-001",
    stimulus_variant: "mobile",
    response: "Yes",
    intended_stimulus_duration_ms: 1000,
    actual_stimulus_display_duration_ms: 1000.42,
  });

  assert.equal(value.stimulusVariant, "mobile");
  assert.equal(value.actualDisplayDurationMs, 1000.42);
});

test("rejects an unknown stimulus variant", () => {
  assert.throws(
    () =>
      validateStimulusResponse({
        participant_id: participantId,
        stimulus_id: "placeholder-001",
        stimulus_variant: "tablet",
        response: "No",
        actual_stimulus_display_duration_ms: 1000,
      }),
    HttpError,
  );
});

test("validates optional completion feedback", () => {
  const value = validateCompletion({
    participant_id: participantId,
    pilot_feedback: "",
    total_completion_time_seconds: 45.2,
  });

  assert.equal(value.pilotFeedback, "");
  assert.equal(value.totalCompletionTimeSeconds, 45.2);
});

test("loads every Vercel route module", async () => {
  const stimuliRoute = await import("../api/stimuli.js");
  const sessionRoute = await import("../api/session.js");
  const responseRoute = await import("../api/response.js");
  const completeRoute = await import("../api/complete.js");

  assert.equal(typeof stimuliRoute.GET, "function");
  assert.equal(typeof sessionRoute.POST, "function");
  assert.equal(typeof responseRoute.POST, "function");
  assert.equal(typeof completeRoute.POST, "function");
});
