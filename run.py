"""
run.py — Lance l'API uvicorn et le worker Celery en parallèle.

Usage :
    uv run python run.py
    uv run python run.py --host 0.0.0.0 --port 8080 --workers 4
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time

PROCESSES: list[subprocess.Popen] = []


def _build_api_cmd(host: str, port: int, workers: int, reload: bool) -> list[str]:
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        host,
        "--port",
        str(port),
        "--log-level",
        "info",
    ]
    if reload:
        cmd.append("--reload")
    else:
        cmd += ["--workers", str(workers)]
    return cmd


def _build_celery_cmd(concurrency: int) -> list[str]:
    return [
        sys.executable,
        "-m",
        "celery",
        "-A",
        "extensions.xworker.app",
        "worker",
        "--loglevel=info",
        "-Q",
        "submissions,default",
        f"--concurrency={concurrency}",
    ]


def _shutdown(signum, frame):
    print("\n[run] Signal reçu — arrêt des processus...")
    for p in PROCESSES:
        if p.poll() is None:
            p.terminate()

    deadline = time.time() + 10
    for p in PROCESSES:
        remaining = max(0, deadline - time.time())
        try:
            p.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            print(f"[run] Processus {p.pid} ne répond pas — kill forcé")
            p.kill()

    sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Lance l'API et le worker Celery")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Nombre de workers uvicorn (ignoré si --reload)",
    )
    parser.add_argument("--celery-concurrency", type=int, default=4)
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Active le hot-reload uvicorn (dev uniquement)",
    )
    parser.add_argument(
        "--no-celery", action="store_true", help="Lance uniquement l'API"
    )
    parser.add_argument("--no-api", action="store_true", help="Lance uniquement Celery")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    env = os.environ.copy()

    if not args.no_celery:
        celery_cmd = _build_celery_cmd(args.celery_concurrency)
        print(f"[run] Celery  → {' '.join(celery_cmd)}")
        PROCESSES.append(subprocess.Popen(celery_cmd, env=env))

    if not args.no_api:
        api_cmd = _build_api_cmd(args.host, args.port, args.workers, args.reload)
        print(f"[run] API     → {' '.join(api_cmd)}")
        PROCESSES.append(subprocess.Popen(api_cmd, env=env))

    if not PROCESSES:
        print("[run] Rien à lancer (--no-celery et --no-api tous les deux activés).")
        sys.exit(1)

    # Surveille les processus — redémarre si l'un crash
    while True:
        for i, p in enumerate(PROCESSES):
            if p.poll() is not None:
                print(
                    f"[run] Processus {p.pid} terminé avec code {p.returncode} — arrêt global."
                )
                _shutdown(None, None)
        time.sleep(2)


if __name__ == "__main__":
    main()
