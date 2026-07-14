# Plan：Docs 接入 we-meet 统一 SSO（Keycloak 手机验证码登录 + meet 静默桥接）

> 本文档是 Docs 接入 we-meet 产品统一身份（SSO）的实施方案，归属 `deploy/aliyun-docs` 部署套件。
> 涉及多仓库：本仓库（Docs）、`we-meet/we-meet`（meet 前后端 + 线上 Keycloak 部署）、`Meeting/keycloak-phone-auth`（KC 手机验证码认证器插件）。

## Context（为什么做这件事）

Docs（La Suite impress fork）已部署到 `aliyun-sjy` 的 k3s，站点 `https://docs.we-meet.online` 可访问、简体中文、走 OIDC 委托到 `id.we-meet.online` realm `meet`、client `docs`。但**登录走不通**：

- Docs 是标准 OIDC RP，把登录托管给 Keycloak，需要 **Keycloak 浏览器会话**。
- meet 现有的手机验证码登录是**后端 token-exchange 自定义流程**（前端存 localStorage 令牌），**从不在 Keycloak 建浏览器会话**——所以 Docs 跳到 Keycloak 只看到默认「用户名/密码」页，meet 用户（手机注册、无密码）登不进，也无法从 meet 免登。

**目标**：让 Docs 能用**手机验证码登录**并拿到 Keycloak 会话，进而实现 meet 与 Docs 的**真·SSO（一次登录、全产品免登）**，同时**不破坏** meet 现有登录体验（自建弹窗：手机验证码 + App 扫码）与原生 App 的 token-exchange。

**已确认的关键事实**（来自代码探查）：
- 线上 IdP 是 `we-meet/we-meet/deploy/aliyun/keycloak/compose.yaml` 里的**独立 Docker `quay.io/keycloak/keycloak:25.0`**（在 `aliyun-zlm`，Caddy 反代，`KC_FEATURES=token-exchange,admin-fine-grained-authz`，`KC_PROXY_HEADERS=xforwarded`，**无 providers/themes 卷 → 插件未装**）。
- 手机验证码浏览器认证器**已存在**：`Meeting/keycloak-phone-auth`（provider id `phone-authenticator`，显示名「Phone OTP Authentication」，自带 `phone` 登录主题，发码经 `/keycloak-sms/send/` 网关 → 火山短信）。仅用**稳定 SPI**，把 Dockerfile 基础镜像 `26.0.0→25.0` 即可跑在 KC 25，**代码不改**。
- Docs OIDC 以 `sub` 为键，**email 可空**（默认 `USER_OIDC_ESSENTIAL_CLAIMS=[]` 不强制），phone-only 用户可直接登录（测试用例已证实）。
- meet 前端（权威仓库 `we-meet/we-meet/src/frontend`）登录纯自定义、无 KC 会话，但**已有** `/authenticate/` OIDC 重定向端点（现仅用于 silent login）可复用。meet 后端是标准 OIDC RP（`lasuite.oidc_login`，client `meet`，回调 `/api/v1.0/callback/`），目前**只签 HS256**（`APPLICATION_JWT_*`），无 RS256/JWKS。

## 目标架构（三类客户端，共享一个 KC 会话）

| 客户端 | 登录方式 | 会话来源 |
|---|---|---|
| 原生 App | token-exchange（**不变**） | App 自持令牌 |
| meet 网页 | 保留自有弹窗（手机+扫码）+ **静默桥接**（阶段二） | 产出 KC 浏览器会话 |
| Docs / 未来 OIDC 应用 | Keycloak 浏览器手机登录（插件，阶段一） | 复用同一 KC 会话 |

---

## 阶段一：Docs 手机登录（解锁 Docs SSO，独立于 meet，可先行）

### A. 把 phone-auth 插件编译并部署到线上 KC 25（在 aliyun-zlm）

