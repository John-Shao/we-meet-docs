#!/usr/bin/env bash
# check-node-registry.sh — aliyun-docs 节点镜像源自检（只读，不修改任何配置）。
#
# 为什么需要：K3s 自带 containerd 只读 /etc/rancher/k3s/registries.yaml，**不读**
# /etc/docker/daemon.json（那是 docker daemon 的 mirror）。而 pod sandbox 基础镜像
# （默认 rancher/mirrored-pause:3.6）只要被 kubelet image GC 回收（磁盘吃紧、
# k3s 升级换了 tag），就依赖节点能重新拉到它。docker.io 在 CN 不可达 + 没有 mirror
# 时，所有新 Pod 都会卡在 FailedCreatePodSandBox，helm --wait 只报
# "context deadline exceeded"，看起来像部署脚本坏了。本脚本把这几项一次查清。
#
# 用法：
#   sudo bash deploy/aliyun-docs/check-node-registry.sh
#   sudo ALIYUN_DOCKER_MIRROR=https://<ID>.mirror.aliyuncs.com bash deploy/aliyun-docs/check-node-registry.sh
#   sudo PAUSE_IMAGE=jusi-cn-guangzhou.cr.volces.com/docs/pause:3.6 bash .../check-node-registry.sh
#
# 退出码：0 = 通过（警告不阻断）；1 = 有阻断项，按输出里的命令修。
set -euo pipefail

REGISTRIES_FILE="${REGISTRIES_FILE:-/etc/rancher/k3s/registries.yaml}"
CONTAINERD_CONFIG="${CONTAINERD_CONFIG:-/var/lib/rancher/k3s/agent/etc/containerd/config.toml}"
K3S_DATA_DIR="${K3S_DATA_DIR:-/var/lib/rancher/k3s}"
CR_HOST="${CR_HOST:-jusi-cn-guangzhou.cr.volces.com}"
DEFAULT_PAUSE_IMAGE="rancher/mirrored-pause:3.6"
PROBE_TIMEOUT="${PROBE_TIMEOUT:-10}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"

failures=0
warnings=0
ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; warnings=$((warnings + 1)); }
bad()  { printf '✗ %s\n' "$*"; failures=$((failures + 1)); }

echo "==> 节点镜像源自检：registries.yaml / 私有 CR 凭据 / sandbox 基础镜像"

# ─── 1. registries.yaml：mirrors + 私有 CR 凭据 ───────────────────────────
mirrors_block=""
if [ ! -f "$REGISTRIES_FILE" ]; then
  bad "缺 $REGISTRIES_FILE：K3s containerd 既没有 mirror 也没有私有 CR 凭据"
else
  ok "找到 $REGISTRIES_FILE"

  # mirrors: 段（到下一个顶格键为止）
  mirrors_block="$(awk 'f && /^[^[:space:]]/ {exit} /^[[:space:]]*mirrors:[[:space:]]*$/ {f=1} f {print}' \
    "$REGISTRIES_FILE")"

  if [ -z "$mirrors_block" ]; then
    bad "没有 mirrors: 段 —— 只有 /etc/docker/daemon.json 的加速对 K3s 无效（containerd 不读它）"
  elif ! printf '%s\n' "$mirrors_block" | grep -qE '^[[:space:]]*"?docker\.io"?[[:space:]]*:'; then
    bad "mirrors: 段里没有 docker.io —— pause 基础镜像、postgres、redis 都来自 docker.io"
  else
    ok "已配置 mirrors.docker.io"
  fi

  # 私有火山 CR 凭据（impress 三镜像所在仓库）
  cr_block="$(awk -v host="$CR_HOST" 'index($0, host) {f=1} f {print}' "$REGISTRIES_FILE")"
  if [ -z "$cr_block" ]; then
    bad "没有 $CR_HOST 的 configs 段 —— 私有 CR 缺凭据时 impress 各 Pod 会 ImagePullBackOff"
  elif ! printf '%s\n' "$cr_block" | grep -q 'auth:' \
    || ! printf '%s\n' "$cr_block" | grep -qE 'username:[[:space:]]*[^[:space:]]' \
    || ! printf '%s\n' "$cr_block" | grep -qE 'password:[[:space:]]*[^[:space:]]'; then
    bad "$CR_HOST 的凭据不完整（auth: 下需要非空 username / password）"
  else
    ok "$CR_HOST 拉取凭据已配置"
  fi
fi

# ─── 2. docker.io mirror 可达性（照抄配置逐个探活） ───────────────────────
endpoints=""
if [ -n "$mirrors_block" ]; then
  endpoints="$(printf '%s\n' "$mirrors_block" \
    | grep -oE "https?://[^\"'[:space:]]+" | sort -u || true)"
fi
[ -n "$endpoints" ] || endpoints="${ALIYUN_DOCKER_MIRROR:-${DOCKER_MIRROR:-}}"

reachable=""
if [ -z "$endpoints" ]; then
  warn "没有可探测的 docker.io mirror（registries.yaml 里没有 endpoint，也未设 ALIYUN_DOCKER_MIRROR）"
