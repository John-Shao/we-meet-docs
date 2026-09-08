# deploy/aliyun-docs — Docs 独立机部署套件（P3 协作文档）

把本仓库（`John-Shao/we-meet-docs`，`upstream=suitenumerique/docs` 的定制 fork）部署到
独立机 `aliyun-docs`（单节点 k3s + 本仓库 `src/helm/impress` chart），为 we-meet 提供
「会议纪要自动落成协作文档（妙记）」+ 文档入口。**本套件自包含,不依赖 we-meet 仓库。**

## 与 we-meet 的关系（谁在哪）

| 归属 | 内容 |
|---|---|
| **本仓库（Docs）** | Docs 源码 + 定制（`docs-dev` 分支已简体中文化）+ **本目录部署套件** |
| **we-meet 仓库** | 设计/路线图 `docs/phases/p3-collab-docs.md`；背景 runbook `docs/installation/docs-server.md`；Keycloak realm 建置 `deploy/aliyun/keycloak/bootstrap-realm.sh`；meet 后端接线 `src/helm/env.d/aliyun-prod/values.meet.yaml`（`DOCS_API_URL`）+ `values.secrets.yaml`（`DOCS_SERVER_TO_SERVER_TOKEN`） |

> 定制在 `docs-dev` 分支:① 简体中文优先（`translations.json` zh + `zh_CN.po` 全 `tw2sp` 繁→简 + 术语点校）;② **视觉对齐 we-meet 主应用**（`cunningham.ts` 重写:飞书蓝 + 中性灰 + 与主应用逐字一致的系统字体栈,深浅共用同一支色阶）。
>
> ⚠️ 改完 `cunningham.ts` 必须跑 `yarn build-theme` 重新生成 `src/cunningham/cunningham-tokens.{ts,css}` 并一并提交 —— 那两个产物是入库的,只改源文件不生成等于没改。

## 本目录文件

| 文件 | 作用 |
|---|---|
| `build-and-push.sh` | 从 `docs-dev` 构建三镜像（backend/frontend/y-provider）推火山 CR。前端 `API_ORIGIN` build 期烘焙、镜像自带简体中文。默认从脚本所在仓库根构建 |
| `docs.values.yaml` | helm values：自有火山 CR 镜像 + OIDC(realm `meet`, client `docs`) + 阿里云 OSS 深圳(S3 兼容) + server token + 简体中文语言 + ingress。密钥为 `${VAR}` 占位，由 `secrets.env` 经 `deploy-impress.sh` 注入 |
| `secrets.env.example` | 密钥模板（入库）。`cp secrets.env.example secrets.env` 填真实值；`secrets.env` 已 gitignore、绝不入库 |
| `deploy-impress.sh` | 快进拉取代码 → 读 `secrets.env` → `envsubst` 渲染 values → Helm 部署并等待任务和滚动更新（密钥明文不落盘、不入库） |
| `datastores.yaml` | Docs 专属 PG(`postgres:16-alpine`)+Redis(`redis:7-alpine`) manifest 模板，单节点 hostPath(`/data/docs/*`)。Service 名锁定 `docs.values.yaml` 的库地址；密码为 `${...}` 占位 |
| `deploy-datastores.sh` | 读 `secrets.env` → `envsubst` 注入 DB/Redis 密码 → `kubectl apply -n docs` 建库。**须先于 `deploy-impress.sh` 跑** |
| `bootstrap-docs-client.sh` | 在 Keycloak realm `meet` 加 `docs` confidential client（独立版,凭据走 env） |

## 部署顺序

1. **前置**：阿里云 OSS 深圳桶 `we-meet-docs`；`openssl rand -hex 32` 生成共享 `DOCS_S2S_TOKEN`；DNS `docs.<域名>` → 本机公网 IP。
2. **Keycloak**（realm `meet` 须已由 we-meet 的 `bootstrap-realm.sh` 建好）：
   ```bash
   KC_URL=https://id.<域名> KC_ADMIN_USER=admin KC_ADMIN_PASSWORD=<pass> \
     DOCS_HOST=docs.<域名> bash deploy/aliyun-docs/bootstrap-docs-client.sh
   ```
   记下打印的 `OIDC_RP_CLIENT_SECRET`。
3. **建镜像**（在 `docs-dev` 分支）：
   ```bash
   git checkout docs-dev
   REGISTRY_USER=<火山CR用户> REGISTRY_PASS=<火山CR密码> \
     API_ORIGIN=https://docs.<域名> bash deploy/aliyun-docs/build-and-push.sh
   ```