1. 改 `Meeting/keycloak-phone-auth/Dockerfile`：两处基础镜像 `keycloak:26.0.0` → `keycloak:25.0`（已参数化为 build-arg `KC_REPO`/`KC_VERSION`，默认仍 26；we-meet.online 用 `--build-arg KC_VERSION=25.0 --build-arg KC_REPO=quay.io/keycloak/keycloak` 构建）。Java **代码不动**（只用 `Authenticator`/`AuthenticationFlowContext`/`UserModel`/`jakarta.ws.rs`，25/26 一致）。
2. 在 aliyun-zlm 本机构建镜像（如本地 tag `we-meet/keycloak:25.0-phone`）。镜像内已 `kc.sh build`，jar 进 `/opt/keycloak/providers/`、主题进 `/opt/keycloak/themes/phone`。
3. **先备份 KC 库**：`docker exec keycloak-db pg_dump -U keycloak keycloak > kc-25-backup.sql`；**保留旧 `quay.io/keycloak/keycloak:25.0`** 以便秒回滚。
4. 改 `we-meet/we-meet/deploy/aliyun/keycloak/compose.yaml` 的 `keycloak.image` → 该 phone 镜像（其余 env/db/caddy 不动），`docker compose up -d keycloak`（≈1 分钟认证中断）。
5. 验证插件加载：管理台 → realm `meet` → Authentication → 任一 flow → Add step，列表出现 **"Phone OTP Authentication"**。

### B. 配置 `browser-phone` 流程并**只绑给 docs 客户端**（不影响 meet）

1. Authentication → Flows → Create flow `browser-phone`（Basic）→ Add step **Phone OTP Authentication**（Requirement=**Required**）→ 齿轮配置：
   - `sms_gateway_url` = `https://meet.we-meet.online/keycloak-sms/send/`（公网；须从 aliyun-zlm 能 `curl` 通）
   - `sms_gateway_token` = 与 meet-backend env **`KEYCLOAK_SMS_GATEWAY_TOKEN`** 同值
   - `otp_length=6` / `otp_expiry_seconds=300` / `otp_max_attempts=3`
2. Clients → **`docs`** → Advanced → **Authentication flow overrides → Browser Flow = `browser-phone`**。
3. Clients → **`docs`** → Settings → **Login theme = `phone`**（per-client，realm 默认主题不动）。
4. 主题：**用插件自带 `phone` 主题**（本轮不做品牌化，列为后续）。

### 阶段一前置确认（配置前逐条核对）
- meet-backend env 已设 `KEYCLOAK_SMS_GATEWAY_TOKEN` + `VOLC_SMS_AK/SK/ACCOUNT/SIGN/TEMPLATE_ID`（插件此前未上线，这些可能从未启用）。
- `/keycloak-sms/send/` 路由**对公网暴露**且 aliyun-zlm 可达。
- Docs 部署 `docs.values.yaml` 未把 `USER_OIDC_ESSENTIAL_CLAIMS` 设成含 `email`（默认 `[]`，当前安全，**无需改**，仅核对）。

### 阶段一验证（端到端）
1. 浏览器开 `https://docs.we-meet.online` → 点「开始写作」→ 跳 Keycloak → **手机号输入页（phone 主题）** → 收火山短信 → 验证码页 → 登入 Docs。
2. 确认建立了 KC 会话：登录后访问 `https://id.we-meet.online/realms/meet/account` 应**直接进**（不再要求登录）。
3. 确认 no-email 用户被正常创建（Docs Django admin / backend 日志，`email=NULL`、以 `sub` 为键）。

---

## 阶段二：meet 网页静默桥接（meet 加入 SSO；保留自有登录 UX）

**机制**：meet 网页**保留自建弹窗（手机+扫码）**；登录成功后，后端签发**短时、一次性**的登录断言，浏览器**静默**走一趟 Keycloak，一个新的「信任断言」认证器校验断言 → `setUser + success` → **建立 KC 浏览器会话**。meet 用户全程看不到 Keycloak 页面，扫码/验证码照旧在 meet UI。

