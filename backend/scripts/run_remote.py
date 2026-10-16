import subprocess
import sys

script_content = sys.argv[1] if len(sys.argv) > 1 else ""

remote_cmd = f"""docker exec -i dubber_backend python3 -c {subprocess.list2cmdline([script_content])}"""

proc = subprocess.run(["ssh", "gapirai@173.212.220.188", remote_cmd], capture_output=True, text=True)
print(proc.stdout)
if proc.stderr:
    print("STDERR:", proc.stderr)
