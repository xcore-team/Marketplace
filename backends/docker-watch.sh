#!/bin/bash
set -e

# Poursuit à l'exécution la résolution marketplace de deployment/install.yaml
# — voir le commentaire du Dockerfile au niveau de la RUN resolve-sources
# pour le pourquoi du build-time-first, et xcore_agent.watch_sources (côté
# xcore-agent) pour le pourquoi watch-marketplace (une seule cible par
# install.yaml) ne convient pas ici : cette appli dépend de ~14 plugins/
# extensions marketplace indépendants dans UN install.yaml partagé.
#
# --exit-on-update : sort (code 0) dès qu'au moins une mise à jour est
# appliquée sur disque, plutôt que de continuer à sonder. docker-start.sh
# attend ce script comme un job de fond au même titre qu'uvicorn/Celery
# (`wait -n`) — sa sortie fait donc sortir TOUT le conteneur, et la
# politique de redémarrage Docker/Dokploy relance le MÊME conteneur (couche
# disque préservée), qui relit alors le nouveau code écrit ici dès le
# prochain boot. Pas de rebuild d'image nécessaire pour ce cas précis.
#
# Point non vérifié empiriquement : que le redémarrage Dokploy relance bien
# le MÊME conteneur (couche préservée) plutôt que d'en recréer un neuf
# depuis l'image (couche perdue, donc mise à jour silencieusement annulée
# au redémarrage suivant) — à confirmer une fois déployé.
#
# Sonde toutes les MARKETPLACE_WATCH_INTERVAL secondes (5 min par défaut) ;
# un tick en échec (marketplace injoignable, une seule source en erreur)
# n'arrête jamais la boucle — voir xcore_agent.watch_sources.check_once.
exec xcore-agent watch-sources /app \
  --install-plan /app/deployment/install.yaml \
  --interval "${MARKETPLACE_WATCH_INTERVAL:-300}" \
  --exit-on-update
