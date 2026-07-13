# deploy/aliyun-docs — Docs 独立机部署套件（P3 协作文档）

把本仓库（`John-Shao/we-meet-docs`，`upstream=suitenumerique/docs` 的定制 fork）部署到
独立机 `aliyun-docs`（单节点 k3s + 本仓库 `src/helm/impress` chart），为 we-meet 提供
「会议纪要自动落成协作文档（妙记）」+ 文档入口。**本套件自包含,不依赖 we-meet 仓库。**

## 与 we-meet 的关系（谁在哪）

| 归属 | 内容 |
|---|---|
| **本仓库（Docs）** | Docs 源码 + 定制（`docs-dev` 分支已简体中文化）+ **本目录部署套件** |
| **we-meet 仓库** | 设计/路线图 `docs/phases/p3-collab-docs.md`；背景 runbook `docs/installation/docs-server.md`；Keycloak realm 建置 `deploy/aliyun/keycloak/bootstrap-realm.sh`；meet 后端接线 `src/helm/env.d/aliyun-prod/values.meet.yaml`（`DOCS_API_URL`）+ `values.secrets.yaml`（`DOCS_SERVER_TO_SERVER_TOKEN`） |

> 定制在 `docs-dev` 分支:简体中文优先（`translations.json` zh + `zh_CN.po` 全 `tw2sp` 繁→简 + 术语点校）。品牌本轮**暂不改**。

## 本目录文件

| 文件 | 作用 |
|---|---|
| `build-and-push.sh` | 从 `docs-dev` 构建三镜像（backend/frontend/y-provider）推火山 CR。前端 `API_ORIGIN` build 期烘焙、镜像自带简体中文。默认从脚本所在仓库根构建 |
| `docs.values.yaml` | helm values：自有火山 CR 镜像 + OIDC(realm `meet`, client `docs`) + 阿里云 OSS 深圳(S3 兼容) + server token + 简体中文语言 + ingress。密钥为 `${VAR}` 占位，由 `secrets.env` 经 `deploy-impress.sh` 注入 |
| `secrets.env.example` | 密钥模板（入库）。`cp secrets.env.example secrets.env` 填真实值；`secrets.env` 已 gitignore、绝不入库 |
| `deploy-impress.sh` | 读 `secrets.env` → `envsubst` 渲染 `docs.values.yaml` 的 `${VAR}` → `helm upgrade --install`（明文不落盘、不入库） |
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
6. **helm 部署 impress**：`deploy-impress.sh` 经 `envsubst` 注入 `secrets.env` 后部署：
   ```bash
   bash deploy/aliyun-docs/deploy-impress.sh   # = helm upgrade --install，密钥明文不落盘
   kubectl -n docs exec deploy/impress-backend -- python manage.py migrate
   ```
   > 非密钥项（域名 / 桶名 / 镜像 tag 等）仍直接改 `docs.values.yaml`；密钥只在 `secrets.env`。
7. **接通 meet**（在 we-meet 那台）：`values.meet.yaml` 已含 `DOCS_API_URL`；把 `values.secrets.yaml`
   的 `DOCS_SERVER_TO_SERVER_TOKEN` 填成与本套件 `DOCS_S2S_TOKEN` 同一个值，`helm upgrade meet`。

## 部署时须核对（占位 + ⚠️）

- 全部密钥填 `secrets.env`（对应 `docs.values.yaml` 的 `${VAR}` 占位）：`DOCS_CLIENT_SECRET`、`DOCS_S2S_TOKEN`、`OSS_AK`/`OSS_SK`、`DOCS_DB_PASSWORD`/`DOCS_REDIS_PASSWORD`、`DJANGO_SECRET_KEY`、`Y_PROVIDER_API_KEY`、`COLLAB_SERVER_SECRET`、SMTP。
- 域名：默认 `we-meet.online`；换 `jusiai.com` 全局替换。
- 镜像 `image.tag` 与 `build-and-push.sh` 的 `TAG` 对齐。
- ⚠️ **OSS media ingress**：`ingressMedia`/`serviceMedia` 的 vhost/path-style + TLS SNI 需实测（见 `docs.values.yaml` 注释）；`AWS_S3_REGION_NAME` 用 `oss-cn-shenzhen`，403 SignatureDoesNotMatch 时试 `cn-shenzhen`。
- `DJANGO_SERVER_TO_SERVER_API_TOKENS`（docs 侧）== `DOCS_SERVER_TO_SERVER_TOKEN`（meet 侧），逐字符一致。
