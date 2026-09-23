import { HttpError } from "./http.js";
import { database } from "./database.js";

export async function createSession(session) {
  const sql = await database();
  const rows = await sql`
    INSERT INTO survey_sessions (
      participant_id,
      age_band,
      visual_impairment,
      visual_impairment_description,
      stimulus_order,
      viewport_width,
      viewport_height,
      device_pixel_ratio,
      user_agent
    )
    VALUES (
      ${session.participantId}::uuid,
      ${session.ageBand},
      ${session.visualImpairment},
      ${session.visualImpairmentDescription},
      ${JSON.stringify(session.stimulusOrder)}::jsonb,
      ${session.viewportWidth},
      ${session.viewportHeight},
      ${session.devicePixelRatio},
      ${session.userAgent}
    )
    ON CONFLICT (participant_id) DO NOTHING
    RETURNING participant_id
  `;

  if (rows.length !== 1) {
    throw new HttpError(409, "Session already exists");
  }
}

export async function recordStimulusResponse(item) {
  const sql = await database();
  const rows = await sql`
    WITH session_state AS (
      SELECT
        s.participant_id,
        s.stimulus_order,
        (
          SELECT count(*)::integer
          FROM stimulus_responses AS existing
          WHERE existing.participant_id = s.participant_id
        ) AS next_index
      FROM survey_sessions AS s
      WHERE s.participant_id = ${item.participantId}::uuid
        AND s.completed_at IS NULL
    )
    INSERT INTO stimulus_responses (
      participant_id,
      stimulus_index,
      stimulus_id,
      stimulus_variant,
      response,
      intended_stimulus_duration_ms,
      actual_stimulus_display_duration_ms
    )
    SELECT
      state.participant_id,
      state.next_index,
      ${item.stimulusId},
      ${item.stimulusVariant},
      ${item.response},
      1000,
      ${item.actualDisplayDurationMs}
    FROM session_state AS state
    WHERE state.stimulus_order ->> state.next_index = ${item.stimulusId}
    ON CONFLICT DO NOTHING
    RETURNING participant_id
  `;

  if (rows.length !== 1) {
    throw new HttpError(409, "Session is missing, completed, or the response is out of order");
  }
}

export async function completeSession(completion) {
  const sql = await database();
  const rows = await sql`
    UPDATE survey_sessions AS session
    SET
      pilot_feedback = ${completion.pilotFeedback},
      total_completion_time_seconds = ${completion.totalCompletionTimeSeconds},
      completed_at = now()
    WHERE session.participant_id = ${completion.participantId}::uuid
      AND session.completed_at IS NULL
      AND (
        SELECT count(*)
        FROM stimulus_responses AS response
        WHERE response.participant_id = session.participant_id
      ) = jsonb_array_length(session.stimulus_order)
    RETURNING participant_id
  `;

  if (rows.length !== 1) {
    throw new HttpError(409, "Session is missing, completed, or has unanswered stimuli");
  }
}
