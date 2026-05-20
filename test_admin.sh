#!/usr/bin/env bash
set -euo pipefail

BASE="https://api.xcorehub.dev/app/v1"
EMAIL="contact@xcorehub.dev"
PASSWORD="Hunters123@"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

check() {
  local label="$1"
  local status="$2"
  local body="$3"
  if [[ "$status" -ge 200 && "$status" -lt 300 ]]; then
    pass "$label ($status)"
  elif [[ "$status" == "403" || "$status" == "401" ]]; then
    fail "$label — non autorisé ($status)"
  elif [[ "$status" == "404" ]]; then
    fail "$label — route introuvable ($status)"
  else
    fail "$label ($status) — $body"
  fi
}

# ── Login ──────────────────────────────────────────────────────────────────────
info "Login admin..."
LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
STATUS=$(echo "$LOGIN" | tail -1)
BODY=$(echo "$LOGIN" | head -1)

if [[ "$STATUS" != "200" ]]; then
  fail "Login échoué ($STATUS): $BODY"
  exit 1
fi
pass "Login ($STATUS)"
TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "  Token: ${TOKEN:0:40}..."

AUTH="-H \"Authorization: Bearer $TOKEN\""

req() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -s -o /tmp/resp.json -w "%{http_code}" -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -o /tmp/resp.json -w "%{http_code}" -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ROUTES ADMIN (/xadmin)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stats
STATUS=$(req GET /xadmin/stats)
check "GET /xadmin/stats" "$STATUS" "$(cat /tmp/resp.json)"

# System info
STATUS=$(req GET /xadmin/system/info)
check "GET /xadmin/system/info" "$STATUS" "$(cat /tmp/resp.json)"

# System DB
STATUS=$(req GET /xadmin/system/db)
check "GET /xadmin/system/db" "$STATUS" "$(cat /tmp/resp.json)"

# Users
STATUS=$(req GET /xadmin/users)
check "GET /xadmin/users" "$STATUS" "$(cat /tmp/resp.json)"
USER_ID=$(cat /tmp/resp.json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -n "$USER_ID" ]] && echo "  Premier user ID: $USER_ID"

# Plugins
STATUS=$(req GET /xadmin/plugins)
check "GET /xadmin/plugins" "$STATUS" "$(cat /tmp/resp.json)"
PLUGIN_SLUG=$(cat /tmp/resp.json | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -n "$PLUGIN_SLUG" ]] && echo "  Premier plugin slug: $PLUGIN_SLUG"

# Submissions
STATUS=$(req GET /xadmin/submissions)
check "GET /xadmin/submissions" "$STATUS" "$(cat /tmp/resp.json)"
SUB_ID=$(cat /tmp/resp.json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -n "$SUB_ID" ]] && echo "  Première submission ID: $SUB_ID"

# Categories
STATUS=$(req GET /xadmin/categories)
check "GET /xadmin/categories" "$STATUS" "$(cat /tmp/resp.json)"

# Audit
STATUS=$(req GET /xadmin/audit)
check "GET /xadmin/audit" "$STATUS" "$(cat /tmp/resp.json)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ROUTES AUTH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STATUS=$(req GET /auth/me)
check "GET /auth/me" "$STATUS" "$(cat /tmp/resp.json)"
[[ "$STATUS" == "200" ]] && echo "  $(cat /tmp/resp.json | grep -o '"email":"[^"]*"' | head -1)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ROUTES MARKETPLACE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STATUS=$(req GET /marketplace/plugins)
check "GET /marketplace/plugins" "$STATUS" "$(cat /tmp/resp.json)"

STATUS=$(req GET /marketplace/categories)
check "GET /marketplace/categories" "$STATUS" "$(cat /tmp/resp.json)"

STATUS=$(req GET /marketplace/submissions)
check "GET /marketplace/submissions" "$STATUS" "$(cat /tmp/resp.json)"

STATUS=$(req GET /marketplace/webhooks)
check "GET /marketplace/webhooks" "$STATUS" "$(cat /tmp/resp.json)"

STATUS=$(req GET /marketplace/github/link)
check "GET /marketplace/github/link" "$STATUS" "$(cat /tmp/resp.json)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " OAUTH (sans /v1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
BASE_AUTH="https://api.xcorehub.dev/app"
STATUS=$(curl -s -o /tmp/resp.json -w "%{http_code}" --max-redirs 0 \
  "$BASE_AUTH/auth/oauth/github/authorize?direct=true&redirect=http://localhost:5175/auth/callback")
if [[ "$STATUS" == "307" || "$STATUS" == "302" ]]; then
  LOCATION=$(curl -s -I --max-redirs 0 "$BASE_AUTH/auth/oauth/github/authorize?direct=true&redirect=http://localhost:5175/auth/callback" | grep -i "^location:" | tr -d '\r')
  pass "GET /auth/oauth/github/authorize ($STATUS)"
  echo "  $LOCATION"
else
  check "GET /auth/oauth/github/authorize" "$STATUS" "$(cat /tmp/resp.json)"
fi

echo ""
echo "Done."
