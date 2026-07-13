#!/usr/bin/env bash
# deploy-impress.sh — 用 secrets.env 注入密钥并 helm 部署/升级 Docs（impress；P3 协作文档）。
#
# 用法：
#   cp deploy/aliyun-docs/secrets.env.example deploy/aliyun-docs/secrets.env   # 填真实密钥
#   bash deploy/aliyun-docs/deploy-impress.sh [额外 helm 参数，如 --dry-run]
#
# 机制：source secrets.env → envsubst 只渲染白名单里的 ${VAR}（避免吞掉 values 里的 /$1 等）
#       → 进程替换喂给 helm。密钥明文不落盘、不入库；docs.values.yaml 里保留 ${VAR} 占位。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
CHART="$REPO_ROOT/src/helm/impress"
VALUES="$HERE/docs.values.yaml"
ENV_FILE="$HERE/secrets.env"

# envsubst 白名单：只替换这些变量（与 secrets.env.example 对应）
VARS='${DOCS_CLIENT_SECRET} ${DOCS_S2S_TOKEN} ${DJANGO_SECRET_KEY} ${DOCS_DB_PASSWORD} ${DOCS_REDIS_PASSWORD} ${OSS_AK} ${OSS_SK} ${Y_PROVIDER_API_KEY} ${COLLAB_SERVER_SECRET} ${SMTP_HOST} ${SMTP_USER} ${SMTP_PASSWORD} ${SMTP_FROM}'

command -v envsubst >/dev/null || { echo "✗ 缺 envsubst：sudo apt install -y gettext-base"; exit 1; }
command -v helm     >/dev/null || { echo "✗ 缺 helm"; exit 1; }
[ -d "$CHART" ]     || { echo "✗ 找不到 chart：$CHART（在 docs-dev 分支的仓库里跑）"; exit 1; }
[ -f "$ENV_FILE" ]  || { echo "✗ 缺 $ENV_FILE：cp secrets.env.example secrets.env 后填值"; exit 1; }

# 载入密钥（仅进程内；值含空格/特殊字符时在 secrets.env 里用双引号包裹）
set -a; . "$ENV_FILE"; set +a

# 必填非空校验（SMTP 视为可选）
missing=()
for v in DOCS_CLIENT_SECRET DOCS_S2S_TOKEN DJANGO_SECRET_KEY DOCS_DB_PASSWORD \
         DOCS_REDIS_PASSWORD OSS_AK OSS_SK Y_PROVIDER_API_KEY COLLAB_SERVER_SECRET; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
[ ${#missing[@]} -eq 0 ] || { echo "✗ secrets.env 未填：${missing[*]}"; exit 1; }

# 前置：确认 Docs 专属 PG/Redis 已就位（由 deploy-datastores.sh 部署），否则 migrate 会连不上库
command -v kubectl >/dev/null || { echo "✗ 缺 kubectl"; exit 1; }
for d in postgres-docs redis-docs; do
  kubectl -n docs get deploy "$d" >/dev/null 2>&1 \
    || { echo "✗ ns docs 缺 deploy/$d：请先跑 bash deploy/aliyun-docs/deploy-datastores.sh"; exit 1; }
done

echo "→ helm upgrade --install impress（ns docs；密钥经 envsubst 注入，明文不落盘）"
helm upgrade --install impress "$CHART" -n docs --create-namespace \
  -f <(envsubst "$VARS" < "$VALUES") "$@"

echo "✓ 完成。迁移： kubectl -n docs exec deploy/impress-backend -- python manage.py migrate"
