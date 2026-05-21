FROM python:3.12-slim-bookworm

ARG GITHUB_TOKEN

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -Ls https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy backend files
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# Copy the rest of the application
COPY . .

# Clone les submodules (Dokploy ne le fait pas automatiquement)
RUN git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/" && \
    git clone --depth 1 https://${GITHUB_TOKEN}@github.com/xcore-team/xauth         app/xauth         && \
    git clone --depth 1 https://${GITHUB_TOKEN}@github.com/traoreera/xpulse          app/xpulse        && \
    git clone --depth 1 https://${GITHUB_TOKEN}@github.com/xcore-team/xmailler       extensions/xmailler   && \
    git clone --depth 1 https://${GITHUB_TOKEN}@github.com/xcore-team/xworker        extensions/xworker    && \
    git clone --depth 1 https://${GITHUB_TOKEN}@github.com/xcore-team/xwebsocket     extensions/xwebsocket && \
    git clone --depth 1 https://${GITHUB_TOKEN}@github.com/traoreera/extpubsub       extensions/extpubsub  && \
    git config --global --unset url."https://${GITHUB_TOKEN}@github.com/".insteadOf && \
    sed -i 's|/app/auth/oauth/|/app/v1/auth/oauth/|g' app/xauth/src/main.py

# xpulse requiert un .env.example (envconfiguration.inject=true)
RUN cat > app/xpulse/.env << 'EOF'
URL = "redis://default:xhst0ifo2bccgz8f@xcorehub-marketplaceredis-99bjdh:6379/0"
CHANNEL = "notification,systeme,hunters"
MAX_CONCURRENT_STREAMS = 1000
MAX_CHANNELS_PER_STREAM = 20 # limite de channels par connexion SSE
HEARTBEAT_INTERVAL = 15.0
MESSAGE_TIMEOUT = 0.05
RECONNECT_MAX_RETRIES = 5
RECONNECT_BASE_DELAY = 0.5
EOF

RUN cat > app/xdevkeys/.env << 'EOF'
DEVKEYS_MASTER_KEY=fc171f1c60b523afff3e59837b92ca0d16d571247e9005c9c9b59d606b85f1b1
EOF

RUN cat > app/marketplace/.env << 'EOF'
MARKET_APP_NAME=XcoreHub
MARKET_APP_BASE_URL=https://api.xcorehub.dev
DEVKEYS_MASTER_KEY=fc171f1c60b523afff3e59837b92ca0d16d571247e9005c9c9b59d606b85f1b1
MARKET_SECRET_KEY=4a171aeab4d3f6ad0702b0137d979fa404c71273aa6bc06e2d60f2ff86b226f2
MARKET_SANDBOX_MEMORY_MB=128
MARKET_SANDBOX_CPU_SECONDS=10
MARKET_SANDBOX_TIMEOUT=30
EOF


# Créer le .env de xauth
RUN cat > app/xauth/.env << 'EOF'

XAUTH_APP_NAME= "XcoreHub"
# admin credentials
ADMIN_EMAIL = "contact@xcorehub.dev"
ADMIN_PASSWORD = "Hunters123@"
ADMIN_TENANT_SLUG = "default"
ADMIN_TENANT_NAME = "Default"
ADMIN_ROLE_NAME = "admin"
USER_ROLE_NAME = "user"
# JWT RS256 — chemins vers les fichiers PEM (relatifs à la racine du projet)
XAUTH_JWT_PRIVATE_KEY_PATH=conf/private.pem
XAUTH_JWT_PUBLIC_KEY_PATH=conf/public.pem
XAUTH_JWT_ACCESS_EXPIRE_MINUTES=50
XAUTH_JWT_REFRESH_EXPIRE_DAYS=7
# URL de base — liens d'invitation et redirects OAuth
XAUTH_APP_BASE_URL=https://api.xcorehub.dev
XAUTH_OAUTH_GITHUB_CLIENT_ID=Ov23liGm2q4FT6nQhpVO
XAUTH_OAUTH_GITHUB_CLIENT_SECRET=464bd1bc522ed74a745ec3cd34ad1045b748402d
EOF

# Install the project
RUN uv sync --frozen
EXPOSE 8000

CMD ["uv", "run", "xcli", "worker", "start", "-w 2", "-c 8"]
