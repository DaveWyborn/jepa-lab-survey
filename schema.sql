CREATE TABLE IF NOT EXISTS survey_sessions (
  participant_id uuid PRIMARY KEY,
  age_band text NOT NULL,
  visual_impairment text NOT NULL,
  visual_impairment_description text NOT NULL DEFAULT '',
  stimulus_order jsonb NOT NULL,
  session_timestamp timestamptz NOT NULL DEFAULT now(),
  viewport_width integer NOT NULL,
  viewport_height integer NOT NULL,
  device_pixel_ratio double precision NOT NULL,
  user_agent text NOT NULL,
  total_completion_time_seconds double precision,
  pilot_feedback text,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS stimulus_responses (
  participant_id uuid NOT NULL REFERENCES survey_sessions(participant_id) ON DELETE CASCADE,
  stimulus_index integer NOT NULL,
  stimulus_id text NOT NULL,
  stimulus_variant text NOT NULL CHECK (stimulus_variant IN ('desktop', 'mobile')),
  response text NOT NULL CHECK (response IN ('Yes', 'No')),
  intended_stimulus_duration_ms integer NOT NULL DEFAULT 1000,
  actual_stimulus_display_duration_ms double precision NOT NULL,
  response_timestamp timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, stimulus_id),
  UNIQUE (participant_id, stimulus_index)
);

CREATE INDEX IF NOT EXISTS stimulus_responses_stimulus_id_index
ON stimulus_responses (stimulus_id);

CREATE OR REPLACE VIEW survey_export AS
SELECT
  s.participant_id,
  s.age_band,
  s.visual_impairment,
  s.visual_impairment_description,
  r.stimulus_index,
  r.stimulus_id,
  r.stimulus_variant,
  r.response,
  r.intended_stimulus_duration_ms,
  r.actual_stimulus_display_duration_ms,
  r.response_timestamp,
  s.session_timestamp AS timestamp,
  s.viewport_width,
  s.viewport_height,
  s.device_pixel_ratio,
  s.user_agent,
  s.total_completion_time_seconds,
  s.pilot_feedback,
  s.completed_at
FROM survey_sessions AS s
LEFT JOIN stimulus_responses AS r
  ON r.participant_id = s.participant_id;
