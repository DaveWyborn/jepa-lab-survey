from __future__ import annotations

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path


EXPERIMENT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EXPERIMENT_DIR))

import export_responses  # noqa: E402
import server  # noqa: E402


class SurveyTests(unittest.TestCase):
    def setUp(self):
        self.data_dir = EXPERIMENT_DIR / "data" / "_test_responses"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        for path in self.data_dir.glob("*.json"):
            path.unlink()
        self.httpd = server.build_server("127.0.0.1", 0, self.data_dir)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()
        for path in self.data_dir.glob("*.json"):
            path.unlink()

    def post(self, path, payload):
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.load(response)

    def test_stimulus_config_is_served(self):
        with urllib.request.urlopen(self.base_url + "/api/stimuli", timeout=5) as response:
            body = json.load(response)
        self.assertEqual(body["stimuli"][0]["stimulus_id"], "placeholder-001")
        self.assertEqual(
            body["stimuli"][0]["desktop_image"], "stimuli/placeholder-desktop.png"
        )
        self.assertEqual(
            body["stimuli"][0]["mobile_image"], "stimuli/placeholder-mobile.png"
        )

    def test_complete_survey_flow_and_export(self):
        participant_id = str(uuid.uuid4())
        status, _ = self.post(
            "/api/session",
            {
                "participant_id": participant_id,
                "age_band": "25-34",
                "visual_impairment": "No",
                "visual_impairment_description": "discarded",
                "stimulus_order": ["placeholder-001"],
                "viewport_width": 390,
                "viewport_height": 844,
                "device_pixel_ratio": 3,
                "user_agent": "Test browser",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(
            self.post(
                "/api/response",
                {
                    "participant_id": participant_id,
                    "stimulus_id": "placeholder-001",
                    "stimulus_variant": "mobile",
                    "actual_stimulus_display_duration_ms": 1000.4321,
                    "response": "Yes",
                },
            )[0],
            201,
        )
        self.assertEqual(
            self.post(
                "/api/complete",
                {
                    "participant_id": participant_id,
                    "pilot_feedback": "Nothing unclear.",
                    "total_completion_time_seconds": 12.3456,
                },
            )[0],
            200,
        )

        sessions = export_responses.load_sessions(self.data_dir)
        rows = list(export_responses.csv_rows(sessions))
        self.assertEqual(rows[0]["stimulus_id"], "placeholder-001")
        self.assertEqual(rows[0]["stimulus_variant"], "mobile")
        self.assertEqual(rows[0]["response"], "Yes")
        self.assertEqual(rows[0]["intended_stimulus_duration_ms"], 1000)
        self.assertEqual(
            rows[0]["actual_stimulus_display_duration_ms"], 1000.432
        )
        self.assertEqual(rows[0]["pilot_feedback"], "Nothing unclear.")
        self.assertEqual(sessions[0]["visual_impairment_description"], "")
        self.assertEqual(sessions[0]["total_completion_time_seconds"], 12.346)

    def test_invalid_demographic_value_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post(
                "/api/session",
                {
                    "participant_id": str(uuid.uuid4()),
                    "age_band": "Exact age: 32",
                    "visual_impairment": "No",
                    "stimulus_order": ["placeholder-001"],
                    "viewport_width": 1000,
                    "viewport_height": 700,
                    "device_pixel_ratio": 1,
                    "user_agent": "Test browser",
                },
            )
        self.assertEqual(context.exception.code, 400)

    def test_invalid_stimulus_variant_is_rejected(self):
        participant_id = str(uuid.uuid4())
        self.post(
            "/api/session",
            {
                "participant_id": participant_id,
                "age_band": "35-44",
                "visual_impairment": "No",
                "stimulus_order": ["placeholder-001"],
                "viewport_width": 1024,
                "viewport_height": 768,
                "device_pixel_ratio": 1,
                "user_agent": "Test browser",
            },
        )

        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post(
                "/api/response",
                {
                    "participant_id": participant_id,
                    "stimulus_id": "placeholder-001",
                    "stimulus_variant": "tablet",
                    "actual_stimulus_display_duration_ms": 1000,
                    "response": "No",
                },
            )
        self.assertEqual(context.exception.code, 400)

        record = json.loads(
            (self.data_dir / f"{participant_id}.json").read_text(encoding="utf-8")
        )
        self.assertEqual(record["stimulus_responses"], [])


if __name__ == "__main__":
    unittest.main()
