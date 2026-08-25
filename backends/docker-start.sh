#!/bin/bash
set -e

# Lance l'API (uvicorn) et le worker Celery dans le MÊME conteneur, en
# arrière-plan tous les deux. `wait -n` (bash — nécessite bash, pas juste
# sh/dash) rend la main dès que l'UN OU L'AUTRE se termine, quel qu'il soit
# — si le worker crashe pendant que l'API tourne encore, on ne veut pas
# rester dans cet état dégradé sans que personne ne le remarque : on tue
# l'autre processus et on sort avec le code d'erreur, pour que Docker
# (restart policy côté Dokploy) relance le conteneur ENTIER, pas la moitié
# cassée. Le SIGTERM d'un `docker stop`/redéploiement est aussi relayé aux
# deux enfants (sinon Docker les tue au bout du grace period par SIGKILL —
# pas de arrêt propre, tâches Celery en cours coupées net).
#
# Compromis assumé : API et worker ne scalent plus indépendamment (avant,
# un second service Dokploy pouvait n'avoir que le worker et scaler à part
# — voir l'historique de ce fichier).
#
# --workers 1 / --concurrency 1 : temporaire, pour du debug — les logs à
# plusieurs workers (chaque worker fait son propre xcore.boot() complet,
# en parallèle) rendaient les vrais problèmes illisibles noyés dans 3-4
# séquences de boot entrelacées. Remettre à 4/4 une fois le débogage en
# cours terminé.

trap 'kill -TERM $(jobs -p) 2>/dev/null; wait' TERM INT

uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 &

celery -A xcore.services.xworker.xworker:_celery_worker worker \
  --loglevel info -Q submissions,default,result --concurrency 1 &

wait -n
exit_code=$?
kill -TERM $(jobs -p) 2>/dev/null
wait
exit "$exit_code"
