import os
import re
import shutil
import subprocess
import uuid
from typing import Any, Dict, Optional

import requests
import yt_dlp

COOKIES_PATH = os.getenv("YOUTUBE_COOKIES_PATH")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/app/outputs")

# FastSaver sozlamalari (.env orqali o'zgartirish mumkin)
FASTSAVER_DEFAULT_BASE = "https://api.fastsaver.io/v1"
# DIQQAT: yuklash endpointi nomini FastSaver hujjatidan tekshiring!
FASTSAVER_INFO_PATH = os.getenv("FASTSAVER_INFO_PATH", "/youtube/info")
FASTSAVER_DOWNLOAD_PATH = os.getenv("FASTSAVER_DOWNLOAD_PATH", "/youtube/download")

URL_KEYS = ("download_url", "url", "link", "file_url", "video_url", "direct_url")


# ----------------------------------------------------------------------
# Yordamchi funksiyalar
# ----------------------------------------------------------------------
def _extract_video_id(url: str) -> Optional[str]:
    m = re.search(
        r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", url
    )
    return m.group(1) if m else None


def _normalize_youtube_url(url: str) -> str:
    """&t=1s kabi qo'shimcha parametrlarni olib tashlaydi."""
    vid = _extract_video_id(url)
    return f"https://www.youtube.com/watch?v={vid}" if vid else url


def _fastsaver_config() -> tuple:
    api_key = os.getenv("FASTSAVER_API_KEY")
    base_url = (os.getenv("FASTSAVER_BASE_URL") or FASTSAVER_DEFAULT_BASE).rstrip("/")
    return api_key, base_url


def _pick_quality(formats: list, max_height: int) -> str:
    """Formatlar ro'yxatidan max_height dan oshmagan eng yaxshi sifatni tanlaydi."""
    heights = []
    for f in formats or []:
        if f.get("type") != "video":
            continue
        m = re.match(r"(\d+)p", str(f.get("format", "")))
        if m:
            heights.append(int(m.group(1)))
    if not heights:
        return f"{min(max_height, 720)}p"
    allowed = [h for h in heights if h <= max_height]
    return f"{max(allowed) if allowed else min(heights)}p"


def _find_download_url(data: Any) -> Optional[str]:
    """Javob ichidan (ichma-ich bo'lsa ham) yuklab olish havolasini qidiradi."""
    if isinstance(data, dict):
        for key in URL_KEYS:
            val = data.get(key)
            if isinstance(val, str) and val.startswith("http"):
                return val
        for val in data.values():
            found = _find_download_url(val)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _find_download_url(item)
            if found:
                return found
    return None


def _save_stream(response: requests.Response, out_path: str) -> None:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)


def _is_binary_response(response: requests.Response) -> bool:
    ctype = response.headers.get("Content-Type", "").lower()
    return ctype.startswith("video/") or "octet-stream" in ctype


