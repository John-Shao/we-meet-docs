# Django impress

# uv 二进制来源镜像（全局 ARG；国内拉不到 ghcr 时用 build-arg UV_IMAGE 换代理，如 ghcr.m.daocloud.io/astral-sh/uv:0.11.10）
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.11.10

# ---- base image to inherit from ----
FROM python:3.13.13-alpine AS base

# 国内构建可换 Alpine 源（build-arg ALPINE_MIRROR，如 mirrors.aliyun.com）；不传则走官方源。
# ⚠️ PyPI 不换源：uv.lock 用 --locked 锁定 pypi.org，改 index 会令 lock 视为过期而构建失败；pip/uv 走代理即可。
ARG ALPINE_MIRROR=""
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i "s|dl-cdn.alpinelinux.org|$ALPINE_MIRROR|g" /etc/apk/repositories; fi

# Upgrade system packages to install security updates
RUN apk update && apk upgrade --no-cache

# We must do that to avoid having an outdated pip version with security issues
RUN python -m pip install --upgrade pip

# ---- uv 二进制来源阶段（镜像见顶部全局 ARG UV_IMAGE）----
FROM ${UV_IMAGE} AS uv

# ---- Back-end builder image ----
FROM base AS back-builder

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Disable Python downloads, because we want to use the system interpreter
# across both images. If using a managed Python version, it needs to be
# copied from the build image into the final image;
ENV UV_PYTHON_DOWNLOADS=0

# install uv（来自上面的 uv 阶段）
COPY --from=uv /uv /uvx /bin/

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=src/backend/uv.lock,target=uv.lock \
    --mount=type=bind,source=src/backend/pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev
COPY src/backend /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev


# ---- mails ----
FROM node:24 AS mail-builder

# 国内构建可换 npm 源（build-arg NPM_MIRROR，如 https://registry.npmmirror.com）；默认官方
ARG NPM_MIRROR=https://registry.npmjs.org/
ENV npm_config_registry=${NPM_MIRROR}

COPY ./src/mail /mail/app

WORKDIR /mail/app

RUN yarn install --frozen-lockfile && \
  yarn build


# ---- static link collector ----
FROM base AS link-collector
ARG IMPRESS_STATIC_ROOT=/data/static

# Install pango & rdfind
RUN apk add --no-cache \
  pango \
  rdfind

# Copy the application from the builder
COPY --from=back-builder /app /app

WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH"

# collectstatic
RUN DJANGO_CONFIGURATION=Build \
  python manage.py collectstatic --noinput

# Replace duplicated file by a symlink to decrease the overall size of the
# final image
RUN rdfind -makesymlinks true -followsymlinks true -makeresultsfile false ${IMPRESS_STATIC_ROOT}

# ---- Core application image ----
FROM base AS core

ENV PYTHONUNBUFFERED=1

# Install required system libs
RUN apk add --no-cache \
  cairo \
  file \
  font-noto \
  font-noto-emoji \
  gettext \
  gdk-pixbuf \
  libffi-dev \
  pango \
  shared-mime-info

RUN wget https://raw.githubusercontent.com/suitenumerique/django-lasuite/refs/heads/main/assets/conf/mime.types -O /etc/mime.types

# Copy entrypoint
COPY ./docker/files/usr/local/bin/entrypoint /usr/local/bin/entrypoint

# Give the "root" group the same permissions as the "root" user on /etc/passwd
# to allow a user belonging to the root group to add new users; typically the
# docker user (see entrypoint).
RUN chmod g=u /etc/passwd

# Copy the application from the builder
COPY --from=back-builder /app /app

WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH"

# Link certifi certificate from a static path /cert/cacert.pem to avoid issues
# when python is upgraded and the path to the certificate changes.
# The space between print and the ( is intended otherwise the git lint is failing
RUN mkdir /cert && \
  path=`python -c 'import certifi;print (certifi.where())'` && \
  mv $path /cert/ && \
  ln -s /cert/cacert.pem $path

# Generate compiled translation messages
RUN DJANGO_CONFIGURATION=Build \
  python manage.py compilemessages --ignore=".venv/**/*"


# We wrap commands run in this container by the following entrypoint that
# creates a user on-the-fly with the container user ID (see USER) and root group
# ID.
ENTRYPOINT [ "/usr/local/bin/entrypoint" ]

# ---- Development image ----
FROM core AS backend-development

# Switch back to the root user to install development dependencies
USER root:root

# Install psql
RUN apk add --no-cache postgresql-client

# Install development dependencies
RUN --mount=from=ghcr.io/astral-sh/uv:0.11.10,source=/uv,target=/bin/uv \
  uv sync --all-extras --locked

# Restore the un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

# Target database host (e.g. database engine following docker compose services
# name) & port
ENV DB_HOST=postgresql \
  DB_PORT=5432

# Run django development server
CMD [\
  "uvicorn",\
  "--app-dir=/app",\
  "--host=0.0.0.0",\
  "--lifespan=off",\
  "--reload",\
  "--reload-dir=/app",\
  "impress.asgi:application"\
  ]

# ---- Production image ----
FROM core AS backend-production

# Remove apk cache, we don't need it anymore
RUN rm -rf /var/cache/apk/*

ARG IMPRESS_STATIC_ROOT=/data/static

# Gunicorn - not used by default but configuration file is provided
RUN mkdir -p /usr/local/etc/gunicorn
COPY docker/files/usr/local/etc/gunicorn/impress.py /usr/local/etc/gunicorn/impress.py

# Un-privileged user running the application
ARG DOCKER_USER
USER ${DOCKER_USER}

# Copy statics
COPY --from=link-collector ${IMPRESS_STATIC_ROOT} ${IMPRESS_STATIC_ROOT}

# Copy impress mails
COPY --from=mail-builder /mail/backend/core/templates/mail /app/core/templates/mail

# The default command runs uvicorn ASGI server in dics's main module
# WEB_CONCURRENCY: number of workers to run <=> --workers=4
ENV WEB_CONCURRENCY=4
CMD [\
  "uvicorn",\
  "--app-dir=/app",\
  "--host=0.0.0.0",\
  "--timeout-graceful-shutdown=300",\
  "--limit-max-requests=20000",\
  "--lifespan=off",\
  "impress.asgi:application"\
  ]

# To run using gunicorn WSGI server use this instead:
#CMD ["gunicorn", "-c", "/usr/local/etc/gunicorn/conversations.py", "impress.wsgi:application"]
