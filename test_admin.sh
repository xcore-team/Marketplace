#!/usr/bin/env bash
set -euo pipefail

BASE="https://api.xcorehub.dev/app"
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
echo " OAUTH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
STATUS=$(curl -s -o /tmp/resp.json -w "%{http_code}" --max-redirs 0 \
  "$BASE/auth/oauth/github/authorize?direct=true&redirect=http://localhost:5175/auth/callback" || echo "000")
if [[ "$STATUS" == "307" || "$STATUS" == "302" ]]; then
  LOCATION=$(curl -sI --max-redirs 0 "$BASE/auth/oauth/github/authorize?direct=true&redirect=http://localhost:5175/auth/callback" 2>/dev/null | grep -i "^location:" | tr -d '\r' || true)
  pass "GET /auth/oauth/github/authorize ($STATUS)"
  REDIRECT=$(echo "$LOCATION" | grep -o 'redirect_uri=[^&]*' | head -1 || true)
  [[ -n "$REDIRECT" ]] && echo "  redirect_uri: $(python3 -c "import urllib.parse; print(urllib.parse.unquote('${REDIRECT#redirect_uri=}'))" 2>/dev/null || true)"
else
  check "GET /auth/oauth/github/authorize" "$STATUS" "$(cat /tmp/resp.json)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " RBAC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Vérifier les permissions dans le JWT
echo "  Permissions dans le JWT :"
echo "$TOKEN" | cut -d. -f2 | python3 -c "
import sys, base64, json
b64 = sys.stdin.read().strip()
b64 += '=' * (4 - len(b64) % 4)
p = json.loads(base64.b64decode(b64))
perms = p.get('permissions', [])
print(f'  {len(perms)} permissions trouvées')
if perms: print('  ' + ', '.join(sorted(perms)[:10]) + ('...' if len(perms) > 10 else ''))
" 2>/dev/null

# GET permissions
STATUS=$(req GET /auth/rbac/permissions)
check "GET /auth/rbac/permissions" "$STATUS" "$(cat /tmp/resp.json)"
PERM_ID=$(python3 -c "import json; r=json.load(open('/tmp/resp.json')); print(r[0]['id'] if isinstance(r,list) and r else '')" 2>/dev/null)
PERM_COUNT=$(python3 -c "import json; r=json.load(open('/tmp/resp.json')); print(len(r) if isinstance(r,list) else 0)" 2>/dev/null)
[[ -n "$PERM_COUNT" ]] && echo "  $PERM_COUNT permissions en base"

# GET roles
STATUS=$(req GET /auth/rbac/roles)
check "GET /auth/rbac/roles" "$STATUS" "$(cat /tmp/resp.json)"
ROLE_ID=$(python3 -c "import json; r=json.load(open('/tmp/resp.json')); print(r[0]['id'] if isinstance(r,list) and r else '')" 2>/dev/null)
[[ "$STATUS" == "200" ]] && python3 -c "
import json
roles = json.load(open('/tmp/resp.json'))
for r in roles:
    nb = len(r.get('permissions', []))
    print(f'  → {r[\"name\"]} ({nb} perms, tenant={r.get(\"tenant_id\") or \"global\"})')
" 2>/dev/null

# GET role by id
if [[ -n "$ROLE_ID" ]]; then
  STATUS=$(req GET /auth/rbac/roles/$ROLE_ID)
  check "GET /auth/rbac/roles/:id" "$STATUS" "$(cat /tmp/resp.json)"
fi

# GET user permissions
ME=$(curl -s "$BASE/auth/me" -H "Authorization: Bearer $TOKEN")
ADMIN_USER_ID=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
ADMIN_TENANT_ID=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tenant_id',''))" 2>/dev/null)

if [[ -n "$ADMIN_USER_ID" && -n "$ADMIN_TENANT_ID" ]]; then
  STATUS=$(req GET /auth/rbac/users/$ADMIN_USER_ID/tenants/$ADMIN_TENANT_ID/permissions)
  check "GET /auth/rbac/users/:id/tenants/:id/permissions" "$STATUS" "$(cat /tmp/resp.json)"
  [[ "$STATUS" == "200" ]] && python3 -c "
import json
perms = json.load(open('/tmp/resp.json'))
print(f'  {len(perms)} permissions pour admin')
if perms: print('  ' + ', '.join(sorted(perms)[:10]) + ('...' if len(perms) > 10 else ''))
" 2>/dev/null
fi

# POST create role test
STATUS=$(req POST /auth/rbac/roles '{"name":"test_rbac_role","description":"Role test RBAC","tenant_id":null}')
check "POST /auth/rbac/roles (créer)" "$STATUS" "$(cat /tmp/resp.json)"
TEST_ROLE_ID=$(python3 -c "import json; print(json.load(open('/tmp/resp.json')).get('id',''))" 2>/dev/null)
[[ -n "$TEST_ROLE_ID" ]] && echo "  Nouveau rôle ID: $TEST_ROLE_ID"

# POST assign permission to role
if [[ -n "$TEST_ROLE_ID" && -n "$PERM_ID" ]]; then
  STATUS=$(req POST /auth/rbac/roles/$TEST_ROLE_ID/permissions "{\"permission_id\":\"$PERM_ID\"}")
  check "POST /auth/rbac/roles/:id/permissions (assigner)" "$STATUS" "$(cat /tmp/resp.json)"

  # DELETE remove permission from role
  STATUS=$(req DELETE /auth/rbac/roles/$TEST_ROLE_ID/permissions/$PERM_ID)
  check "DELETE /auth/rbac/roles/:id/permissions/:id (retirer)" "$STATUS" "$(cat /tmp/resp.json)"
fi

# POST create permission test
STATUS=$(req POST /auth/rbac/permissions '{"name":"test:rbac_check","description":"Permission test"}')
check "POST /auth/rbac/permissions (créer)" "$STATUS" "$(cat /tmp/resp.json)"
TEST_PERM_ID=$(python3 -c "import json; print(json.load(open('/tmp/resp.json')).get('id',''))" 2>/dev/null)

# POST assign role to member
if [[ -n "$TEST_ROLE_ID" && -n "$ADMIN_USER_ID" && -n "$ADMIN_TENANT_ID" ]]; then
  STATUS=$(req POST /auth/rbac/tenants/$ADMIN_TENANT_ID/members/$ADMIN_USER_ID/role "{\"role_id\":\"$TEST_ROLE_ID\"}")
  check "POST /auth/rbac/tenants/:id/members/:id/role (assigner)" "$STATUS" "$(cat /tmp/resp.json)"
fi

echo ""
echo "Done."
