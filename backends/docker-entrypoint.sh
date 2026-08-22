#!/bin/sh
set -e

# Reconstruit les .env réels à partir des .env.template embarqués dans
# l'image (voir conf/.env.template et app/{auth,marketplace,xdeploy,
# xdevkeys}/.env.template) — chaque ligne KEY=${KEY} s'auto-résout au
# chargement (python-dotenv, interpolate=True par défaut) contre la vraie
# variable d'environnement du même nom, injectée par la plateforme
# (Dokploy → Environment). Une clé non injectée résout en chaîne vide, pas
# en erreur — mais le FICHIER doit exister : xcore.kernel.security.
# validation.ManifestValidator._inject_dotenv lève ManifestError (et le
# plugin entier échoue à charger, pas juste un warning) si
# envconfiguration.inject: true est déclaré et que <plugin_dir>/.env est
# absent, quel que soit son contenu. auth/marketplace/xdeploy/xdevkeys le
# déclarent — xservices non (voir son plugin.yaml).
#
# Ne touche jamais un .env déjà présent (idempotent — utile si quelqu'un
# monte un vrai .env en volume plutôt que de compter sur les variables
# d'environnement).

reconstruct() {
  template="$1"
  target="$2"
  if [ -f "$template" ] && [ ! -f "$target" ]; then
    cp "$template" "$target"
  fi
}

reconstruct /app/conf/.env.template               /app/conf/.env
reconstruct /app/app/auth/.env.template            /app/app/auth/.env
reconstruct /app/app/marketplace/.env.template     /app/app/marketplace/.env
reconstruct /app/app/xdeploy/.env.template         /app/app/xdeploy/.env
reconstruct /app/app/xdevkeys/.env.template        /app/app/xdevkeys/.env

# Attend que Redis soit résolvable ET joignable avant de lancer l'app.
# Vu en prod (Dokploy) : uvicorn crashe au tout premier essai avec
# "Temporary failure in name resolution" / "Name or service not known"
# sur REDIS_URL — le conteneur API démarre parfois avant que le DNS
# interne de la stack n'ait fini de propager le nom du service Redis
# (les autres services du même conteneur, worker/email/storage, arrivaient
# à se connecter quelques secondes plus tard sans rien changer). Plutôt
# que de laisser xcore.boot() crasher sur cette course au démarrage,
# on bloque ici avec un timeout large, avant que quoi que ce soit ne
# dépende de Redis (cache, pubsub, celery).
#
# python3 (pas nc/redis-cli, absents de l'image finale) via le venv déjà
# sur le PATH — se contente d'un TCP connect, pas d'un vrai PING Redis :
# suffisant pour distinguer "DNS pas encore prêt" de "vraiment injoignable".
if [ -n "$REDIS_URL" ]; then
  python3 - "$REDIS_URL" <<'PY'
import sys, socket, time
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
host, port = url.hostname, url.port or 6379
deadline = time.monotonic() + 60
attempt = 0
while True:
    attempt += 1
    try:
        with socket.create_connection((host, port), timeout=3):
            print(f"[docker-entrypoint] Redis {host}:{port} joignable (essai {attempt}).")
            break
    except OSError as exc:
        if time.monotonic() >= deadline:
            print(f"[docker-entrypoint] Redis {host}:{port} injoignable après {attempt} essais ({exc}) — on démarre quand même, xcore.boot() donnera l'erreur détaillée.")
            break
        print(f"[docker-entrypoint] Redis {host}:{port} pas encore joignable ({exc}), nouvel essai...")
        time.sleep(2)
PY
fi

exec "$@"
