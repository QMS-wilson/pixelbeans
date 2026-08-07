"""把拼豆项目部署到远程服务器（Ubuntu + systemd）。

用法：
  $env:DEPLOY_PASSWORD='xxx'; py tools/deploy.py
  或 py tools/deploy.py '密码'

部署内容：
  - 安装 Node.js（NodeSource 22 LTS，如已安装则跳过）
  - 上传源码到 /opt/pixel-beads
  - 生成/补齐生产 .dev.vars（保留火山密钥，补强随机 CARD_ADMIN_KEY / CARD_SESSION_SECRET）
  - 写入 systemd 服务：前端 80 端口、后端 9090 端口
  - 启动并验证
"""

import getpass
import os
import pathlib
import secrets
import stat
import sys
import uuid

import paramiko

HOST = "114.134.186.36"
USER = "root"
REMOTE_ROOT = "/opt/pixel-beads"
LOCAL_ROOT = pathlib.Path(r"C:\Users\24773\Documents\拼豆")

# 需要上传的本地文件（相对项目根）
UPLOAD_FILES = [
    "index.html",
    "script.js",
    "styles.css",
    "palettes.js",
    "server.js",
    "package.json",
    "package-lock.json",
    ".dev.vars",
    ".dev.vars.example",
    ".gitignore",
    "favicon.png",
    "apple-touch-icon.png",
    "README.md",
    "card-backend/server.js",
    "card-backend/card-service.js",
    "card-backend/package.json",
    "card-backend/README.md",
    "card-backend/.gitignore",
    "card-backend/卡密/index.html",
    "card-backend/卡密/cards.json",
]

# 额外复制：管理台页面同时放到前端根目录（80 端口 /卡密/index.html 可访问）
EXTRA_COPIES = [
    ("card-backend/卡密/index.html", "卡密/index.html"),
]


def run(client, command, timeout=120):
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def sftp_mkdirs(sftp, remote_dir):
    parts = pathlib.PurePosixPath(remote_dir).parts
    current = ""
    for part in parts:
        if part in ("/", ""):
            current = "/"
            continue
        current = current.rstrip("/") + "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_file(sftp, local_path, remote_path):
    sftp_mkdirs(sftp, str(pathlib.PurePosixPath(remote_path).parent))
    sftp.put(str(local_path), remote_path)
    print(f"  ↑ {local_path.name} -> {remote_path}")


def ensure_production_env(client):
    """补齐生产 .dev.vars：保留火山密钥，若缺少强随机管理密钥则生成。"""
    remote_env = f"{REMOTE_ROOT}/.dev.vars"
    code, out, err = run(client, f"cat {remote_env} 2>/dev/null || true")
    content = out
    changed = False
    defaults = {"CARD_ADMIN_KEY": "pixel-admin-2026", "CARD_SESSION_SECRET": "pixel-workshop-dev-secret"}
    for key, default in defaults.items():
        existing = None
        for line in content.splitlines():
            if line.startswith(f"{key}="):
                existing = line.split("=", 1)[1].strip()
                break
        if not existing or existing == default:
            new_value = secrets.token_hex(24)
            if existing is None:
                content += f"\n{key}={new_value}\n"
            else:
                content = "\n".join(
                    f"{key}={new_value}" if line.startswith(f"{key}=") else line
                    for line in content.splitlines()
                )
            changed = True
            print(f"  · 已生成强随机 {key}")
    if changed:
        sftp = client.open_sftp()
        with sftp.open(remote_env, "w") as f:
            f.write(content)
        sftp.close()
        print(f"  ↑ 更新 {remote_env}")
    return content


def write_systemd_units(client):
    web_unit = f"""[Unit]
Description=Pixel Beads Web (frontend)
After=network.target

[Service]
WorkingDirectory={REMOTE_ROOT}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=80

[Install]
WantedBy=multi-user.target
"""
    card_unit = f"""[Unit]
Description=Pixel Beads Card Backend
After=network.target

[Service]
WorkingDirectory={REMOTE_ROOT}/card-backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=PORT=9090
EnvironmentFile={REMOTE_ROOT}/.dev.vars

[Install]
WantedBy=multi-user.target
"""
    for name, unit in [("pixel-beads-web.service", web_unit), ("pixel-beads-card.service", card_unit)]:
        sftp = client.open_sftp()
        with sftp.open(f"/etc/systemd/system/{name}", "w") as f:
            f.write(unit)
        sftp.close()
        print(f"  · 写入 {name}")
    run(client, "systemctl daemon-reload")


def main():
    password = os.environ.get("DEPLOY_PASSWORD") or (
        sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("密码: ")
    )
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"连接 {USER}@{HOST} ...")
    client.connect(HOST, port=22, username=USER, password=password, timeout=20)

    # 1. 检查/安装 Node.js
    code, out, _ = run(client, "node -v 2>/dev/null || echo MISSING")
    if "MISSING" in out:
        print("未检测到 Node.js，开始安装 NodeSource 22 LTS ...")
        install_script = (
            "apt-get update -y && "
            "apt-get install -y ca-certificates curl gnupg && "
            "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && "
            "apt-get install -y nodejs"
        )
        code, out, err = run(client, install_script, timeout=600)
        if code != 0:
            print("Node 安装失败：", err[-2000:])
            sys.exit(1)
    code, out, err = run(client, "node -v && which node")
    print(f"Node: {out.strip()} {err.strip()}")

    # 2. 创建目录并上传
    print("创建远程目录 ...")
    run(client, f"mkdir -p {REMOTE_ROOT}/card-backend/卡密")
    sftp = client.open_sftp()
    for rel in UPLOAD_FILES:
        local = LOCAL_ROOT / rel
        if not local.exists():
            print(f"  ! 跳过（本地不存在）: {rel}")
            continue
        remote = f"{REMOTE_ROOT}/{rel}"
        upload_file(sftp, local, remote)
    for src_rel, dst_rel in EXTRA_COPIES:
        local = LOCAL_ROOT / src_rel
        if local.exists():
            upload_file(sftp, local, f"{REMOTE_ROOT}/{dst_rel}")
    sftp.close()

    # 3. 补全生产 .dev.vars
    print("配置生产环境变量 ...")
    ensure_production_env(client)

    # 4. 写入 systemd 服务
    print("写入 systemd 服务 ...")
    write_systemd_units(client)

    # 5. 启动并验证
    print("启动服务 ...")
    run(client, "systemctl enable --now pixel-beads-web pixel-beads-card")
    run(client, "systemctl restart pixel-beads-web pixel-beads-card")
    import time
    time.sleep(3)
    code, out, err = run(client, "systemctl is-active pixel-beads-web pixel-beads-card")
    print(f"服务状态: {out.strip()}")
    code, out, err = run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80")
    print(f"前端 80 端口: HTTP {out.strip()}")
    code, out, err = run(client, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/api/access-status")
    print(f"后端 9090 端口: HTTP {out.strip()}")
    code, out, err = run(client, f"tail -5 {REMOTE_ROOT}/card-backend/backend.err.log 2>/dev/null || journalctl -u pixel-beads-card -n 5 --no-pager 2>/dev/null || true")
    if out.strip():
        print("后端日志:")
        print(out.strip())
    client.close()
    print("部署完成。")


if __name__ == "__main__":
    main()
