#!/usr/bin/env python3
"""Small standard-library web server for the Experiment 002 pilot survey."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
CONFIG_FILE = ROOT / "config" / "stimuli.json"
DEFAULT_DATA_DIR = ROOT / "data" / "responses"
MAX_REQUEST_BYTES = 16_384
WRITE_LOCK = threading.Lock()

AGE_BANDS = {
    "Under 18",
    "18-24",
    "25-34",
    "35-44",
    "45-54",
    "55-64",
    "65+",
    "Prefer not to say",
}
VISUAL_IMPAIRMENTS = {
    "No",
    "Colour blindness / colour vision deficiency",
    "Other visual impairment",
    "Prefer not to say",
}
RESPONSES = {"Yes", "No"}
STIMULUS_VARIANTS = {"desktop", "mobile"}
ID_PATTERN = re.compile(r"[0-9a-f-]{36}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def load_stimuli() -> list[dict[str, str]]:
    with CONFIG_FILE.open(encoding="utf-8") as file:
        data = json.load(file)

    stimuli = data.get("stimuli")
    if not isinstance(stimuli, list) or not stimuli:
        raise ValueError("config/stimuli.json must contain a non-empty 'stimuli' list")

    seen: set[str] = set()
    validated = []
    for item in stimuli:
        if not isinstance(item, dict):
            raise ValueError("Each stimulus must be an object")
        stimulus_id = item.get("stimulus_id")
        if not isinstance(stimulus_id, str) or not stimulus_id.strip() or stimulus_id in seen:
            raise ValueError("Every stimulus_id must be a unique, non-empty string")

        seen.add(stimulus_id)
        validated_item = {"stimulus_id": stimulus_id}
        for image_field in ("desktop_image", "mobile_image"):
            image_file = item.get(image_field)
            if not isinstance(image_file, str) or not image_file.strip():
                raise ValueError(f"Stimulus {stimulus_id!r} needs a {image_field}")

            image_path = (PUBLIC_DIR / "stimuli" / image_file).resolve()
            stimuli_dir = (PUBLIC_DIR / "stimuli").resolve()
            if os.path.commonpath((str(stimuli_dir), str(image_path))) != str(stimuli_dir):
                raise ValueError(f"Stimulus {stimulus_id!r} has an unsafe {image_field}")
            if not image_path.is_file():
                raise ValueError(f"Stimulus image not found: {image_file}")
            validated_item[image_field] = f"stimuli/{image_file}"
        validated.append(validated_item)
    return validated


def valid_participant_id(value: object) -> bool:
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        return False
    try:
        return str(uuid.UUID(value)) == value
    except ValueError:
        return False


def require_text(payload: dict, field: str, allowed: set[str]) -> str:
    value = payload.get(field)
    if value not in allowed:
        raise ValueError(f"Invalid {field}")
    return value


def require_number(payload: dict, field: str, minimum: float, maximum: float) -> float:
    value = payload.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Invalid {field}")
    value = float(value)
    if not minimum <= value <= maximum:
        raise ValueError(f"Invalid {field}")
    return value


def session_path(data_dir: Path, participant_id: str) -> Path:
    return data_dir / f"{participant_id}.json"


def save_session(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.stem}-", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as file:
            json.dump(record, file, indent=2, ensure_ascii=False)
            file.write("\n")
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def make_handler(data_dir: Path, stimuli: list[dict[str, str]]):
    stimulus_ids = {item["stimulus_id"] for item in stimuli}

    class SurveyHandler(BaseHTTPRequestHandler):
        server_version = "JEPA-Survey"
        sys_version = ""

        def log_message(self, _format: str, *_args: object) -> None:
            # BaseHTTPRequestHandler logs client IP addresses; this survey does not.
            return

        def end_headers(self) -> None:
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self'; script-src 'self'; "
                "style-src 'self'; connect-src 'self'; object-src 'none'; "
                "base-uri 'none'; frame-ancestors 'none'",
            )
            super().end_headers()

        def send_json(self, status: HTTPStatus, body: dict) -> None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def read_json(self) -> dict:
            content_type = self.headers.get_content_type()
            if content_type != "application/json":
                raise ValueError("Content-Type must be application/json")
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError as error:
                raise ValueError("Invalid Content-Length") from error
            if content_length < 1 or content_length > MAX_REQUEST_BYTES:
                raise ValueError("Invalid request size")
            try:
                payload = json.loads(self.rfile.read(content_length))
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise ValueError("Invalid JSON") from error
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object")
            return payload

        def do_GET(self) -> None:
            path = urlsplit(self.path).path
            if path == "/api/stimuli":
                self.send_json(HTTPStatus.OK, {"stimuli": stimuli})
                return
            self.serve_static(path, include_body=True)

        def do_HEAD(self) -> None:
            self.serve_static(urlsplit(self.path).path, include_body=False)

        def serve_static(self, request_path: str, include_body: bool) -> None:
            relative = "index.html" if request_path == "/" else unquote(request_path).lstrip("/")
            candidate = (PUBLIC_DIR / relative).resolve()
            public = PUBLIC_DIR.resolve()
            if os.path.commonpath((str(public), str(candidate))) != str(public) or not candidate.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return

            content = candidate.read_bytes()
            content_type, _ = mimetypes.guess_type(candidate.name)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type or "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if include_body:
                self.wfile.write(content)

        def do_POST(self) -> None:
            path = urlsplit(self.path).path
            try:
                payload = self.read_json()
                if path == "/api/session":
                    self.create_session(payload)
                elif path == "/api/response":
                    self.record_response(payload)
                elif path == "/api/complete":
                    self.complete_session(payload)
                else:
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            except (BrokenPipeError, ConnectionResetError):
                return

        def get_participant_id(self, payload: dict) -> str:
            participant_id = payload.get("participant_id")
            if not valid_participant_id(participant_id):
                raise ValueError("Invalid participant_id")
            return participant_id

        def create_session(self, payload: dict) -> None:
            participant_id = self.get_participant_id(payload)
            age_band = require_text(payload, "age_band", AGE_BANDS)
            visual_impairment = require_text(
                payload, "visual_impairment", VISUAL_IMPAIRMENTS
            )
            description = payload.get("visual_impairment_description", "")
            if not isinstance(description, str) or len(description.strip()) > 200:
                raise ValueError("Invalid visual_impairment_description")
            description = description.strip() if visual_impairment == "Other visual impairment" else ""

            order = payload.get("stimulus_order")
            if (
                not isinstance(order, list)
                or len(order) != len(stimulus_ids)
                or any(not isinstance(item, str) for item in order)
                or set(order) != stimulus_ids
            ):
                raise ValueError("Invalid stimulus_order")

            viewport_width = require_number(payload, "viewport_width", 1, 20_000)
            viewport_height = require_number(payload, "viewport_height", 1, 20_000)
            device_pixel_ratio = require_number(payload, "device_pixel_ratio", 0.1, 20)
            user_agent = payload.get("user_agent")
            if not isinstance(user_agent, str) or len(user_agent) > 500:
                raise ValueError("Invalid user_agent")

            record = {
                "participant_id": participant_id,
                "age_band": age_band,
                "visual_impairment": visual_impairment,
                "visual_impairment_description": description,
                "stimulus_order": order,
                "stimulus_responses": [],
                "timestamp": utc_now(),
                "viewport_width": int(viewport_width),
                "viewport_height": int(viewport_height),
                "device_pixel_ratio": device_pixel_ratio,
                "user_agent": user_agent,
                "total_completion_time_seconds": None,
                "pilot_feedback": None,
                "completed_at": None,
            }
            path = session_path(data_dir, participant_id)
            with WRITE_LOCK:
                if path.exists():
                    self.send_json(HTTPStatus.CONFLICT, {"error": "Session already exists"})
                    return
                save_session(path, record)
            self.send_json(HTTPStatus.CREATED, {"ok": True})

        def record_response(self, payload: dict) -> None:
            participant_id = self.get_participant_id(payload)
            stimulus_id = payload.get("stimulus_id")
            if stimulus_id not in stimulus_ids:
                raise ValueError("Invalid stimulus_id")
            response = require_text(payload, "response", RESPONSES)
            stimulus_variant = require_text(
                payload, "stimulus_variant", STIMULUS_VARIANTS
            )
            duration_field = (
                "actual_stimulus_display_duration_ms"
                if "actual_stimulus_display_duration_ms" in payload
                else "stimulus_display_duration_ms"
            )
            display_duration = require_number(
                payload, duration_field, 0, 86_400_000
            )
            path = session_path(data_dir, participant_id)

            with WRITE_LOCK:
                if not path.is_file():
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "Session not found"})
                    return
                record = json.loads(path.read_text(encoding="utf-8"))
                if record["completed_at"] is not None:
                    self.send_json(HTTPStatus.CONFLICT, {"error": "Session already completed"})
                    return
                if any(item["stimulus_id"] == stimulus_id for item in record["stimulus_responses"]):
                    self.send_json(HTTPStatus.CONFLICT, {"error": "Response already recorded"})
                    return
                expected_id = record["stimulus_order"][len(record["stimulus_responses"])]
                if stimulus_id != expected_id:
                    raise ValueError("Response is out of order")
                record["stimulus_responses"].append(
                    {
                        "stimulus_id": stimulus_id,
                        "stimulus_variant": stimulus_variant,
                        "response": response,
                        "intended_stimulus_duration_ms": 1000,
                        "actual_stimulus_display_duration_ms": round(display_duration, 3),
                        "timestamp": utc_now(),
                    }
                )
                save_session(path, record)
            self.send_json(HTTPStatus.CREATED, {"ok": True})

        def complete_session(self, payload: dict) -> None:
            participant_id = self.get_participant_id(payload)
            feedback = payload.get("pilot_feedback", "")
            if not isinstance(feedback, str) or len(feedback.strip()) > 2_000:
                raise ValueError("Invalid pilot_feedback")
            completion_time = require_number(
                payload, "total_completion_time_seconds", 0, 86_400
            )
            path = session_path(data_dir, participant_id)

            with WRITE_LOCK:
                if not path.is_file():
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "Session not found"})
                    return
                record = json.loads(path.read_text(encoding="utf-8"))
                if record["completed_at"] is not None:
                    self.send_json(HTTPStatus.CONFLICT, {"error": "Session already completed"})
                    return
                answered = {item["stimulus_id"] for item in record["stimulus_responses"]}
                if answered != stimulus_ids:
                    raise ValueError("Not all stimuli have a response")
                record["pilot_feedback"] = feedback.strip()
                record["total_completion_time_seconds"] = round(completion_time, 3)
                record["completed_at"] = utc_now()
                save_session(path, record)
            self.send_json(HTTPStatus.OK, {"ok": True})

    return SurveyHandler


def build_server(host: str, port: int, data_dir: Path = DEFAULT_DATA_DIR) -> ThreadingHTTPServer:
    stimuli = load_stimuli()
    data_dir.mkdir(parents=True, exist_ok=True)
    return ThreadingHTTPServer((host, port), make_handler(data_dir, stimuli))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the JEPA Experiment 002 survey")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8002)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    server = build_server(args.host, args.port, args.data_dir.resolve())
    print(f"JEPA Experiment 002 is running at http://{args.host}:{server.server_port}")
    print(f"Responses will be stored in {args.data_dir.resolve()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
