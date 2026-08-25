#!/bin/sh
set -e

# Résout les `source:` de deployment/install.yaml, s'il y en a. Les 14
# plugins/extensions qui passaient par là (app/auth, app/marketplace,
# app/xadmin, app/xdeploy, app/xdeployments, app/xdevkeys, app/xdocs,
# app/xpulses, app/xservices, extensions/pubsub, extensions/xmailler,
# extensions/xmailproxy, extensions/xstorage, extensions/xwebsocket) sont
# maintenant TOUS committés directement dans ce repo (voir install.yaml) —
# l'un d'eux (app/marketplace) EST le backend marketplace lui-même, donc
# le résoudre depuis "le marketplace" au démarrage créait une dépendance
# circulaire (il faut qu'une instance soit déjà en service pour répondre à
# cette requête). Reproduit en conditions réelles : conteneur arrêté puis
# relancé -> plus d'instance pour servir l'artefact -> resolve-sources
# échoue en boucle, redémarrage impossible.
#
# install.yaml n'a donc plus aucun `source:` — resolve_all_sources()
# (xcore-agent) traite une liste de steps sans source comme un succès
# immédiat, pas une erreur (liste résolue vide = normal). Gardé quand même
# ici (au lieu de retirer l'appel) : si un `source:` marketplace revient un
# jour dans install.yaml pour un cas qui n'a pas ce problème circulaire,
# cette étape doit continuer à tourner sans qu'on ait à toucher ce script.
# XCORE_MARKETPLACE_API_KEY/SIGNING_SECRET ne sont donc plus requises pour
# démarrer — elles ne servent qu'aux steps qui déclarent un `source:`
# marketplace_slug (aucune actuellement), et xcore-agent lui-même ne les
# exige pas (voir resolve_sources_cmd).
_resolve_attempts=6
_resolve_backoff=10
_attempt=1
while true; do
  echo "[docker-entrypoint] Résolution des sources de deployment/install.yaml (essai ${_attempt}/${_resolve_attempts})..."
  if xcore-agent resolve-sources /app --install-plan /app/deployment/install.yaml; then
    break
  fi
  if [ "$_attempt" -ge "$_resolve_attempts" ]; then
    echo "[docker-entrypoint] resolve-sources a échoué après ${_resolve_attempts} essais — arrêt." >&2
    exit 1
  fi
  _attempt=$((_attempt + 1))
  echo "[docker-entrypoint] Nouvel essai dans ${_resolve_backoff}s..."
  sleep "$_resolve_backoff"
done

# Reconstruit les .env réels à partir des .env.template — ceux d'auth/
# xdeploy/xdevkeys n'existent QUE depuis la résolution marketplace
# au-dessus (chacun apporte le sien, jamais committé dans ce repo), d'où
# cet ordre ; celui de marketplace est committé directement ici (voir plus
# haut) donc déjà présent avant même la résolution, mais reconstruct()
# fonctionne pareil dans les deux cas. reconstruct() est un no-op
# silencieux si le template est absent, donc une résolution ratée ne
# casserait pas ici — c'est déjà couvert par le exit 1 ci-dessus. Chaque
# ligne KEY=${KEY} s'auto-résout
# au chargement (python-dotenv, interpolate=True par défaut) contre la
# vraie variable d'environnement du même nom, injectée par la plateforme
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
