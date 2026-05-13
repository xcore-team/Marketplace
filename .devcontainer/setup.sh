#!/usr/bin/env bash
set -e

echo "==> Installing dependencies with uv..."
uv sync

echo "==> Copying .env example if .env missing..."
if [ ! -f extensions/.env ]; then
  cp extensions/.env.example extensions/.env
  echo "    Created extensions/.env from .env.example — fill in SMTP values if needed."
fi

echo "==> Patching integration.yaml redis URLs for devcontainer..."
sed -i 's|redis://localhost:6379|redis://redis:6379|g' integration.yaml

echo ""
echo "Done! Start the app with:"
echo "  uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "Start the Celery worker with:"
echo "  uv run celery -A app.marketplace.src.tasks worker --loglevel=info -Q default,submissions"
