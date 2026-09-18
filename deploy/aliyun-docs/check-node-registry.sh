#!/usr/bin/env bash
# check-node-registry.sh — aliyun-docs 节点镜像源自检（只读，不修改任何配置）。
#
# 为什么需要：K3s 自带 containerd 只读 /etc/rancher/k3s/registries.yaml，**不读**
# /etc/docker/daemon.json（那是 docker daemon 的 mirror）；而且**宿主 docker 的镜像库与
# containerd 的 k8s.io 镜像库完全独立**——`docker pull` 成功不代表 k3s 拉得到。pod sandbox
# 基础镜像（默认 rancher/mirrored-pause:3.6）只要被 kubelet image GC 回收（磁盘吃紧、
# k3s 升级换了 tag），就依赖节点能重新拉到它；docker.io 在 CN 不可达又没有 mirror 时，
# 所有新 Pod 都会卡 FailedCreatePodSandBox，helm --wait 只报 "context deadline exceeded"，
# 看起来像部署脚本坏了。本脚本把这几项一次查清，并给出能直接粘贴的修复命令。
#
# 用法：
#   sudo bash deploy/aliyun-docs/check-node-registry.sh
#   sudo ALIYUN_DOCKER_MIRROR=https://<ID>.mirror.aliyuncs.com bash deploy/aliyun-docs/check-node-registry.sh
#   sudo PAUSE_IMAGE=jusi-cn-guangzhou.cr.volces.com/we-meet/pause:3.6 bash .../check-node-registry.sh
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
# 配置里没有可用 mirror 时试探的候选（第三方源可用性会变，只当线索；可用 MIRROR_CANDIDATES 覆盖）
MIRROR_CANDIDATES="${MIRROR_CANDIDATES:-https://docker.xuanyuan.me https://docker.m.daocloud.io https://docker.1ms.run https://hub.rat.dev}"

failures=0
warnings=0
ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '⚠ %s\n' "$*"; warnings=$((warnings + 1)); }
bad()  { printf '✗ %s\n' "$*"; failures=$((failures + 1)); }
note() { printf '· %s\n' "$*"; }

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

# ─── 2. docker.io mirror 可达性 ──────────────────────────────────────────
endpoints=""
if [ -n "$mirrors_block" ]; then
  endpoints="$(printf '%s\n' "$mirrors_block" \
    | grep -oE "https?://[^\"'[:space:]]+" | sort -u || true)"
fi
[ -n "$endpoints" ] || endpoints="${ALIYUN_DOCKER_MIRROR:-${DOCKER_MIRROR:-}}"

reachable=""
if ! command -v curl >/dev/null 2>&1; then
  warn "缺 curl，跳过 mirror 探活：sudo apt install -y curl"
elif [ -z "$endpoints" ]; then
  warn "registries.yaml 里没有可探测的 mirror endpoint，ALIYUN_DOCKER_MIRROR 也未设置"
else
  for endpoint in $endpoints; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$PROBE_TIMEOUT" \
      "${endpoint%/}/v2/" 2>/dev/null || true)"
    case "$code" in
      200|401) ok "mirror 可达：$endpoint（HTTP $code）"; reachable="$endpoint" ;;
      *) bad "mirror 不可达：$endpoint（HTTP ${code:-超时/拒绝}）" ;;
    esac
  done
  [ -n "$reachable" ] || bad "registries.yaml 里的 docker.io mirror 全军覆没，先换一个可用的再部署"
fi

# 没有可用 mirror 时试探候选，给出一个能直接用的地址
if [ -z "$reachable" ] && command -v curl >/dev/null 2>&1; then
  note "试探候选镜像站（只探测，不改任何配置）："
  for candidate in $MIRROR_CANDIDATES; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$PROBE_TIMEOUT" \
      "${candidate%/}/v2/" 2>/dev/null || true)"
    case "$code" in
      200|401) reachable="$candidate"; note "可用候选：$candidate（HTTP $code）"; break ;;
      *) note "不可用：$candidate（HTTP ${code:-超时/拒绝}）" ;;
    esac
  done
  [ -n "$reachable" ] \
    || note "候选都不通。阿里云 ECS 最稳的是控制台「容器镜像服务 → 镜像工具 → 镜像加速器」的专属地址"
fi