### D1. Keycloak 侧：新增 `meet-assertion` 认证器（扩展现有插件仓库）
- 在 `Meeting/keycloak-phone-auth/src/com/jusiai/keycloak/` 新增 `MeetAssertionAuthenticator.java` + `MeetAssertionAuthenticatorFactory.java`（provider id 如 `meet-assertion`），并在 `META-INF/services/org.keycloak.authentication.AuthenticatorFactory` 追加该工厂类。
- 逻辑：从请求读断言（见 D2 的投递方式）→ 用**共享密钥 HS256 验签** + 校验 `exp`（≤60s）与 `jti`（单次）→ 取 `sub` → `ctx.getSession().users().getUserById(realm, sub)` → `ctx.setUser(user); ctx.success()`；无/无效断言则 `ctx.attempted()`（交给后续/回退）。配置项：`shared_secret`、`max_age_seconds`。
- 与 phone-auth 同镜像打包（阶段一已在 phone 镜像里，追加类即可重编）。

### D2. meet 后端：登录成功后签发断言（`we-meet/we-meet/src/backend`）
- 在手机验证/扫码确认成功处（`core/api/mobile_auth/otp.py` 的 `VerifyOtpView`、以及 `qr-login` confirm 视图）**追加**：生成 HS256 断言 JWT `{sub, jti, exp<=60s, iss}`，复用现有 HS256 签名范式（`meet/settings.py` 的 `APPLICATION_JWT_*` 为先例），**新增专用密钥** `KC_BRIDGE_SHARED_SECRET`（与 D1 认证器 `shared_secret` 同值）。
- 投递方式（二选一，推荐 Cookie）：**Set-Cookie** `kc_bridge=<jwt>`，`Domain=.we-meet.online`、`HttpOnly`、`Secure`、`SameSite=Lax`、极短 `Max-Age`——这样浏览器跳 `id.we-meet.online` 时该 cookie 会带上，D1 认证器读取。`jti` 单次（后端或 KC 侧缓存防重放）。

### D3. meet 前端：登录成功触发桥接（`we-meet/we-meet/src/frontend`）
- 在登录成功点（`features/auth/components/PhoneLoginPanel.tsx`、`QrLoginPanel.tsx` 的 `onSuccess`，或集中在 `api/mobileOtp.ts` 的 `verifyOtp` 之后）**触发桥接重定向**：**复用现有** `features/auth/utils/authUrl.ts` → `window.location.href = authUrl({ returnTo: window.location.href })`（即已有的 `/authenticate/` OIDC 往返）。
- Keycloak 侧给 **`meet` 客户端**加 Browser Flow override 到一条含 `meet-assertion` 的流程（如 `browser-meet-bridge` = `meet-assertion`（Alternative）→ 失败回退默认）。断言有效则**静默**完成 → 回调建立 meet Django 会话 **+ KC 浏览器会话**；`returnTo` 带回原页，localStorage 令牌不受影响。

### 阶段二验证
- meet 网页手机/扫码登录 → 访问 `id.we-meet.online/realms/meet/account` **直接进**（KC 会话已建）→ 打开 `docs.we-meet.online` **自动免登**。
- 反向：全新浏览器先登 Docs（手机）→ 打开 meet → 现有 `silentLogin`（`is_silent_login_enabled`）**免登**。

---

## 关键文件

- 插件：`Meeting/keycloak-phone-auth/Dockerfile`（KC 版本参数化）；阶段二新增 `src/com/jusiai/keycloak/MeetAssertionAuthenticator{,Factory}.java` + `META-INF/services/org.keycloak.authentication.AuthenticatorFactory`（追加一行）；`theme/phone/`（沿用）。
- 线上 KC 部署：`we-meet/we-meet/deploy/aliyun/keycloak/compose.yaml`（image tag），在 aliyun-zlm。
- Docs 部署：`we-meet/we-meet-docs/deploy/aliyun-docs/docs.values.yaml`（仅核对 `USER_OIDC_ESSENTIAL_CLAIMS`，无需改）。
- meet 前端：`we-meet/we-meet/src/frontend/src/features/auth/components/{PhoneLoginPanel,QrLoginPanel}.tsx`、`features/auth/utils/authUrl.ts`（复用）、`api/mobileOtp.ts`。
- meet 后端：`we-meet/we-meet/src/backend/core/api/mobile_auth/otp.py`、`core/api/keycloak_sms.py`（既有网关）、qr-login 视图、`meet/settings.py`（加 `KC_BRIDGE_SHARED_SECRET`）、`core/urls.py`。

