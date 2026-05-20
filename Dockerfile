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
    git config --global --unset url."https://${GITHUB_TOKEN}@github.com/".insteadOf

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



# Créer le .env de xauth
RUN cat > app/xauth/.env << 'EOF'
XAUTH_APP_NAME=Xcore
ADMIN_EMAIL=contact@xcorehub.dev
ADMIN_PASSWORD=Hunters123@
ADMIN_TENANT_SLUG=default
ADMIN_TENANT_NAME=Default
ADMIN_ROLE_NAME=admin
USER_ROLE_NAME=user
XAUTH_JWT_PRIVATE_KEY_PATH=conf/private.pem
XAUTH_JWT_PUBLIC_KEY_PATH=conf/public.pem
XAUTH_JWT_ACCESS_EXPIRE_MINUTES=15
XAUTH_JWT_REFRESH_EXPIRE_DAYS=7
XAUTH_SMTP_HOST=mail.xcorehub.dev
XAUTH_SMTP_PORT=587
XAUTH_SMTP_USER=contact@xcorehub.dev
XAUTH_SMTP_PASSWORD=OChrIn,%,71
XAUTH_SMTP_FROM=contact@xcorehub.dev
XAUTH_SMTP_FROM_NAME=XcoreHub
XAUTH_SMTP_USE_TLS=true
XAUTH_APP_BASE_URL=https://api.xcorehub.dev
XAUTH_OAUTH_GITHUB_CLIENT_ID=Ov23liGm2q4FT6nQhpVO
XAUTH_OAUTH_GITHUB_CLIENT_SECRET=7bef5aa6fd5ec9a105b60e646983d43474546a8e
XAUTH_OAUTH_GOOGLE_CLIENT_ID=
XAUTH_OAUTH_GOOGLE_CLIENT_SECRET=
XAUTH_OAUTH_DISCORD_CLIENT_ID=
XAUTH_OAUTH_DISCORD_CLIENT_SECRET=
XAUTH_OAUTH_MICROSOFT_CLIENT_ID=
XAUTH_OAUTH_MICROSOFT_CLIENT_SECRET=
EOF

# Install the project
RUN uv sync --frozen
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
