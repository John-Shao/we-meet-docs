#!/usr/bin/env bash
# deploy-datastores.sh — 在 aliyun-docs 本机（k3s）部署 Docs 专属 PG + Redis（P3 协作文档）。
#
# 用法：
#   cp deploy/aliyun-docs/secrets.env.example deploy/aliyun-docs/secrets.env  # 填 DOCS_DB_PASSWORD / DOCS_REDIS_PASSWORD
#   bash deploy/aliyun-docs/deploy-datastores.sh [额外 kubectl apply 参数，如 --dry-run=client]
#   # ⚠️ 先跑本脚本建库，再跑 deploy-impress.sh 部署 impress（backend migrate 需要库已就绪）
#
# 机制：source secrets.env → envsubst 只渲染白名单里的两个密码 → kubectl apply -n docs。
#       密码明文不落盘、不入库；datastores.yaml 里保留 ${DOCS_DB_PASSWORD}/${DOCS_REDIS_PASSWORD} 占位。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/datastores.yaml"
ENV_FILE="$HERE/secrets.env"
NS=docs

# envsubst 白名单：只替换这两个密码，别碰 manifest 里的 $(REDIS_PASSWORD) 等 k8s 展开语法
VARS='${DOCS_DB_PASSWORD} ${DOCS_REDIS_PASSWORD}'

command -v envsubst >/dev/null || { echo "✗ 缺 envsubst：sudo apt install -y gettext-base"; exit 1; }
command -v kubectl  >/dev/null || { echo "✗ 缺 kubectl"; exit 1; }
[ -f "$MANIFEST" ]  || { echo "✗ 找不到 manifest：$MANIFEST"; exit 1; }
[ -f "$ENV_FILE" ]  || { echo "✗ 缺 $ENV_FILE：cp secrets.env.example secrets.env 后填值"; exit 1; }

# 载入密码（仅进程内）
set -a; . "$ENV_FILE"; set +a

# 必填非空校验
missing=()
for v in DOCS_DB_PASSWORD DOCS_REDIS_PASSWORD; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
[ ${#missing[@]} -eq 0 ] || { echo "✗ secrets.env 未填：${missing[*]}"; exit 1; }

# 命名空间（与 deploy-impress.sh 的 --create-namespace 对齐，先建好）
kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

echo "→ kubectl apply PG + Redis（ns $NS；密码经 envsubst 注入，明文不落盘）"
envsubst "$VARS" < "$MANIFEST" | kubectl apply -n "$NS" -f - "$@"

# --dry-run 时不等 rollout
case " $* " in
  *" --dry-run"*) echo "✓ dry-run 完成（未真正部署）"; exit 0 ;;
esac

echo "→ 等 PG / Redis 就绪…"
kubectl -n "$NS" rollout status deploy/postgres-docs --timeout=180s
kubectl -n "$NS" rollout status deploy/redis-docs    --timeout=120s

echo "✓ 完成。数据落在本机 hostPath /data/docs/{postgresql,redis}（备份记得打包该目录）。"
echo "  下一步： bash deploy/aliyun-docs/deploy-impress.sh   # helm 部署 impress"
