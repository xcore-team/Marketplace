#!/usr/bin/env bash
# Test end-to-end : soumission de plugin + suivi du pipeline
set -e

BASE_URL="http://localhost:8000/app"
EMAIL="contact@xcorehub.dev"
PASSWORD="Hunters123@"
ZIP="/tmp/xdocs_test.zip"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  Test pipeline soumission marketplace    ${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}\n"

# ── 1. Login ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Login...${NC}"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('access_token') or 'ERREUR: '+str(d))")

if [[ "$TOKEN" == ERREUR* ]]; then
  echo -e "${RED}✗ Login échoué : $TOKEN${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Connecté ($EMAIL)${NC}\n"

# ── 2. Crée le ZIP de test ─────────────────────────────────────────────────────
echo -e "${YELLOW}[2/4] Création du ZIP de test...${NC}"
TMP_DIR=$(mktemp -d)

cat > "$TMP_DIR/plugin.yaml" << 'YAML'
name: test-plugin
version: 0.0.1
author: test
description: Plugin de test pipeline
execution_mode: trusted
entry_point: src/main.py
permissions: []
resources:
  timeout_seconds: 10
  max_memory_mb: 50
  max_disk_mb: 1
  rate_limit:
    calls: 100
    period_seconds: 60
YAML

mkdir -p "$TMP_DIR/src"
cat > "$TMP_DIR/src/main.py" << 'PY'
from xcore.sdk import TrustedBase

class Plugin(TrustedBase):
    async def on_load(self):
        pass
PY

cat > "$TMP_DIR/README.md" << 'MD'
# Test Plugin
Plugin de test pour valider le pipeline de soumission.
MD

cat > "$TMP_DIR/integration.md" << 'MD'
# Guide d'intégration
Aucune configuration requise.
MD

cat > "$TMP_DIR/contributor.yaml" << 'YAML'
name: test-plugin
author: test
license: MIT
YAML

cat > "$TMP_DIR/requirements.txt" << 'REQ'
# Aucune dépendance externe
REQ

ZIP_PATH="/tmp/test_plugin_$(date +%s).zip"
python3 -c "
import zipfile, os, sys
src = sys.argv[1]
dst = sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, src))
" "$TMP_DIR" "$ZIP_PATH"
rm -rf "$TMP_DIR"
echo -e "${GREEN}✓ ZIP créé : $ZIP_PATH${NC}\n"

# ── 3. Soumission ─────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/4] Soumission du plugin...${NC}"
RESPONSE=$(curl -s -X POST "$BASE_URL/marketplace/submissions" \
  -H "Authorization: Bearer $TOKEN" \
  -F "plugin_name=test-plugin" \
  -F "plugin_version=0.0.1" \
  -F "file=@$ZIP_PATH;type=application/zip")

SUB_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or 'ERREUR: '+str(d))" 2>/dev/null)

if [[ "$SUB_ID" == ERREUR* ]]; then
  echo -e "${RED}✗ Soumission échouée : $RESPONSE${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Soumission créée : $SUB_ID${NC}\n"

# ── 4. Polling du statut ───────────────────────────────────────────────────────
echo -e "${YELLOW}[4/4] Suivi du pipeline (max 120s)...${NC}"
MAX=20
for i in $(seq 1 $MAX); do
  sleep 6
  RESP=$(curl -s "$BASE_URL/marketplace/submissions/$SUB_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null)
  SCORE=$(echo "$RESP"  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('anomaly_score','?'))" 2>/dev/null)

  printf "  [%2ds] status=%-15s score=%s\n" "$((i*6))" "$STATUS" "$SCORE"

  if [[ "$STATUS" != "pending" && "$STATUS" != "processing" ]]; then
    echo ""
    case "$STATUS" in
      approved)      echo -e "${GREEN}✓ APPROUVÉ  (score=$SCORE)${NC}" ;;
      manual_review) echo -e "${YELLOW}⚠ RÉVISION MANUELLE (score=$SCORE)${NC}" ;;
      rejected)      echo -e "${RED}✗ REJETÉ (score=$SCORE)${NC}" ;;
      failed)        echo -e "${RED}✗ ÉCHEC PIPELINE${NC}" ;;
      *)             echo -e "${RED}? Statut inconnu : $STATUS${NC}" ;;
    esac

    # Récupère le rapport
    echo ""
    echo -e "${CYAN}── Rapport complet ──${NC}"
    curl -s "$BASE_URL/marketplace/submissions/$SUB_ID/report" \
      -H "Authorization: Bearer $TOKEN" | python3 -m json.tool 2>/dev/null || echo "(pas de rapport)"

    rm -f "$ZIP_PATH"
    exit 0
  fi
done

echo -e "\n${RED}✗ Timeout — le pipeline n'a pas terminé en 120s${NC}"
echo "  Vérifie les logs : uv run xcore worker logs celery"
rm -f "$ZIP_PATH"
exit 1
