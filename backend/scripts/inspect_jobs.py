import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('173.212.220.188', username='gapirai', password='gapirai')

code = """
from backend.models.database import SessionLocal, DubbingJob
db = SessionLocal()
j = db.query(DubbingJob).filter(DubbingJob.id == '78123044-8c65-4a5b-82ab-084a89e19c4c').first()
if j:
    print('ID:', j.id)
    print('Title:', j.video_title)
    print('Status:', j.status)
    print('tts_provider:', j.tts_provider)
    print('voice_name:', j.voice_name)
    print('tts_model:', j.tts_model)
    print('stt_model:', j.stt_model)
    print('source_job_id:', j.source_job_id)
    print('speaker_gender:', j.speaker_gender)
    print('user_id:', j.user_id)
    print('created_at:', j.created_at)
db.close()
"""

cmd = "docker exec -i dubber_backend python3"
stdin, stdout, stderr = client.exec_command(cmd)
stdin.write(code)
stdin.channel.shutdown_write()
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("ERR:", err)

client.close()
