"""gapi.uz TTS (https://console.gapi.uz/docs/tts.html) -- o'zbekcha Zebo (ayol) va Doston (erkak) ovozlari.

Kalit: egasining BYOK kaliti, bo'lmasa tizim kaliti (GAPI_API_KEY).
POST /v1/tts -> 200 audio; 202 {"result_url"} -> tayyor bo'lguncha so'raladi. Matn 4000 belgigacha.
429 insufficient_balance -- kunlik balans tugagan; 429 rate_limited -- Retry-After kutiladi.
"""
import logging
import os
import re
import subprocess
import tempfile
import time

import httpx

from backend.config import get_settings
from backend.services import byok
from backend.services.gemini_quota_manager import chosen_provider
from backend.services.model_choice import GAPI_DEFAULT_STYLE, GAPI_STYLES
from backend.services.tts.base import PermanentTTSError, TTSOutOfCreditsError, TTSProvider

logger = logging.getLogger(__name__)

BASE_URL = "https://console.gapi.uz"
_MAX_ATTEMPTS = 4
_POLL_TIMEOUT_S = 180.0
_BRAND = re.compile(r"gapir\s?ai(?:\.uz)?", re.IGNORECASE)  # ovoz "AI"ni harflab noto'g'ri o'qiydi


def chosen_style(female: bool) -> str:
    gender = "female" if female else "male"
    return chosen_provider(gender) or GAPI_DEFAULT_STYLE[gender]


def _keys() -> list[str]:
    own = byok.active_keys("gapi")
    system = get_settings().GAPI_API_KEY.strip()
    return own or ([system] if system else [])


class GapiProvider(TTSProvider):
    @property
    def name(self) -> str:
        return "gapi"

    @property
    def cost_per_1k(self) -> float:
        return 3.2  # g (gapi birligi), 1000 belgi uchun -- hujjatdagi narx

    def is_available(self) -> bool:
        return bool(_keys())

    def _request(self, method: str, url: str, key: str, **kwargs):
        resp = None
        for attempt in range(_MAX_ATTEMPTS):
            resp = httpx.request(method, url, headers={"Authorization": f"Bearer {key}"}, timeout=150.0, **kwargs)
            code = _error(resp) if resp.status_code >= 400 else ""
            if code == "insufficient_balance":
                raise TTSOutOfCreditsError("gapi TTS: balans tugadi")
            if resp.status_code not in (429, 500, 503) or attempt == _MAX_ATTEMPTS - 1:
                return resp
            try:
                wait = min(max(float(resp.headers.get("retry-after", "3")), 1.0), 60.0)
            except ValueError:
                wait = 3.0
            time.sleep(wait)
        return resp

    def _audio(self, body: dict, key: str) -> bytes | None:
        resp = self._request("POST", f"{BASE_URL}/v1/tts", key, json=body)
        deadline = time.monotonic() + _POLL_TIMEOUT_S
        result_url = None
        while True:
            if resp.status_code in (401, 403):
                raise PermanentTTSError(f"gapi TTS: ruxsat xatosi ({resp.status_code}) {_error(resp)}")
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("audio/"):
                return resp.content
            if resp.status_code == 202:
                result_url = resp.json().get("result_url")
            elif resp.status_code != 200:
                logger.warning(f"gapi TTS: {resp.status_code} {_error(resp)}")
                return None
            # Token faqat gapi manziliga yuboriladi
            if not result_url or not result_url.startswith(f"{BASE_URL}/") or time.monotonic() > deadline:
                logger.warning("gapi TTS: natija olinmadi.")
                return None
            time.sleep(2.0)
            resp = self._request("GET", result_url, key)

    def synthesize(self, text: str, output_path: str, voice_name: str | None = None) -> bool:
        keys = _keys()
        clean = _BRAND.sub("Gapir ey-ay", (text or "").strip())
        if not keys or not clean:
            return False
        female = self._is_female(voice_name)
        body = {"text": clean[:4000], "voice": "zebo" if female else "doston",
                "format": "wav", "sample_rate": 24000, **GAPI_STYLES[chosen_style(female)]}
        audio = None
        for key in keys:  # bir kalit balansi tugasa keyingisi
            try:
                audio = self._audio(body, key)
                break
            except TTSOutOfCreditsError:
                if key == keys[-1]:
                    raise
            except httpx.HTTPError as exc:
                logger.warning(f"gapi TTS: ulanish xatosi: {type(exc).__name__}")
                return False
        if not audio or len(audio) < 100 or audio[:4] != b"RIFF":
            return False
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio)
                tmp_path = tmp.name
            subprocess.run(["ffmpeg", "-y", "-i", tmp_path, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", output_path],
                           check=True, capture_output=True)
        except subprocess.CalledProcessError:
            logger.warning("gapi TTS: ffmpeg konvertatsiya xatosi.")
            return False
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        return True


def _error(resp) -> str:
    try:
        return str(resp.json().get("error", ""))
    except Exception:
        return ""
