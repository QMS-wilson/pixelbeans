"""探测远程服务器环境（部署前使用）。"""
import getpass
import paramiko
import sys

HOST = "114.134.186.36"
USER = "root"

def main():
    password = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("密码: ")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=22, username=USER, password=password, timeout=15)
    commands = [
        "uname -a",
        "cat /etc/os-release | head -3",
        "node -v 2>&1; npm -v 2>&1",
        "ls -la /opt/ 2>&1; ls -la /root/ 2>&1 | head -20",
        "which systemctl; systemctl is-system-running 2>&1",
        "ss -tlnp 2>/dev/null | grep -E ':(80|9090|8789)\\b' || echo 'ports 80/9090/8789 free'",
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80 2>&1 || echo 'no local http'",
        "df -h / | tail -1",
        "free -m | head -2",
    ]
    for cmd in commands:
        print(f"$ {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd, timeout=20)
        out = stdout.read().decode("utf-8", "replace").strip()
        err = stderr.read().decode("utf-8", "replace").strip()
        if out:
            print(out)
        if err:
            print("[stderr]", err)
        print("---")
    client.close()

if __name__ == "__main__":
    main()
