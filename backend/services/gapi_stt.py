"""gapi.uz nutqni tanish (https://console.gapi.uz/docs/api.html) -- o'zbekcha audio, BYOK kaliti bilan.

POST /v1/transcribe: 5 daqiqagacha, 200 -> natija; 202 {"job_id"} -> GET /v1/jobs/{id} so'raladi.
Narx: 1 daqiqa = 1 g (pullik opsiyalar o'chirib yuboriladi).
"""
import json
import logging
import time
from pathlib import Path

import httpx

from backend.services import byok

logger = logging.getLogger(__name__)

BASE_URL = "https://console.gapi.uz"
MAX_CHUNK_SECONDS = 280
_POLL_TIMEOUT_S = 600.0
# Yangi gapi loyihasida pullik opsiyalar yoqilgan (x1.2 va undan qimmat) -- dublyajga kerak emaslari o'chiriladi
_SETTINGS = {"formatting": True, "itn": True, "pii": False, "summary": False, "voice_events": False,
             "diarization": False, "gender": False, "speaker_roles": False, "speaker_identification": False,
             "call_outcome": False}


def transcribe_file(path: Path) -> dict:
    """{"text", "segments": [{"start","end","text"}], "audio_seconds"}"""
    keys = byok.active_keys("gapi")
    if not keys:
        raise RuntimeError("gapi kaliti yo'q")
    last = "javob yo'q"
    for key in keys:  # bir kalit balansi tugasa keyingisi
        headers = {"Authorization": f"Bearer {key}"}
        with open(path, "rb") as f:
            resp = httpx.post(f"{BASE_URL}/v1/transcribe", headers=headers, files={"file": (Path(path).name, f)},
                              data={"settings": json.dumps(_SETTINGS)}, timeout=240.0)
        if resp.status_code == 202:
            resp = _wait(resp.json()["job_id"], headers)
        if resp.status_code == 200:
            data = resp.json()
            byok.log_gapi_stt(data.get("audio_seconds") or 0)
            return data
        last = f"{resp.status_code} {resp.text[:150]}"
    raise RuntimeError(f"gapi STT: {last}")


def _wait(job_id: str, headers: dict):
    url = f"{BASE_URL}/v1/jobs/{job_id}"
    deadline = time.monotonic() + _POLL_TIMEOUT_S
    while time.monotonic() < deadline:
        time.sleep(2.0)
        state = httpx.get(url, headers=headers, timeout=30.0).raise_for_status().json().get("state")
        if state == "done":
            return httpx.get(f"{url}/result", headers=headers, timeout=60.0)
        if state in ("failed", "cancelled"):
            raise RuntimeError(f"gapi STT: vazifa {state}")
    raise RuntimeError("gapi STT: vaqt tugadi")
