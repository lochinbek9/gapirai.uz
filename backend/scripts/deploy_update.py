import paramiko
import sys

def run_ssh():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting to 173.212.220.188...")
    client.connect("173.212.220.188", username="gapirai", password="gapirai", timeout=20)
    
    commands = [
        "cd /home/gapirai/gapirai.uz && git pull origin main",
        "docker restart dubber_backend dubber_worker",
    ]
    
    for cmd in commands:
        print(f">>> Running: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out:
            print(out)
        if err:
            print("ERR:", err)

    client.close()
    print("SSH tasks complete!")

if __name__ == "__main__":
    run_ssh()
