#!/usr/bin/env bash
# Script de déploiement VPS — Marketplace
# Usage : bash deploy.sh
# Ce script est autonome : il clone, configure les .env et démarre les containers.
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/traoreera/Marketplace"
BRANCH="prod"
APP_DIR="/opt/marketplace"
GITHUB_TOKEN="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"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Pré-requis ────────────────────────────────────────────────────────────────
command -v git    >/dev/null || error "git non installé"
command -v docker >/dev/null || error "docker non installé"

# ── Auth GitHub via token (submodules privés xcore-team) ─────────────────────
git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

# ── Clone ou mise à jour du repo ──────────────────────────────────────────────
if [[ -d "$APP_DIR/.git" ]]; then
  info "Mise à jour du repo existant..."
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
  git -C "$APP_DIR" submodule sync --recursive
  git -C "$APP_DIR" submodule update --init --recursive --remote
  ok "Repo mis à jour"
else
  info "Clonage dans $APP_DIR..."
  mkdir -p "$APP_DIR"
  git clone \
    --branch "$BRANCH" \
    --recurse-submodules \
    --depth 1 \
    "https://${GITHUB_TOKEN}@github.com/traoreera/Marketplace" \
    "$APP_DIR"
  ok "Repo cloné avec tous les submodules"
fi

# ── .env principal ────────────────────────────────────────────────────────────
info "Écriture de $APP_DIR/.env..."
cat > "$APP_DIR/.env" << 'MAINENV'
GITHUB_TOKEN=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

DOCKER_BUILDKIT=1
COMPOSE_DOCKER_CLI_BUILD=1

POSTGRES_PASSWORD=passwrds123Web600
POSTGRES_USER=marketplace
POSTGRES_DB=marketplace

# SMTP
XAUTH_SMTP_HOST=mail.xcorehub.dev
XAUTH_SMTP_PORT=587
XAUTH_SMTP_USER=contact@xcorehub.dev
XAUTH_SMTP_PASSWORD=OChrIn,%,71
XAUTH_SMTP_FROM=contact@xcorehub.dev
XAUTH_SMTP_FROM_NAME=XAuth
XAUTH_SMTP_USE_TLS=true

MARKETPLACE_TOKEN=...
DATABASE_URL=mysql+aiomysql://mariadb:a3k9bvmTCpRPdMYhYJQ3@xcorehub-marketplace-vhqkqh:3306/marketplace
REDIS_URL=redis://default:xhst0ifo2bccgz8f@xcorehub-marketplaceredis-99bjdh:6379/0

CELERY_BROKER_URL=redis://default:xhst0ifo2bccgz8f@xcorehub-marketplaceredis-99bjdh:6379/0
CELERY_RESULT_BACKEND=redis://default:xhst0ifo2bccgz8f@xcorehub-marketplaceredis-99bjdh:6379/1

OAUTH_GITHUB_CLIENT_ID=ton_client_id_ici
OAUTH_GITHUB_CLIENT_SECRET=ton_client_secret_ici

APP_BASE_URL=https://api.xcorehub.dev
XAUTH_APP_BASE_URL=https://api.xcorehub.dev
ADMIN_EMAIL=contact@xcorehub.dev
MAINENV
ok ".env principal créé"

# ── .env xauth ────────────────────────────────────────────────────────────────
info "Écriture de $APP_DIR/app/xauth/.env..."
cat > "$APP_DIR/app/xauth/.env" << 'XAUTHENV'
XAUTH_APP_NAME=Xcore

ADMIN_EMAIL=contact@xcorehub.dev
ADMIN_PASSWORD=Hunters123@
ADMIN_TENANT_SLUG=default
ADMIN_TENANT_NAME=Default
ADMIN_ROLE_NAME=admin
USER_ROLE_NAME=user

XAUTH_JWT_PRIVATE_KEY_PATH=conf/private.pem
XAUTH_JWT_PUBLIC_KEY_PATH=conf/public.pem
XAUTH_JWT_ACCESS_EXPIRE_MINUTES=15
XAUTH_JWT_REFRESH_EXPIRE_DAYS=7

XAUTH_SMTP_HOST=mail.xcorehub.dev
XAUTH_SMTP_PORT=587
XAUTH_SMTP_USER=contact@xcorehub.dev
XAUTH_SMTP_PASSWORD=OChrIn,%,71
XAUTH_SMTP_FROM=contact@xcorehub.dev
XAUTH_SMTP_FROM_NAME=XcoreHub
XAUTH_SMTP_USE_TLS=true

XAUTH_APP_BASE_URL=http://api.xcorehub.dev/

XAUTH_OAUTH_GOOGLE_CLIENT_ID=
XAUTH_OAUTH_GOOGLE_CLIENT_SECRET=

XAUTH_OAUTH_GITHUB_CLIENT_ID=Ov23liGm2q4FT6nQhpVO
XAUTH_OAUTH_GITHUB_CLIENT_SECRET=7bef5aa6fd5ec9a105b60e646983d43474546a8e

XAUTH_OAUTH_DISCORD_CLIENT_ID=
XAUTH_OAUTH_DISCORD_CLIENT_SECRET=

XAUTH_OAUTH_MICROSOFT_CLIENT_ID=
XAUTH_OAUTH_MICROSOFT_CLIENT_SECRET=
XAUTHENV
ok ".env xauth créé"

# ── Build & démarrage ─────────────────────────────────────────────────────────
info "Build et démarrage des containers..."
cd "$APP_DIR"
docker compose --env-file .env up -d --build --remove-orphans

ok "════════════════════════════════════════"
ok " Déploiement terminé !"
ok "════════════════════════════════════════"
echo ""
echo -e "  ${CYAN}Logs  :${NC} docker compose -C $APP_DIR logs -f"
echo -e "  ${CYAN}Stop  :${NC} docker compose -C $APP_DIR down"
echo -e "  ${CYAN}MAJ   :${NC} bash $0"
