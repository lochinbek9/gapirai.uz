"""GET /api/jobs/{id}/capcut.zip -- CapCut uchun ovoz (MP3) + SRT + qo'llanma.

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_capcut_export
(haqiqiy ffmpeg kerak -- backend konteynerida va dev mashinada bor)
"""
import os
import shutil
import struct
import subprocess
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api import routes
from backend.models.database import Base, DubbingJob, JobStatus
from backend.services import capcut_export


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


SEGMENTS = [
    {"start": 0.0, "end": 2.5, "text": "Salom va xush kelibsiz!"},
    {"start": 2.5, "end": 5.0, "text": "Bugun choy tayyorlaymiz."},
]


def write_wav(path, seconds=5.0, rate=24000):
    pcm = b"".join(struct.pack("<h", (i * 37) % 20000 - 10000) for i in range(int(seconds * rate)))
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)
    Path(path).write_bytes(b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt
                           + b"data" + struct.pack("<I", len(pcm)) + pcm)


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg kerak")
class CapcutExportTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in ("users", "video_analyses", "dubbing_jobs")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()
        self.tmp = Path(tempfile.mkdtemp(prefix="capcut-test-"))
        self.cleanup = []

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def job(self, status=JobStatus.COMPLETED, subtitle_only=False, wav=True, **kw):
        jid = uuid.uuid4()
        audio = None
        if wav:
            audio = self.tmp / f"{jid}.wav"
            write_wav(audio)
        j = DubbingJob(id=jid, youtube_url="https://youtu.be/x", status=status, subtitle_only=subtitle_only,
                       video_title="Choy tayyorlash: oʻzbekcha", translated_segments=SEGMENTS,
                       dubbed_audio_path=str(audio) if audio else None, **kw)
        self.db.add(j)
        self.db.commit()
        return jid

    def download(self, jid):
        resp = routes.download_capcut_package(jid, db=self.db)
        data = Path(resp.path).read_bytes()
        disposition = resp.headers["content-disposition"]
        # FastAPI'dagidek: javobdan keyin vaqtinchalik fayllar o'chiriladi
        resp.background.func(*resp.background.args)
        return data, disposition, resp

    def test_dub_package_has_mp3_srt_and_guide(self):
        jid = self.job()
        data, disposition, resp = self.download(jid)
        z = zipfile.ZipFile(__import__("io").BytesIO(data))
        names = z.namelist()
        self.assertEqual(sorted(names), sorted([capcut_export.AUDIO_NAME, capcut_export.SRT_NAME, capcut_export.GUIDE_NAME]))
        srt = z.read(capcut_export.SRT_NAME).decode()
        self.assertIn("00:00:00,000 --> 00:00:02,500\nSalom va xush kelibsiz!", srt)
        mp3 = self.tmp / "out.mp3"
        mp3.write_bytes(z.read(capcut_export.AUDIO_NAME))
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name",
                                "-of", "default=nw=1", str(mp3)], capture_output=True, text=True).stdout
        self.assertIn("codec_name=mp3", probe)
        duration = float(probe.split("duration=")[1].split()[0])
        self.assertAlmostEqual(duration, 5.0, delta=0.15)
        guide = z.read(capcut_export.GUIDE_NAME).decode()
        self.assertIn("Import captions", guide)
        self.assertIn(capcut_export.AUDIO_NAME, guide)
        self.assertIn("filename*=UTF-8''Choy%20tayyorlash", disposition)
        self.assertIn("CapCut", disposition)
        self.assertEqual(resp.media_type, "application/zip")
        # vaqtinchalik zip o'chirildi, MP3 esa WAV yonida keshlandi
        self.assertFalse(Path(resp.path).exists())
        cached = self.tmp / f"{jid}.capcut.mp3"
        self.assertTrue(cached.exists())
        mtime = cached.stat().st_mtime
        self.download(jid)
        self.assertEqual(cached.stat().st_mtime, mtime, "ikkinchi marta qayta o'girilmasligi kerak")

    def test_subtitle_only_package_has_no_audio(self):
        jid = self.job(subtitle_only=True, wav=False)
        data, _, _ = self.download(jid)
        z = zipfile.ZipFile(__import__("io").BytesIO(data))
        self.assertNotIn(capcut_export.AUDIO_NAME, z.namelist())
        self.assertIn(capcut_export.SRT_NAME, z.namelist())
        guide = z.read(capcut_export.GUIDE_NAME).decode()
        self.assertNotIn(capcut_export.AUDIO_NAME, guide)

    def test_unfinished_or_missing_audio(self):
        for jid, code in ((self.job(status=JobStatus.TRANSLATING), 404), (self.job(wav=False), 410)):
            with self.assertRaises(HTTPException) as e:
                routes.download_capcut_package(jid, db=self.db)
            self.assertEqual(e.exception.status_code, code)
        with self.assertRaises(HTTPException) as e:
            routes.download_capcut_package(uuid.uuid4(), db=self.db)
        self.assertEqual(e.exception.status_code, 404)

    def test_mp3_falls_back_to_temp_when_wav_dir_readonly(self):
        jid = self.job()
        os.chmod(self.tmp, 0o555)
        try:
            data, _, resp = self.download(jid)
        finally:
            os.chmod(self.tmp, 0o755)
        z = zipfile.ZipFile(__import__("io").BytesIO(data))
        self.assertIn(capcut_export.AUDIO_NAME, z.namelist())
        self.assertFalse((self.tmp / f"{jid}.capcut.mp3").exists())
        leftovers = [p for p in resp.background.args[0] if os.path.exists(p)]
        self.assertEqual(leftovers, [], "vaqtinchalik MP3/zip o'chirilishi kerak")


if __name__ == "__main__":
    unittest.main()
