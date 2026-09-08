#!/usr/bin/env bash
# Pull source and deploy previously built Docs images, then wait for readiness.
#
# 用法：
#   cp deploy/aliyun-docs/secrets.env.example deploy/aliyun-docs/secrets.env   # 填真实密钥
#   bash deploy/aliyun-docs/deploy-impress.sh
#   bash deploy/aliyun-docs/deploy-impress.sh --tag b5a4c2b3 --timeout 15m
#
# 机制：source secrets.env → envsubst 只渲染白名单里的 ${VAR}（避免吞掉 values 里的 /$1 等）
#       → 进程替换喂给 helm。密钥明文不落盘、不入库；docs.values.yaml 里保留 ${VAR} 占位。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
CHART="$REPO_ROOT/src/helm/impress"
VALUES="$HERE/docs.values.yaml"
ENV_FILE="$HERE/secrets.env"
ORIGINAL_ARGS=("$@")
BRANCH="${BRANCH:-}"
IMAGE_TAG="${TAG:-}"
TIMEOUT="${TIMEOUT:-10m}"
SKIP_GIT_PULL=0
DRY_RUN=0
HELM_ARGS=()

die() {
  echo "✗ $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: bash deploy/aliyun-docs/deploy-impress.sh [options] [extra Helm arguments]

Pull the current branch with --ff-only, deploy existing images, and wait for
Jobs and Deployments. Build and push the images before running this script.

Options:
  --branch <name>   Branch to check out and pull (default: current branch / BRANCH)
  --tag <tag>       Image tag (default: TAG, DOCS_IMAGE_TAG, then updated HEAD SHA)
  --skip-git-pull   Use the local checkout without switching branches or pulling
  --timeout <time>  Helm and rollout timeout (default: 10m / TIMEOUT)
  --dry-run        Validate with Helm without deploying or printing secret manifests
  -h, --help       Show help

Additional Helm arguments such as --set and -f are passed through. Namespace
and release remain docs/impress; image tags and readiness waits are managed here.
EOF
}

while (($#)); do
  case "$1" in
    --branch|--tag|--timeout)
      (($# >= 2)) && [[ -n "$2" && "$2" != --* ]] || die "$1 requires a value"
      case "$1" in
        --branch) BRANCH=$2 ;;
        --tag) IMAGE_TAG=$2 ;;
        --timeout) TIMEOUT=$2 ;;
      esac
      shift 2
      ;;
    --branch=*) BRANCH=${1#*=}; shift ;;
    --tag=*) IMAGE_TAG=${1#*=}; shift ;;
    --timeout=*) TIMEOUT=${1#*=}; shift ;;
    --skip-git-pull) SKIP_GIT_PULL=1; shift ;;
    --dry-run|--dry-run=client|--dry-run=server)
      DRY_RUN=1; HELM_ARGS+=("$1"); shift ;;
    --dry-run=*) die "use --dry-run, --dry-run=client or --dry-run=server" ;;
    -h|--help) usage; exit 0 ;;
    --kube-context|--kube-context=*|--kubeconfig|--kubeconfig=*)
      die "set KUBECONFIG and its current context so Helm and kubectl use the same cluster" ;;
    *) HELM_ARGS+=("$1"); shift ;;
  esac
done

for command in git envsubst helm kubectl; do
  command -v "$command" >/dev/null || die "missing required command: $command"
done
[[ "$TIMEOUT" =~ ^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$ && "$TIMEOUT" =~ [1-9] ]] \
  || die "invalid timeout: $TIMEOUT (example: 10m)"

cd "$REPO_ROOT"
if ((SKIP_GIT_PULL == 0)) && [[ "${DOCS_DEPLOY_SOURCE_UPDATED:-}" != 1 ]]; then
  git diff --quiet && git diff --cached --quiet \
    || die "tracked files have local changes; commit them or use --skip-git-pull"
  BRANCH=${BRANCH:-$(git branch --show-current)}
  [[ -n "$BRANCH" ]] || die "HEAD is detached; specify --branch or --skip-git-pull"
  if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      git checkout "$BRANCH"
    else
      git fetch origin "$BRANCH"
      git checkout --track "origin/$BRANCH"
    fi
  fi
  echo "==> Updating source: origin/$BRANCH"
  git pull --ff-only origin "$BRANCH"
  # Re-enter the updated script before reading charts, values, or credentials.
  exec env DOCS_DEPLOY_SOURCE_UPDATED=1 bash "$HERE/deploy-impress.sh" "${ORIGINAL_ARGS[@]}"
fi
unset DOCS_DEPLOY_SOURCE_UPDATED

# envsubst 白名单：只替换这些变量（密钥来自 secrets.env；DOCS_IMAGE_TAG 来自 TAG）
VARS='${DOCS_CLIENT_SECRET} ${DOCS_S2S_TOKEN} ${DJANGO_SECRET_KEY} ${DOCS_DB_PASSWORD} ${DOCS_REDIS_PASSWORD} ${OSS_AK} ${OSS_SK} ${Y_PROVIDER_API_KEY} ${COLLAB_SERVER_SECRET} ${SMTP_HOST} ${SMTP_USER} ${SMTP_PASSWORD} ${SMTP_FROM} ${DOCS_IMAGE_TAG}'

