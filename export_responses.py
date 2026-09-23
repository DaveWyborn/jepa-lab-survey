#!/usr/bin/env python3
"""Export Experiment 002 session files as JSON or analysis-ready CSV."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = ROOT / "data" / "responses"

CSV_FIELDS = [
    "participant_id",
    "age_band",
    "visual_impairment",
    "visual_impairment_description",
    "stimulus_id",
    "stimulus_variant",
    "response",
    "intended_stimulus_duration_ms",
    "actual_stimulus_display_duration_ms",
    "response_timestamp",
    "timestamp",
    "viewport_width",
    "viewport_height",
    "device_pixel_ratio",
    "user_agent",
    "total_completion_time_seconds",
    "pilot_feedback",
    "completed_at",
]


def load_sessions(data_dir: Path) -> list[dict]:
    sessions = []
    for path in sorted(data_dir.glob("*.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f"Could not read {path.name}: {error}") from error
        if not isinstance(value, dict):
            raise ValueError(f"{path.name} does not contain a JSON object")
        sessions.append(value)
    return sessions


def csv_rows(sessions: list[dict]):
    for session in sessions:
        responses = session.get("stimulus_responses") or [{}]
        for response in responses:
            yield {
                "participant_id": session.get("participant_id"),
                "age_band": session.get("age_band"),
                "visual_impairment": session.get("visual_impairment"),
                "visual_impairment_description": session.get("visual_impairment_description"),
                "stimulus_id": response.get("stimulus_id"),
                "stimulus_variant": response.get("stimulus_variant"),
                "response": response.get("response"),
                "intended_stimulus_duration_ms": response.get(
                    "intended_stimulus_duration_ms", 1000
                ),
                "actual_stimulus_display_duration_ms": response.get(
                    "actual_stimulus_display_duration_ms",
                    response.get("stimulus_display_duration_ms"),
                ),
                "response_timestamp": response.get("timestamp"),
                "timestamp": session.get("timestamp"),
                "viewport_width": session.get("viewport_width"),
                "viewport_height": session.get("viewport_height"),
                "device_pixel_ratio": session.get("device_pixel_ratio"),
                "user_agent": session.get("user_agent"),
                "total_completion_time_seconds": session.get("total_completion_time_seconds"),
                "pilot_feedback": session.get("pilot_feedback"),
                "completed_at": session.get("completed_at"),
            }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Experiment 002 responses")
    parser.add_argument("--format", choices=("csv", "json"), required=True)
    parser.add_argument("--output", type=Path, help="Output file; defaults to standard output")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    try:
        sessions = load_sessions(args.data_dir)
    except ValueError as error:
        parser.error(str(error))

    output = args.output.open("w", encoding="utf-8", newline="") if args.output else sys.stdout
    try:
        if args.format == "json":
            json.dump(sessions, output, indent=2, ensure_ascii=False)
            output.write("\n")
        else:
            writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(csv_rows(sessions))
    finally:
        if args.output:
            output.close()


if __name__ == "__main__":
    main()
