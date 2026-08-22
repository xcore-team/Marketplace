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

exec "$@"