# ----------------------------------------------------------------------
# FastSaver
# ----------------------------------------------------------------------
def fetch_via_fastsaver(video_url: str, job_id: str, max_height: int = 1080) -> Dict[str, Any]:
    """
    1) /youtube/info  -> sarlavha, davomiylik, formatlar
    2) /youtube/download -> fayl yoki havola
    Muvaffaqiyatli bo'lsa faylni OUTPUT_DIR ga saqlaydi.
    """
    api_key, base_url = _fastsaver_config()
    if not api_key:
        return {"success": False, "error": "FASTSAVER_API_KEY .env da topilmadi"}

    headers = {"X-Api-Key": api_key}
    clean_url = _normalize_youtube_url(video_url)

    try:
        # --- 1. Info ---
        r = requests.get(
            f"{base_url}{FASTSAVER_INFO_PATH}",
            headers=headers,
            params={"url": clean_url},
            timeout=30,
        )
        try:
            info = r.json()
        except ValueError:
            info = {}
        if not r.ok or info.get("ok") is False:
            return {
                "success": False,
                "error": info.get("detail") or r.text[:300],
                "status": r.status_code,
                "stage": "info",
            }

        quality = _pick_quality(info.get("formats", []), max_height)
        title = info.get("title", "Unknown")
        duration = info.get("duration")
        out_path = os.path.join(OUTPUT_DIR, f"{job_id}.mp4")

        # --- 2. Download ---
        with requests.post(
            f"{base_url}{FASTSAVER_DOWNLOAD_PATH}",
            headers=headers,
            json={"url": clean_url, "format": quality},
            timeout=60,
            stream=True,
        ) as dr:
            if not dr.ok:
                try:
                    detail = dr.json().get("detail")
                except ValueError:
                    detail = dr.text[:300]
                return {
                    "success": False,
                    "error": detail,
                    "status": dr.status_code,
                    "stage": "download",
                }

            # Agar to'g'ridan-to'g'ri video fayl qaytsa
            if _is_binary_response(dr):
                _save_stream(dr, out_path)
                return {
                    "success": True,
                    "title": title,
                    "duration": duration,
                    "filepath": out_path,
                    "quality": quality,
                }

            # Aks holda JSON ichida havola qidiramiz
            try:
                data = dr.json()
            except ValueError:
                return {"success": False, "error": "Noma'lum javob formati", "stage": "download"}

        if data.get("ok") is False:
            return {"success": False, "error": data.get("detail"), "stage": "download"}

        file_url = _find_download_url(data)
        if not file_url:
            return {
                "success": False,
                "error": "Javobda yuklab olish havolasi topilmadi",
                "raw": data,
                "stage": "download",
            }

        with requests.get(file_url, stream=True, timeout=120) as fr:
            fr.raise_for_status()
            _save_stream(fr, out_path)

        return {
            "success": True,
            "title": title,
            "duration": duration,
            "filepath": out_path,
            "quality": quality,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------
# yt-dlp (zaxira yo'l)
# ----------------------------------------------------------------------
def _get_ydl_opts(job_id: str, max_height: int = 1080) -> tuple:
    temp_cookie_path = None

    if COOKIES_PATH and os.path.exists(COOKIES_PATH) and os.path.getsize(COOKIES_PATH) > 0:
        temp_cookie_path = f"/tmp/ytdlp_cookies_{job_id}.txt"
        try:
            shutil.copy2(COOKIES_PATH, temp_cookie_path)
            os.chmod(temp_cookie_path, 0o666)
        except Exception as e:
            print(f"⚠️ Cookie nusxalashda xato: {e}")
            temp_cookie_path = None

    opts = {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 15,
        "retries": 3,
        "fragment_retries": 3,
        "outtmpl": f"{OUTPUT_DIR}/{job_id}.%(ext)s",
        "format": f"best[height<={max_height}]/best",
        "extractor_args": {
            "youtube": {
                "player_client": ["web", "android", "ios"],
                "fetch_pot": ["always"],
            },
            "youtubepot-bgutilhttp": {
                "base_url": ["http://pot-provider:4416"]
            },
        },
        "js_runtimes": {"deno": {}},
        "remote_components": ["ejs:github"],
    }

    if temp_cookie_path and os.path.exists(temp_cookie_path):
        opts["cookiefile"] = temp_cookie_path

    return opts, temp_cookie_path


def _do_download(youtube_url: str, job_id: str, max_height: int = 1080) -> Dict[str, Any]:
    opts, temp_cookie_path = _get_ydl_opts(job_id, max_height)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            print(f"[yt-dlp] Video ma'lumotlari olinmoqda: {youtube_url}")
            info = ydl.extract_info(youtube_url, download=True)

            if info:
                print(f"✅ Video muvaffaqiyatli yuklandi: {info.get('title')}")
                return {
                    "status": "success",
                    "method": "yt-dlp",
                    "title": info.get("title"),
                    "duration": info.get("duration"),
                    "filepath": ydl.prepare_filename(info),
                }
            raise Exception("Video ma'lumotlari olinmadi")

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if "not a bot" in error_msg or "cookie" in error_msg.lower():
            raise RuntimeError(
                f"AUTH_ERROR: YouTube cookie yaroqsiz. Iltimos, admin paneldan yangi cookie yuklang. ({error_msg})"
            )
        raise RuntimeError(f"DOWNLOAD_ERROR: {error_msg}")
    except Exception as e:
        raise RuntimeError(f"UNKNOWN_ERROR: {str(e)}")
    finally:
        if temp_cookie_path and os.path.exists(temp_cookie_path):
            try:
                os.remove(temp_cookie_path)
            except Exception:
                pass


# ----------------------------------------------------------------------
# Asosiy funksiya
# ----------------------------------------------------------------------
def _download_media(youtube_url: str, job_id: str, max_height: int = 1080) -> Dict[str, Any]:
    print(f"[DOWNLOAD] FastSaver API orqali urinilmoqda: {youtube_url}")
    fs = fetch_via_fastsaver(youtube_url, job_id, max_height=max_height)

    if fs.get("success"):
        print(f"✅ FastSaver muvaffaqiyatli ({fs.get('quality')}): {fs.get('title')}")
        return {
            "status": "success",
            "method": "fastsaver",
            "title": fs.get("title"),
            "duration": fs.get("duration"),
            "filepath": fs.get("filepath"),
        }

    print(
        f"⚠️ FastSaver xatosi [{fs.get('stage', '-')}]: {fs.get('error')} "
        f"(status={fs.get('status')}) raw={fs.get('raw')}"
    )
    print("⚠️ Standart yt-dlp rejimiga o'tilmoqda...")
    return _do_download(youtube_url, job_id, max_height=max_height)


# ----------------------------------------------------------------------
# Audio ajratish (analysis_tasks.py "audio_path" kalitini kutadi)
# ----------------------------------------------------------------------
def _extract_audio(video_path: str, audio_path: str) -> str:
    """Videodan 16 kHz mono WAV ajratadi (transkripsiya uchun)."""
    os.makedirs(os.path.dirname(audio_path), exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        audio_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    except FileNotFoundError:
        raise RuntimeError("AUDIO_ERROR: ffmpeg topilmadi (konteynerga o'rnating)")
    except subprocess.TimeoutExpired:
        raise RuntimeError("AUDIO_ERROR: audio ajratish vaqti tugadi")

    if proc.returncode != 0 or not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
        tail = (proc.stderr or "")[-400:]
        raise RuntimeError(f"AUDIO_ERROR: audio ajratib bo'lmadi (ovoz yo'q bo'lishi mumkin). {tail}")
    return audio_path


def download_video(youtube_url: str, job_id: str, max_height: int = 1080) -> Dict[str, Any]:
    """
    Videoni yuklaydi (FastSaver -> yt-dlp zaxira) va audio ajratadi.
    Qaytaradi: status, method, title, duration, filepath, video_path, audio_path
    """
    result = _download_media(youtube_url, job_id, max_height=max_height)

    video_path = result.get("filepath")
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError(f"DOWNLOAD_ERROR: yuklangan fayl topilmadi: {video_path}")

    audio_path = os.path.join(OUTPUT_DIR, f"{job_id}_audio.wav")
    result["video_path"] = video_path
    result["audio_path"] = _extract_audio(video_path, audio_path)
    return result


# ----------------------------------------------------------------------
# Video metama'lumotlari (routes.py, video_analysis_routes.py, job_creation.py)
# ----------------------------------------------------------------------
def get_video_info(url: str) -> Dict[str, Any]:
    """
    Video haqida ma'lumot (yuklamasdan). Bloklovchi funksiya:
    chaqiruvchilar uni asyncio.to_thread orqali ishlatadi.
    Xato bo'lsa RuntimeError ko'taradi.
    """
    clean_url = _normalize_youtube_url(url)

    # 1) FastSaver /youtube/info
    api_key, base_url = _fastsaver_config()
    if api_key:
        try:
            r = requests.get(
                f"{base_url}{FASTSAVER_INFO_PATH}",
                headers={"X-Api-Key": api_key},
                params={"url": clean_url},
                timeout=20,
            )
            data = r.json()
            if r.ok and data.get("ok") is not False and data.get("title"):
                vid = data.get("video_id") or _extract_video_id(clean_url)
                return {
                    "id": vid,
                    "video_id": vid,
                    "title": data.get("title") or "Unknown",
                    "duration": data.get("duration") or 0,
                    "thumbnail": data.get("thumbnail") or "",
                    "description": "",
                    "uploader": data.get("author") or "",
                    "channel": data.get("author"),
                    "webpage_url": clean_url,
                    "source": "fastsaver",
                }
            print(f"⚠️ get_video_info FastSaver: {data.get('detail') or r.text[:200]}")
        except Exception as e:
            print(f"⚠️ get_video_info FastSaver xatosi: {e}")

    # 2) yt-dlp (faqat metama'lumot)
    opts, temp_cookie_path = _get_ydl_opts(f"info_{uuid.uuid4().hex[:8]}")
    opts["skip_download"] = True
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
        if not info:
            raise RuntimeError("Video ma'lumotlari olinmadi")
        return {
            "id": info.get("id"),
            "video_id": info.get("id"),
            "title": info.get("title") or "Unknown",
            "duration": info.get("duration") or 0,
            "thumbnail": info.get("thumbnail") or "",
            "description": info.get("description") or "",
            "uploader": info.get("uploader") or "",
            "channel": info.get("channel") or info.get("uploader"),
            "webpage_url": info.get("webpage_url") or clean_url,
            "source": "yt-dlp",
        }
    except yt_dlp.utils.DownloadError as e:
        raise RuntimeError(f"INFO_ERROR: {e}")
    finally:
        if temp_cookie_path and os.path.exists(temp_cookie_path):
            try:
                os.remove(temp_cookie_path)
            except Exception:
                pass
