#!/usr/bin/env bash
set -euo pipefail

BASE="https://api.xcorehub.dev/app"
EMAIL="contact@xcorehub.dev"
PASSWORD="Hunters123@"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }
section() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

check() {
  local label="$1" status="$2"
  if   [[ "$status" -ge 200 && "$status" -lt 300 ]]; then pass "$label ($status)"
  elif [[ "$status" == "401" ]]; then fail "$label — non autorisé (401)"
  elif [[ "$status" == "403" ]]; then fail "$label — accès refusé (403)"
  elif [[ "$status" == "404" ]]; then fail "$label — route introuvable (404)"
  else fail "$label ($status) — $(cat /tmp/resp.json 2>/dev/null | head -c 120)"
  fi
}

req() {
  local method="$1" path="$2" data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -s -o /tmp/resp.json -w "%{http_code}" -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data"
  else
    curl -s -o /tmp/resp.json -w "%{http_code}" -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

# ── Login ──────────────────────────────────────────────────────────────────────
info "Login..."
RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

MFA_REQUIRED=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mfa_required','false'))" 2>/dev/null)

if [[ "$MFA_REQUIRED" == "True" ]]; then
  MFA_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['mfa_token'])")
  echo -e "${YELLOW}MFA requis — entre ton code TOTP :${NC}"
  read -r MFA_CODE
  RESP=$(curl -s -X POST "$BASE/auth/mfa/verify-login" \
    -H "Content-Type: application/json" \
    -d "{\"mfa_token\":\"$MFA_TOKEN\",\"code\":\"$MFA_CODE\"}")
fi

TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [[ -z "$TOKEN" ]]; then
  fail "Login échoué: $RESP"
  exit 1
fi
pass "Login OK — token: ${TOKEN:0:30}..."

# ── Auth ───────────────────────────────────────────────────────────────────────
section "AUTH"
STATUS=$(req GET /auth/me)
check "GET /auth/me" "$STATUS"
[[ "$STATUS" == "200" ]] && python3 -c "import json; d=json.load(open('/tmp/resp.json')); print(f'  email={d.get(\"email\")} | is_active={d.get(\"is_active\")}')" 2>/dev/null

# ── Admin ──────────────────────────────────────────────────────────────────────
section "XADMIN — Stats & Système"
STATUS=$(req GET /xadmin/stats);       check "GET /xadmin/stats" "$STATUS"
[[ "$STATUS" == "200" ]] && python3 -c "import json; d=json.load(open('/tmp/resp.json')); [print(f'  {k}: {v}') for k,v in d.items()]" 2>/dev/null
STATUS=$(req GET /xadmin/system/info); check "GET /xadmin/system/info" "$STATUS"
STATUS=$(req GET /xadmin/system/db);   check "GET /xadmin/system/db" "$STATUS"

section "XADMIN — Utilisateurs"
STATUS=$(req GET /xadmin/users); check "GET /xadmin/users" "$STATUS"
USER_ID=$(python3 -c "import json; items=json.load(open('/tmp/resp.json')).get('items',[]); print(items[0]['id'] if items else '')" 2>/dev/null)
[[ -n "$USER_ID" ]] && echo "  Premier user: $USER_ID"

section "XADMIN — Plugins"
STATUS=$(req GET /xadmin/plugins); check "GET /xadmin/plugins" "$STATUS"
PLUGIN_SLUG=$(python3 -c "import json; items=json.load(open('/tmp/resp.json')).get('items',[]); print(items[0]['slug'] if items else '')" 2>/dev/null)
[[ -n "$PLUGIN_SLUG" ]] && echo "  Premier plugin: $PLUGIN_SLUG"

section "XADMIN — Soumissions"
STATUS=$(req GET /xadmin/submissions); check "GET /xadmin/submissions" "$STATUS"
SUB_ID=$(python3 -c "import json; items=json.load(open('/tmp/resp.json')).get('items',[]); print(items[0]['id'] if items else '')" 2>/dev/null)
[[ -n "$SUB_ID" ]] && echo "  Première submission: $SUB_ID"
[[ -n "$SUB_ID" ]] && { STATUS=$(req GET /xadmin/submissions); check "GET /xadmin/submissions" "$STATUS"; }

section "XADMIN — Catégories"
STATUS=$(req GET /xadmin/categories); check "GET /xadmin/categories" "$STATUS"
CAT_ID=$(python3 -c "import json; items=json.load(open('/tmp/resp.json')); print(items[0]['id'] if items else '')" 2>/dev/null)
[[ -n "$CAT_ID" ]] && echo "  Première catégorie: $CAT_ID"

section "XADMIN — Audit"
STATUS=$(req GET /xadmin/audit); check "GET /xadmin/audit" "$STATUS"

# ── Marketplace ────────────────────────────────────────────────────────────────
section "MARKETPLACE"
STATUS=$(req GET /marketplace/plugins);     check "GET /marketplace/plugins" "$STATUS"
STATUS=$(req GET /marketplace/categories);  check "GET /marketplace/categories" "$STATUS"
STATUS=$(req GET /marketplace/submissions); check "GET /marketplace/submissions" "$STATUS"
STATUS=$(req GET /marketplace/webhooks);    check "GET /marketplace/webhooks" "$STATUS"
STATUS=$(req GET /marketplace/github/link); check "GET /marketplace/github/link" "$STATUS"

# ── OAuth redirect ─────────────────────────────────────────────────────────────
section "OAUTH"
STATUS=$(curl -s -o /tmp/resp.json -w "%{http_code}" --max-redirs 0 \
  "$BASE/auth/oauth/github/authorize?direct=true&redirect=http://localhost:5175/auth/callback")
if [[ "$STATUS" == "307" || "$STATUS" == "302" ]]; then
  LOCATION=$(curl -sI --max-redirs 0 "$BASE/auth/oauth/github/authorize?direct=true&redirect=http://localhost:5175/auth/callback" | grep -i "^location:" | tr -d '\r')
  pass "GET /auth/oauth/github/authorize ($STATUS)"
  REDIRECT=$(echo "$LOCATION" | grep -o 'redirect_uri=[^&]*' | head -1)
  echo "  redirect_uri: $(python3 -c "import urllib.parse; print(urllib.parse.unquote('${REDIRECT#redirect_uri=}'))" 2>/dev/null)"
else
  check "GET /auth/oauth/github/authorize" "$STATUS"
fi

echo -e "\n${GREEN}Tests terminés.${NC}"