elif ! command -v curl >/dev/null 2>&1; then
  warn "缺 curl，跳过 mirror 探活：sudo apt install -y curl"
else
  for endpoint in $endpoints; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$PROBE_TIMEOUT" \
      "${endpoint%/}/v2/" 2>/dev/null || true)"
    case "$code" in
      200|401) ok "mirror 可达：$endpoint（HTTP $code）"; reachable="$endpoint" ;;
      *) bad "mirror 不可达：$endpoint（HTTP ${code:-超时/拒绝}）" ;;
    esac
  done
  [ -n "$reachable" ] || bad "docker.io mirror 全军覆没：先换一个可用的再部署（阿里云 ECS 用控制台给的专属 *.mirror.aliyuncs.com）"
fi

# ─── 3. sandbox 基础镜像是否还在本地 ─────────────────────────────────────
pause_image="${PAUSE_IMAGE:-}"
if [ -z "$pause_image" ] && [ -f "$CONTAINERD_CONFIG" ]; then
  # k3s 生成的 containerd 配置里 sandbox_image 才是真实值（含 --pause-image 覆盖）
  pause_image="$(sed -n 's/^[[:space:]]*sandbox_image[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$CONTAINERD_CONFIG" | head -n 1)"
fi
pause_image="${pause_image:-$DEFAULT_PAUSE_IMAGE}"
pause_ref="$pause_image"
case "$pause_ref" in
  */*/*) ;;                              # 已是 host/ns/repo 完整引用
  */*) pause_ref="docker.io/$pause_ref" ;;  # rancher/mirrored-pause:3.6 → docker.io/...
esac

if ! command -v k3s >/dev/null 2>&1; then
  bad "找不到 k3s 命令，无法查询节点容器运行时"
else
  images=""
  if ! images="$(k3s ctr -n k8s.io images ls -q 2>/dev/null)"; then
    images=""
    bad "查询 containerd 镜像失败（多为非 root；也可能 containerd 未就绪）—— 请用 sudo 重跑本脚本"
  fi
  if [ -n "$images" ]; then
    if printf '%s\n' "$images" | grep -qxF "$pause_ref"; then
      ok "sandbox 基础镜像已在本地：$pause_ref"
    else
      bad "本地缺 sandbox 基础镜像 $pause_ref —— 新 Pod 会一直 FailedCreatePodSandBox"
      printf '    以下补救都不用重启 k3s：\n'
      printf '      a) 本地还留着别的 pause tag：\n'
      printf '         sudo k3s ctr -n k8s.io images tag docker.io/rancher/mirrored-pause:3.5 %s\n' "$pause_ref"
      printf '      b) 借可达 mirror 拉下来再改名：\n'
      printf '         M=<mirror主机>; sudo k3s ctr -n k8s.io images pull "$M/%s" && \\\n' "$pause_image"
      printf '           sudo k3s ctr -n k8s.io images tag "$M/%s" %s\n' "$pause_image" "$pause_ref"
      printf '      c) 完全离线：构建机 docker save 后 scp 过来，\n'
      printf '         gunzip -c pause.tgz | sudo k3s ctr -n k8s.io images import -\n'
    fi
  fi
fi

# ─── 4. 磁盘余量（image GC 的常见诱因，只警告不阻断） ─────────────────────
if [ -d "$K3S_DATA_DIR" ] && command -v df >/dev/null 2>&1; then
  used="$(df -Pk "$K3S_DATA_DIR" 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
  if [ -n "$used" ] && [ "$used" -ge "$DISK_WARN_PERCENT" ]; then
    warn "$K3S_DATA_DIR 所在分区已用 ${used}%（≥${DISK_WARN_PERCENT}% 会触发 kubelet image GC，pause 镜像被回收后 docker.io 不通就再也拉不回来）"
  elif [ -n "$used" ]; then
    ok "磁盘余量正常：$K3S_DATA_DIR 已用 ${used}%"
  fi
fi

# ─── 汇总 ────────────────────────────────────────────────────────────────
echo
if [ "$failures" -gt 0 ]; then
  printf '✗ 自检未通过：%d 项阻断，%d 项警告。\n' "$failures" "$warnings"
  cat <<EOF
修复顺序：
  1. sudo cp $REGISTRIES_FILE $REGISTRIES_FILE.bak        # 改前必备份
  2. 按 README「第 6 步」的完整模板重写该文件（mirrors: 和 configs: 两段都要有；
     用覆盖写法时务必把原有 configs: 一起抄进去，否则火山 CR 凭据会被抹掉）
  3. sudo systemctl restart k3s
     kubectl wait --for=condition=Ready node/\$(hostname) --timeout=180s
  4. 重跑 bash deploy/aliyun-docs/deploy-impress.sh
EOF
  exit 1
fi

printf '✓ 自检通过（%d 项警告）。\n' "$warnings"
if [ "$warnings" -gt 0 ]; then
  echo "  警告项不阻断部署，但建议尽快处理。"
fi