4. **装 k3s + cert-manager + ingress**（参照 we-meet 仓库 `deploy/aliyun/install-k3s.sh` 同款装法）。
5. **自建 PG + Redis**（本机 k3s，Docs 专属，与 meet 隔离）：先填密钥，再建库（**必须先于 helm 部署**）：
   ```bash
   cp deploy/aliyun-docs/secrets.env.example deploy/aliyun-docs/secrets.env
   # 编辑 secrets.env 填真实密钥（client secret / DOCS_S2S_TOKEN / OSS AK-SK / DB·Redis 密码 / 各随机 secret）
   # DOCS_REDIS_PASSWORD 进 redis:// URL，须纯 hex（openssl rand -hex 32）
   bash deploy/aliyun-docs/deploy-datastores.sh   # kubectl apply PG+Redis，数据落本机 /data/docs/*
   ```
6. **给 k3s 配私有火山 CR 拉取凭据**（impress 三镜像在私有 CR，缺凭据 impress 各 Pod 会 `ImagePullBackOff`；PG/Redis 走 docker.io 公共镜像不受影响）。单节点 k3s 用节点级凭据最省事——不改 `values`、不用 imagePullSecret：
   ```bash
   sudo tee /etc/rancher/k3s/registries.yaml >/dev/null <<'YAML'
   configs:
     "jusi-cn-guangzhou.cr.volces.com":
       auth:
         username: <火山CR用户名>   # 同 build-and-push.sh 的 REGISTRY_USER
         password: <火山CR密码>     # 同 REGISTRY_PASS
   YAML
   sudo systemctl restart k3s        # 重启使凭据生效
   ```
   > ⚠️ `registries.yaml` 含明文凭据、且是节点本地文件，**不入库**（换机器需重配）。若报 `ImagePullBackOff`，`kubectl -n docs describe pod <pod>` 看是 401（认证错）还是 manifest not found（tag 拼错）。
7. **helm 部署 impress**：`deploy-impress.sh` 经 `envsubst` 注入 `secrets.env` 后部署：
   ```bash
   bash deploy/aliyun-docs/deploy-impress.sh   # 自动拉取当前分支；部署拉取后 SHA 对应的已推送镜像并等待完成
   # 迁移由 chart 的 impress-docs-backend-migrate Job 自动执行（Chart.yaml name=docs → 前缀 impress-docs）
   # 如需手动补跑： kubectl -n docs exec deploy/impress-docs-backend -- python manage.py migrate
   ```
   > 非密钥项（域名 / 桶名 等）仍直接改 `docs.values.yaml`；**镜像 tag 默认取 commit sha**（或 `TAG` 覆盖，不写死在 values）；密钥只在 `secrets.env`。
8. **接通 meet**（在 we-meet 那台）：`values.meet.yaml` 已含 `DOCS_API_URL`；把 `values.secrets.yaml`
   的 `DOCS_SERVER_TO_SERVER_TOKEN` 填成与本套件 `DOCS_S2S_TOKEN` 同一个值，`helm upgrade meet`。

## 日常更新

先在构建机拉取目标代码并运行 `build-and-push.sh`，推送同一 tag 的三个镜像。
然后在 Docs 服务器执行（可从任意目录通过脚本路径调用）：

```bash
bash deploy/aliyun-docs/deploy-impress.sh
# 指定已构建的镜像版本，避免部署时分支已出现更新提交：
bash deploy/aliyun-docs/deploy-impress.sh --tag b5a4c2b3
# 指定代码分支和等待时限：
bash deploy/aliyun-docs/deploy-impress.sh --branch feat/docs-native --timeout 15m
# 验证本地配置，不拉代码、不修改集群，也不输出含密钥的渲染清单：
bash deploy/aliyun-docs/deploy-impress.sh --skip-git-pull --dry-run
```

- 默认以 `git pull --ff-only origin <当前分支>` 更新代码，并重新进入更新后的脚本。
  `--branch` / `BRANCH` 可指定分支；有未提交的已跟踪文件改动时停止，避免部署混合代码。
  `--skip-git-pull` 使用本地检出，不切分支、不拉取。
- 镜像 tag 优先级：`--tag` → `TAG` → `DOCS_IMAGE_TAG` → 拉取后 HEAD 短 SHA。
  兼容原有 `TAG=xxx bash ...` 用法；禁止 `latest`。部署脚本不构建镜像。
- Helm 使用 `--wait --wait-for-jobs` 等待就绪和迁移任务完成，再逐个等待本次 release
  的 Deployment 完成滚动更新，最后打印就绪副本数和镜像。只有全部通过才显示“更新完成”。
- 阿里云开启 `backend.migrate.useReleaseRevision`，迁移任务命名为
  `impress-docs-backend-migrate-<Helm revision>`。即使上一次发布留下了镜像拉取失败的
  迁移 Job，下一次发布也会创建新任务，不会尝试修改旧 Job 的不可变 Pod 模板。
- 默认等待时限为 `10m`，可用 `--timeout` / `TIMEOUT` 调整（Helm 和每次 rollout 分别计时）。
  失败或超时返回非零退出码，并打印 Pod 状态和最近事件，方便定位镜像拉取、Pod 创建等问题。
