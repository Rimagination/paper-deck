import subprocess, os, sys
os.chdir(os.path.join(os.path.dirname(__file__), "frontend"))
subprocess.run(["npm", "run", "dev", "--", "--port", "5173"])
