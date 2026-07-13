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
| `docs.values.yaml` | helm values：自有火山 CR 镜像 + OIDC(realm `meet`, client `docs`) + 火山 TOS + server token + 简体中文语言 + ingress。所有 `__占位__` 部署前替换 |
| `bootstrap-docs-client.sh` | 在 Keycloak realm `meet` 加 `docs` confidential client（独立版,凭据走 env） |

## 部署顺序

1. **前置**：火山 TOS 桶 `we-meet-docs`；`openssl rand -hex 32` 生成共享 `DOCS_S2S_TOKEN`；DNS `docs.<域名>` → 本机公网 IP。
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
5. **helm 部署**：填好 `docs.values.yaml` 全部占位，
   ```bash
   helm install impress ./src/helm/impress -n docs --create-namespace \
     -f deploy/aliyun-docs/docs.values.yaml
   kubectl -n docs exec deploy/impress-backend -- python manage.py migrate
   ```
6. **接通 meet**（在 we-meet 那台）：`values.meet.yaml` 已含 `DOCS_API_URL`；把 `values.secrets.yaml`
   的 `DOCS_SERVER_TO_SERVER_TOKEN` 填成与本套件 `DOCS_S2S_TOKEN` 同一个值，`helm upgrade meet`。

## 部署时须核对（占位 + ⚠️）

- 全部 `__占位__`：client secret、`DOCS_S2S_TOKEN`、TOS AK/SK、DB/Redis 密码、`DJANGO_SECRET_KEY`、`Y_PROVIDER_API_KEY`、`COLLABORATION_SERVER_SECRET`、SMTP。
- 域名：默认 `we-meet.online`；换 `jusiai.com` 全局替换。
- 镜像 `image.tag` 与 `build-and-push.sh` 的 `TAG` 对齐。
- ⚠️ **TOS media ingress**：`ingressMedia`/`serviceMedia` 的 vhost/path-style + TLS SNI 需实测（见 `docs.values.yaml` 注释）。
- `DJANGO_SERVER_TO_SERVER_API_TOKENS`（docs 侧）== `DOCS_SERVER_TO_SERVER_TOKEN`（meet 侧），逐字符一致。