- 原有额外 Helm 参数（如 `--set`、`-f`）仍可传入；命名空间、镜像 tag 和等待参数由脚本统一设置。
  切换集群应设置 `KUBECONFIG` 和当前 context，让 Helm 与 kubectl 使用同一个集群。

### 从旧版固定名称迁移任务恢复

若旧版部署遗留 `impress-docs-backend-migrate`，且它因未构建的镜像卡在
`ImagePullBackOff`，可删除该失败任务后重试已存在的镜像版本：

```bash
kubectl -n docs delete job impress-docs-backend-migrate --ignore-not-found --wait=true
bash deploy/aliyun-docs/deploy-impress.sh --tag b5a4c2b3
```

此处仅适用于已确认未启动迁移进程的失败 Job；正在运行数据库迁移时应先等待其完成。
代码 SHA 不代表镜像已构建，指定的三个镜像 tag 必须已经推送到镜像仓库。

## Django 管理员账号

阿里云配置关闭 `backend.createsuperuser.enabled`，避免每次部署都执行未配置
`DJANGO_SUPERUSER_EMAIL` / `DJANGO_SUPERUSER_PASSWORD` 的管理员创建任务。
这不影响数据库迁移或现有账号。需要创建或更新 Docs `/admin/` 管理员时执行：

```bash
bash deploy/aliyun-docs/create-superuser.sh
```

脚本交互读取邮箱和密码；此账号独立于普通用户的 Keycloak SSO 账号。

## 前端编译缓存

`build-and-push.sh` 默认通过 BuildKit 持久化 `.next/cache`。首次构建预热缓存，后续源码修改仍执行完整 `yarn build`，但可复用兼容的编译中间结果。缓存保存在当前 builder，不会随镜像推送到仓库，也不会进入最终 Nginx 镜像；镜像仍只复制本次静态导出的 `out`。

- 缓存按 Node 版本、平台、依赖清单/锁文件、Next/TypeScript 配置、`.env*` 文件及 `NEXT_PUBLIC_*` 构建环境自动分区。普通 CSS/组件修改不更换分区。
- 缓存挂载使用 `sharing=locked`；同一缓存修订号的并行前端构建会排队，避免同时写入。
- 构建日志中的 `[next-cache] new/existing namespace` 表示分区是否已有数据，不保证每个模块都命中缓存。实际提速取决于改动范围和 Next.js 的缓存失效规则；格式检查、静态导出和镜像推送仍会耗时。

正常构建命令不变。需要排查缓存问题时指定一个未使用过的修订号：

```bash
NEXT_CACHE_REVISION=reset-20260907-1 bash deploy/aliyun-docs/build-and-push.sh
```

之后继续使用相同修订号即可复用这份新缓存。该参数只影响前端编译阶段，不清空其它项目缓存；仅传 Docker 的 `--no-cache` 不会清空 cache mount。直接运行 `docker buildx build` 时对应参数为 `--build-arg NEXT_CACHE_REVISION=reset-20260907-1`。

缓存会占用构建机磁盘，受 BuildKit 垃圾回收管理；可用 `docker buildx du` 查看占用。更换 builder 或缓存被回收后会重新预热，不影响构建正确性。不持久化整个 `.next` 或 `out`，避免携带旧构建产物。

## 部署时须核对（占位 + ⚠️）

- 全部密钥填 `secrets.env`（对应 `docs.values.yaml` 的 `${VAR}` 占位）：`DOCS_CLIENT_SECRET`、`DOCS_S2S_TOKEN`、`OSS_AK`/`OSS_SK`、`DOCS_DB_PASSWORD`/`DOCS_REDIS_PASSWORD`、`DJANGO_SECRET_KEY`、`Y_PROVIDER_API_KEY`、`COLLAB_SERVER_SECRET`、SMTP。
- 域名：默认 `we-meet.online`；换 `jusiai.com` 全局替换。
- 镜像 tag：默认=**当前 commit 短 sha**（build/deploy 同 commit 自动一致，不用带 `TAG`）；`deploy-impress.sh` 注入 values 的 3 处 `${DOCS_IMAGE_TAG}`。显式 `TAG=xxx` 可覆盖，别用 latest。
- 私有火山 CR：k3s 节点须配 `/etc/rancher/k3s/registries.yaml` 凭据（部署第 6 步），否则 impress 各 Pod `ImagePullBackOff`。
- ⚠️ **OSS media ingress**：`ingressMedia`/`serviceMedia` 的 vhost/path-style + TLS SNI 需实测（见 `docs.values.yaml` 注释）；`AWS_S3_REGION_NAME` 用 `oss-cn-shenzhen`，403 SignatureDoesNotMatch 时试 `cn-shenzhen`。
- `DJANGO_SERVER_TO_SERVER_API_TOKENS`（docs 侧）== `DOCS_SERVER_TO_SERVER_TOKEN`（meet 侧），逐字符一致。