[ -d "$CHART" ]     || { echo "✗ 找不到 chart：$CHART"; exit 1; }
[ -f "$ENV_FILE" ]  || { echo "✗ 缺 $ENV_FILE：cp secrets.env.example secrets.env 后填值"; exit 1; }

# 载入密钥（仅进程内；值含空格/特殊字符时在 secrets.env 里用双引号包裹）
set -a; . "$ENV_FILE"; set +a

# 镜像 tag 单一来源，注入 docs.values.yaml 的 3 处 ${DOCS_IMAGE_TAG}（不再手改 values）。
# 默认 = 拉取后的 commit 短 sha（须已在构建机 build-and-push）。
# 覆盖：TAG=xxx bash ...（build 与 deploy 传同值）；也可在 secrets.env 设 DOCS_IMAGE_TAG。
export DOCS_IMAGE_TAG="${IMAGE_TAG:-${TAG:-${DOCS_IMAGE_TAG:-$(git rev-parse --short HEAD)}}}"
[ -n "$DOCS_IMAGE_TAG" ] || { echo "✗ 未指定镜像 tag 且无法取 git 短 sha：请显式传 TAG=<tag>（与 build 同值）"; exit 1; }
[[ "$DOCS_IMAGE_TAG" != latest && "$DOCS_IMAGE_TAG" =~ ^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$ ]] \
  || die "use an immutable image tag, not latest: $DOCS_IMAGE_TAG"

# 必填非空校验（SMTP 视为可选）
missing=()
for v in DOCS_CLIENT_SECRET DOCS_S2S_TOKEN DJANGO_SECRET_KEY DOCS_DB_PASSWORD \
         DOCS_REDIS_PASSWORD OSS_AK OSS_SK Y_PROVIDER_API_KEY COLLAB_SERVER_SECRET; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
[ ${#missing[@]} -eq 0 ] || { echo "✗ secrets.env 未填：${missing[*]}"; exit 1; }

# 前置：确认 Docs 专属 PG/Redis 已就位（由 deploy-datastores.sh 部署），否则 migrate 会连不上库
for d in postgres-docs redis-docs; do
  kubectl -n docs get deploy "$d" >/dev/null 2>&1 \
    || { echo "✗ ns docs 缺 deploy/$d：请先跑 bash deploy/aliyun-docs/deploy-datastores.sh"; exit 1; }
done

deployment_failed() {
  local status=$1
  echo "✗ Docs 更新失败或超时；请检查以下 Pod 状态及事件。" >&2
  kubectl -n docs get pods -l app.kubernetes.io/instance=impress -o wide >&2 || true
  kubectl -n docs get events --sort-by=.lastTimestamp | tail -n 40 >&2 || true
  exit "$status"
}

helm_args=(
  "${HELM_ARGS[@]}"
  -n docs
  --set-string "image.tag=$DOCS_IMAGE_TAG"
  --set-string "backend.image.tag=$DOCS_IMAGE_TAG"
  --set-string "frontend.image.tag=$DOCS_IMAGE_TAG"
  --set-string "yProvider.image.tag=$DOCS_IMAGE_TAG"
  --wait --wait-for-jobs --timeout "$TIMEOUT"
)

run_helm() {
  helm upgrade --install impress "$CHART" --create-namespace \
    -f <(envsubst "$VARS" < "$VALUES") "${helm_args[@]}"
}

echo "→ helm upgrade --install impress（ns docs；镜像 tag=${DOCS_IMAGE_TAG}；密钥经 envsubst 注入，明文不落盘）"
if ((DRY_RUN)); then
  # Rendered Deployment env values also contain credentials, not only Secrets.
  run_helm >/dev/null
  echo "✓ Dry run 通过；未部署，未等待工作负载。"
  exit 0
fi

run_helm || deployment_failed "$?"

# Helm waits for Jobs (including migrations); rollout status additionally waits
# for all old replicas to leave, rather than accepting only minimum availability.
deployments=$(kubectl -n docs get deployments -l app.kubernetes.io/instance=impress -o name) \
  || deployment_failed "$?"
[[ -n "$deployments" ]] || deployment_failed 1
while IFS= read -r deployment; do
  kubectl -n docs rollout status "$deployment" --timeout="$TIMEOUT" \
    || deployment_failed "$?"
done <<< "$deployments"

echo "==> Running images"
kubectl -n docs get deployments -l app.kubernetes.io/instance=impress \
  -o 'custom-columns=DEPLOYMENT:.metadata.name,READY:.status.readyReplicas,IMAGES:.spec.template.spec.containers[*].image' \
  || deployment_failed "$?"
echo "✓ Docs 更新完成：任务已完成，所有 Deployment 已完成滚动更新。"
