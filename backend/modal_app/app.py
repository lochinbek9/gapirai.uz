"""Modal deploy nishoni — Phase 3A PROTOTYPE.  DEPLOY QILINMAGAN.

Deploy (kelajakda, Phase 3 execution):
    modal deploy backend/modal_app/app.py

Dizayn:
  * Modal image backend kodini o'z ichiga oladi. Remote function'lar
    `merger.merge_video_audio()` / `transcriber.transcribe_audio()` ni
    AYNAN chaqiradi — biznes mantiq (DSP filtergraph, chunking, provayder
    zanjiri, timing) KO'CHIRILMAYDI.
  * Data flow: bytes hech qachon function-arg orqali emas — faqat S3
    kalitlar. Modal container boto3 bilan S3'dan o'qiydi/yozadi.
  * AWS kalitlar: Modal Secret "gapirai-s3" (AWS_ACCESS_KEY_ID /
    AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_BUCKET_NAME). Backend'ning
    kalitidan ALOHIDA — least-privilege IAM user, faqat
    s3:GetObject/PutObject/HeadObject on arn:aws:s3:::<bucket>/dubber*.

DIQQAT: aniq Modal API chaqiruvlari (Image builderlar, Secret, Function
lookup) o'rnatilgan `modal` versiyasiga qarab farq qilishi mumkin — Phase 3
execution'da tekshiriladi. Bu fayl INTENT'ni hujjatlashtiradi. `modal`
o'rnatilmagan muhitda import QILINMAYDI (top-level `import modal`).
"""
import os
import sys
import tempfile

import modal

app = modal.App(name="gapirai-processing")

# Modal image: python 3.12 + ffmpeg + backend requirements + backend kodi.
_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install_from_requirements("backend/requirements.txt")
    .add_local_dir("backend", remote_path="/root/backend")
)

# Backend'ning AWS kalitidan ALOHIDA (least-privilege) — Modal dashboard'da yaratiladi.
_s3_secret = modal.Secret.from_name("gapirai-s3")


def _bootstrap_backend_path() -> None:
    if "/root" not in sys.path:
        sys.path.insert(0, "/root")


@app.function(image=_image, secrets=[_s3_secret], timeout=3600, cpu=2.0, memory=4096)
def encode_merge_remote(video_key: str, audio_key: str, out_key: str, mix_mode=None) -> str:
    """S3 --download--> merger.merge_video_audio() --upload--> S3.  out_key qaytaradi."""
    _bootstrap_backend_path()
    from backend.services import merger
    from backend.services.storage import download_file_from_s3, upload_file_to_s3

    with tempfile.TemporaryDirectory() as tmp:
        v = os.path.join(tmp, "video.mp4")
        a = os.path.join(tmp, "audio.wav")
        o = os.path.join(tmp, "dubbed_final.mp4")
        if not download_file_from_s3(video_key, v):
            raise RuntimeError(f"S3 GET failed: {video_key}")
        if not download_file_from_s3(audio_key, a):
            raise RuntimeError(f"S3 GET failed: {audio_key}")
        merger.merge_video_audio(
            video_path=v, dubbed_audio_path=a, output_path=o, audio_mix_mode=mix_mode
        )
        if not upload_file_to_s3(o, out_key):
            raise RuntimeError(f"S3 PUT failed: {out_key}")
    return out_key


@app.function(image=_image, secrets=[_s3_secret], timeout=1800, cpu=2.0, memory=2048)
def transcribe_remote(audio_key: str, language: str = "en") -> dict:
    """S3 --download--> transcriber.transcribe_audio() --> dict (JSON-serializable)."""
    _bootstrap_backend_path()
    from backend.services import transcriber
    from backend.services.storage import download_file_from_s3

    with tempfile.TemporaryDirectory() as tmp:
        a = os.path.join(tmp, "audio.wav")
        if not download_file_from_s3(audio_key, a):
            raise RuntimeError(f"S3 GET failed: {audio_key}")
        return transcriber.transcribe_audio(a, language=language)