## 复用的既有能力（避免新造）
- **`/keycloak-sms/send/` 网关 + `VOLC_SMS_*`**：插件发码直接用，无需新短信通道。
- **`/authenticate/` OIDC 重定向（`authUrl.ts` / `lasuite.oidc_login`）**：阶段二桥接直接复用，不新建跳转。
- **HS256 签名范式（`APPLICATION_JWT_*`）**：断言签发的现成先例。
- **插件自带 `phone` 主题**：阶段一直接选用。
- **`bootstrap-realm.sh` / `bootstrap-mobile.sh`**：realm/client（`docs`/`meet`/`meet-service`）与 `phoneNumber` 属性的既有配置背景。

## 风险与回滚
- **阶段一**：换 KC 镜像有 ≈1 分钟认证中断 → 先 `pg_dump` 备份、保留 `:25.0` tag（回滚=换回旧 tag）。加 provider 不动现有流程；`docs` 客户端 override 为外科式，**meet 完全不受影响**。短信网关不通 / token 不一致 → 手机页发码失败（先 `curl` 验通）。
- **阶段二**：改动 meet 前后端 + 新 KC 认证器，断言安全须到位（**短时 ≤60s、单次 jti、专用共享密钥、Cookie `HttpOnly/Secure/SameSite`、仅真登录后签发**）；建议先在 KC 副本/测试环境验。桥接仅对 `meet` 客户端生效，失败时 meet 仍可用（localStorage 令牌），只是无 SSO。
- **两阶段都不触碰 token-exchange**（meet 手机登录 / 原生 App 不受影响）。若阶段二后续要把 IdP 升到 KC 26，再单独排期并**重点复验 token-exchange**。

## 后续动作（本轮不做，记录备查）

1. **Keycloak 25 → 26 升级**（全集群版本统一，改用已测的 `:26.0.0-phone` 镜像，与 jusiai k8s 那套对齐）。前置/风险：升级前 `pg_dump` 备份（**DB 迁移单向、升上去回不来**）、保留 25 镜像可回滚；**重点复验 token-exchange**（meet 手机登录/原生 App 全靠它，KC 26 对 token exchange 有重构）与 **Caddy hostname**（KC 26 hostname 处理变化）。建议克隆一套 KC（同库副本）在测试环境先验；届时插件换成 26 build，`browser-phone` / `meet-assertion` 流程沿用。
2. **登录界面品牌化**：把 Docs 用的 KC `phone` 主题做成 we-meet 品牌页（logo/配色/排版，复刻 meet 登录弹窗观感）。可 FreeMarker+CSS 定制 `phone-input.ftl` / `phone-otp.ftl`，或用 Keycloakify（React 写 KC 主题）更贴近 SPA 观感。meet 用户经静默桥接不看 KC 页，此项主要面向 Docs / 直接来的浏览器用户。
3. **手机用户合成 email**（可选）：Docs 登录本身不需要，但「按邮箱分享/邀请」等下游功能对 null-email 用户无从下手。如需，可在 KC 给手机用户加 `email` 属性（映射到 `email` claim，如 `<手机号>@phone.we-meet.online`）。
4. **未来其它 OIDC 应用接入**：阶段一/二落地后，新的浏览器 OIDC 应用**天然复用同一 KC 会话 + 手机登录**，零额外认证代码——本方案的长期收益。

## 执行顺序
1. 阶段一 A → B → 验证（Docs 手机登录 + KC 会话）。**此后 Docs 即可用于产品集成。**
2. 阶段二 D1 → D2 → D3 → 验证（meet 静默桥接，双向 SSO）。
