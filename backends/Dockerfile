# syntax=docker/dockerfile:1

# ── Backend XCore Marketplace ──────────────────────────────────────────────
# Image unique servant à la fois l'API (défaut) et le worker Celery — voir
# le commentaire tout en bas pour la commande à utiliser pour le worker.
# Build multi-stage : les outils de compilation (argon2-cffi, cryptography,
# aiomysql ont des extensions C) ne finissent pas dans l'image finale.

ARG PYTHON_VERSION=3.12-slim

# ── Stage 1 : build de l'environnement virtuel ─────────────────────────────
FROM python:${PYTHON_VERSION} AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    libssl-dev \
    pkg-config \
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
RUN chmod +x /app/docker-entrypoint.sh

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

# --workers reprend app.server.workers dans integration.yaml — les deux
# doivent rester synchronisés si vous changez l'un sans l'autre (ce Dockerfile
# ne relit pas integration.yaml pour déterminer sa propre commande).
CMD ["xcli", "worker", "process", "start", "-c" "4", "-d"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# ── Worker Celery (même image) ─────────────────────────────────────────────
# Dokploy (ou équivalent) : créez un second service à partir de la même
# image/build, en surchargeant uniquement la commande :
#
#   celery -A xcore.services.xworker.xworker:_celery_worker worker \
#     --loglevel info -Q submissions,default,result --concurrency 4
#
# Même image, mêmes variables d'environnement (REDIS_URL/
# CELERY_BROKER_URL/CELERY_RESULT_BACKEND partagés avec l'API) — voir
# CLAUDE.md "Development Commands" pour la commande équivalente en dev.
