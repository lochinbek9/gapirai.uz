import asyncio
import time
import logging
from backend.models.database import SessionLocal, User, DubbingJob, JobStatus
from backend.services.job_creation import create_dubbing_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

async def run_test(tts_provider: str, voice_gender: str, voice_name: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "yunusovabdulmajid@gmail.com").first()
        if not user:
            print("Admin user not found!")
            return None

        url = "https://www.youtube.com/watch?v=Rj_vssRaZlQ"
        print(f"\n==========================================")
        print(f"Creating job: provider={tts_provider}, gender={voice_gender}, voice={voice_name}")
        print(f"==========================================")

        result = await create_dubbing_job(
            db=db,
            user=user,
            youtube_url=url,
            voice_gender=voice_gender,
            tts_provider=tts_provider,
            voice_name=voice_name,
            voice_style="neutral",
            force_new=True, # Yangi job sifatida yaratish
        )

        print(f"Job creation outcome: {result.outcome}, job_id: {result.job_id}")
        if result.outcome not in ("queued", "ready"):
            print(f"Job creation failed: {result.error_detail}")
            return None

        job_id = result.job_id
        if result.outcome == "ready":
            print(f"Job {job_id} already ready from cache!")
            return job_id

        # Monitor job
        start_time = time.time()
        last_progress = -1
        last_status = None
        while True:
            await asyncio.sleep(5)
            db.expire_all()
            job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
            if not job:
                print("Job not found in DB!")
                break

            if job.progress != last_progress or job.status != last_status:
                last_progress = job.progress
                last_status = job.status
                elapsed = int(time.time() - start_time)
                print(f"[{elapsed}s] Status: {job.status.value} ({job.progress:.1f}%) — {job.status_message}")

            if job.status == JobStatus.COMPLETED:
                print(f"Job {job_id} COMPLETED successfully! Output: {job.output_video_path}")
                return job_id
            elif job.status == JobStatus.FAILED:
                print(f"Job {job_id} FAILED! Error: {job.error_message}")
                return None
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    prov = sys.argv[1] if len(sys.argv) > 1 else "edge"
    gender = sys.argv[2] if len(sys.argv) > 2 else "male"
    voice = sys.argv[3] if len(sys.argv) > 3 else "uz-UZ-SardorNeural"
    asyncio.run(run_test(prov, gender, voice))
