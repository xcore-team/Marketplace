# syntax=docker/dockerfile:1

# ── Backend XCore Marketplace ──────────────────────────────────────────────
# Un seul conteneur fait tourner à la fois l'API (uvicorn) et le worker
# Celery — voir docker-start.sh pour le détail. Build multi-stage : les
# outils de compilation (argon2-cffi, cryptography, aiomysql ont des
# extensions C) ne finissent pas dans l'image finale.

ARG PYTHON_VERSION=3.12-slim

# ── Stage 1 : build de l'environnement virtuel ─────────────────────────────
FROM python:${PYTHON_VERSION} AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    pkg-config \
    # psycopg2 (transitif : xcore-market -> xcoreruntime -> psycopg2) compile
    # depuis les sources — nécessite pg_config + les headers client Postgres,
    # même si vous n'utilisez pas Postgres (MariaDB/MySQL via aiomysql, par
    # ex.) : c'est une dépendance du framework xcoreruntime, pas optionnelle.
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# uv — même gestionnaire de paquets que le dev (uv sync), binaire copié
# directement depuis l'image officielle, pas d'installeur réseau à cette
# étape.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /build

# Couche dépendances seule d'abord (cache Docker — ne se réinvalide que si
# pyproject.toml/uv.lock changent, pas à chaque modif de code).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Puis le code — installe le projet lui-même (app/, pipelines/, sandbox/,
# extensions/, déclarés dans [tool.setuptools.packages.find]) dans le même
# venv. Remplace le besoin de `pip install -e .` documenté pour le dev :
# uv sync le fait déjà en un seul appel, y compris pour un worker Celery
# qui a besoin des mêmes packages app.* importables.
COPY . .
RUN uv sync --frozen --no-dev

# ── Stage 2 : image d'exécution ────────────────────────────────────────────
FROM python:${PYTHON_VERSION}

# libpq5 : bibliothèque partagée dont psycopg2 (compilé contre libpq-dev
# dans le builder) a besoin à l'exécution — sans elle, `import psycopg2`
# échoue au premier chargement de xcoreruntime (ImportError: libpq.so.5).
# Paquet runtime seul (pas -dev, pas de pg_config, rien à compiler ici).
#
# bash : docker-start.sh (API + worker Celery dans le même conteneur, voir
# plus bas) utilise `wait -n`, un builtin bash (4.3+), pour attendre la fin
# du PREMIER des deux processus sans polling — /bin/sh=dash par défaut sur
# Debian ne l'a pas. Paquet "required" donc déjà présent normalement,
# installé explicitement pour ne pas dépendre de ce détail de l'image de
# base.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    bash \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system xcore && useradd --system --gid xcore --create-home xcore

WORKDIR /app

# Venv complet (déjà peuplé), pas besoin de uv/gcc ici. app/ et conf/
# incluent leurs .env.template (git-safe, voir plus bas) — .dockerignore
# exclut uniquement les vrais .env (secrets de dev), jamais les templates.
COPY --from=builder --chown=xcore:xcore /build/.venv /app/.venv
COPY --from=builder --chown=xcore:xcore /build/app /app/app
COPY --from=builder --chown=xcore:xcore /build/conf /app/conf
COPY --from=builder --chown=xcore:xcore /build/pipelines /app/pipelines
COPY --from=builder --chown=xcore:xcore /build/sandbox /app/sandbox
COPY --from=builder --chown=xcore:xcore /build/extensions /app/extensions
COPY --from=builder --chown=xcore:xcore /build/middleware /app/middleware
COPY --from=builder --chown=xcore:xcore /build/data /app/data
COPY --from=builder --chown=xcore:xcore /build/main.py /build/integration.yaml /app/

# Répertoires écrits à l'exécution — logs et stockage local (extension
# xstorage, backend=local) doivent survivre aux redéploiements : montez-les
# en volume plutôt que de compter sur le système de fichiers du conteneur.
RUN mkdir -p /app/log /app/data/storage && chown -R xcore:xcore /app/log /app/data
VOLUME ["/app/log", "/app/data/storage"]

# Aucun .env réel copié ici (ni conf/.env, ni les .env par plugin) —
# seulement leurs .env.template (KEY=${KEY}, aucune valeur, git-safe).
# docker-entrypoint.sh les recopie en .env au démarrage du conteneur ;
# python-dotenv (interpolate=True par défaut) résout alors chaque ${KEY}
# contre la VRAIE variable d'environnement du même nom, injectée par la
# plateforme (Dokploy → Environment) — jamais de secret packagé dans
# l'image. 4 plugins (auth, marketplace, xdeploy, xdevkeys) déclarent
# envconfiguration.inject: true, qui EXIGE que <plugin_dir>/.env existe
# physiquement, sinon ManifestError et le plugin échoue tout court à
# charger — d'où la reconstruction, pas juste une valeur par défaut
# côté Python. Voir docker-entrypoint.sh pour le détail complet.
COPY --chown=xcore:xcore docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --chown=xcore:xcore docker-start.sh /app/docker-start.sh
RUN chmod +x /app/docker-entrypoint.sh /app/docker-start.sh

# Variables à injecter côté plateforme — voir conf/.env.template et
# app/{auth,marketplace,xdeploy,xdevkeys}/.env.template pour la liste
# exacte et exhaustive des clés attendues par fichier (avec commentaires
# sur ce qui est requis vs optionnel). Valeurs de dev dans conf/.env et les
# .env par plugin, à ne jamais déployer telles quelles.

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER xcore

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=3).status == 200 else 1)"

ENTRYPOINT ["/app/docker-entrypoint.sh"]

# docker-entrypoint.sh reconstruit les .env puis fait `exec "$@"` — "$@" ici
# est docker-start.sh, qui lance l'API (uvicorn --workers 4) ET le worker
# Celery (--concurrency 4) en arrière-plan dans le même conteneur, et sort
# (en tuant l'autre process) si l'un des deux meurt — voir docker-start.sh
# pour le détail et le compromis assumé (API/worker ne scalent plus
# indépendamment). --workers ici doit rester synchronisé avec
# app.server.workers dans integration.yaml, et -Q avec app.queues.
#
# Pour revenir à une architecture à deux services Dokploy (API seule ici,
# worker en service séparé, scaling indépendant) : gardez ce Dockerfile tel
# quel et surchargez la commande du second service avec la même ligne
# `celery -A ...` que dans docker-start.sh — même image, mêmes variables
# d'environnement (REDIS_URL/CELERY_BROKER_URL/CELERY_RESULT_BACKEND).
CMD ["/app/docker-start.sh"]