# ─── 3. sandbox 基础镜像是否还在 k3s 的镜像库里 ───────────────────────────
pause_image="${PAUSE_IMAGE:-}"
if [ -z "$pause_image" ] && [ -f "$CONTAINERD_CONFIG" ]; then
  # k3s 生成的 containerd 配置里 sandbox_image 才是真实值（含 --pause-image 覆盖）
  pause_image="$(sed -n 's/^[[:space:]]*sandbox_image[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$CONTAINERD_CONFIG" | head -n 1)"
fi
pause_image="${pause_image:-$DEFAULT_PAUSE_IMAGE}"
pause_ref="$pause_image"
pause_is_hub=1
case "$pause_ref" in
  */*/*) pause_is_hub=0 ;;                  # 已是 host/ns/repo 完整引用
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
      ok "sandbox 基础镜像已在 containerd：$pause_ref"
    else
      bad "containerd 里缺 sandbox 基础镜像 $pause_ref —— 新 Pod 会一直 FailedCreatePodSandBox"

      pause_local="$(printf '%s\n' "$images" | grep -i 'pause' | grep -v '@sha256' || true)"
      if [ -n "$pause_local" ]; then
        note "containerd 里现有的 pause 镜像："
        printf '%s\n' "$pause_local" | sed 's/^/       /'
      else
        note "containerd 里一个 pause 镜像都没有。"
      fi

      # ① 同类 tag 换名：pause 只是个几十 KB 的 init 进程，tag 之间可互换
      swap="$(printf '%s\n' "$pause_local" | grep -F 'mirrored-pause' | head -n 1 || true)"
      [ -n "$swap" ] || swap="$(printf '%s\n' "$pause_local" | head -n 1 || true)"
      if [ -n "$swap" ] && [ "$swap" != "$pause_ref" ]; then
        printf '    ① 本地换名（不用出网、不用重启）：\n'
        printf '       sudo k3s ctr -n k8s.io images tag %s %s\n' "$swap" "$pause_ref"
      fi

      # ② 宿主 docker 是另一个镜像库：k3s 用不到它，但可以本机直传
      if command -v docker >/dev/null 2>&1; then
        docker_pause="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
          | grep -i 'pause' || true)"
        if [ -n "$docker_pause" ]; then
          printf '    ② 宿主 docker 库里有（k3s 用不到它，但能本机直传，不用出网、不用 scp）：\n'
          printf '%s\n' "$docker_pause" | sed 's/^/       /'
          docker_hit="$(printf '%s\n' "$docker_pause" | grep -F 'mirrored-pause' | head -n 1 || true)"
          [ -n "$docker_hit" ] || docker_hit="$(printf '%s\n' "$docker_pause" | head -n 1 || true)"
          printf '       docker save %s | sudo k3s ctr -n k8s.io images import -\n' "$docker_hit"
          printf '       sudo k3s ctr -n k8s.io images ls | grep -i pause   # 没带 docker.io/ 前缀就再 tag 一次\n'
        fi
      fi

      # ③ 用探到的可达 mirror 拉下来再改名
      if [ "$pause_is_hub" = 1 ] && [ -n "$reachable" ]; then
        printf '    ③ 用上面探到的可用 mirror：\n'
        printf '       sudo k3s ctr -n k8s.io images pull %s/%s\n' "${reachable%/}" "$pause_image"
        printf '       sudo k3s ctr -n k8s.io images tag  %s/%s %s\n' "${reachable%/}" "$pause_image" "$pause_ref"
      fi

      printf '    ④ 固化到私有 CR（火山 CR 在本节点可达，pod sandbox 从此不依赖 docker.io）：见 README「排障」\n'
    fi
  fi
fi

# ─── 4. 磁盘余量（image GC 的常见诱因，只警告不阻断） ─────────────────────
if [ -d "$K3S_DATA_DIR" ] && command -v df >/dev/null 2>&1; then
  used="$(df -Pk "$K3S_DATA_DIR" 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $5}' || true)"
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
  4. 重跑 bash deploy/aliyun-docs/deploy-impress.sh --tag <已构建的 tag>
EOF
  exit 1
fi

printf '✓ 自检通过（%d 项警告）。\n' "$warnings"
if [ "$warnings" -gt 0 ]; then
  echo "  警告项不阻断部署，但建议尽快处理。"
fi
