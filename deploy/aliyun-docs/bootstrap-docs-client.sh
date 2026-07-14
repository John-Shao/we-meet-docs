#!/usr/bin/env bash
# bootstrap-docs-client.sh - 在已存在的 meet realm 里追加一个 `docs` OIDC client。
#
# 用于 P3 协作文档：Docs（本仓库,部署在独立机 docs.<域名>）与 we-meet 复用同一个
# Keycloak realm `meet` 做 SSO —— 用户登录 meet 后新标签打开 docs 免登。
#
# 独立版：Keycloak admin 凭据从环境变量取（也可在当前目录放 .env），不依赖 we-meet 仓库。
# 前置：realm `meet` + meet client 须先由 we-meet 仓库
#   deploy/aliyun/keycloak/bootstrap-realm.sh 建好；本脚本只加 docs client，不动 realm。
# 第二次跑会被 Keycloak 拒掉 (client exists) —— 幂等需手工删/编辑。
#
# Run（在任意能访问 Keycloak 的机器）:
#   KC_URL=https://id.we-meet.online KC_ADMIN_USER=admin KC_ADMIN_PASSWORD=<pass> \
#     DOCS_HOST=docs.we-meet.online bash deploy/aliyun-docs/bootstrap-docs-client.sh
# 换域名（jusiai.com）：把 KC_URL / DOCS_HOST 换成对应值即可。

set -euo pipefail

# 凭据：当前目录有 .env 就 source（与 we-meet keycloak 目录约定兼容），否则用环境变量
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${KC_ADMIN_USER:?需设 KC_ADMIN_USER（或在当前目录放含该变量的 .env）}"
: "${KC_ADMIN_PASSWORD:?需设 KC_ADMIN_PASSWORD}"

KC_URL="${KC_URL:-https://id.we-meet.online}"
REALM="${REALM:-meet}"
DOCS_CLIENT_ID="${DOCS_CLIENT_ID:-docs}"
# Docs 独立机的公开域名（redirectUris / webOrigins 用它）。换域名从 env 传入。
DOCS_HOST="${DOCS_HOST:-docs.we-meet.online}"

# 让用户传入或交互式生成 docs client secret（去 docs.values.yaml 的 OIDC_RP_CLIENT_SECRET 用）
if [[ -z "${DOCS_CLIENT_SECRET:-}" ]]; then
  DOCS_CLIENT_SECRET="$(openssl rand -hex 24)"
  echo "Generated DOCS_CLIENT_SECRET=$DOCS_CLIENT_SECRET"
  echo "把这个值填到 deploy/aliyun-docs/docs.values.yaml 的 OIDC_RP_CLIENT_SECRET"
fi

echo "==> Login as admin to Keycloak"
# Use --data-urlencode（curl -d 不做 URL 编码，密码里的 '+' '/' '=' '&' 会被误解，'+' 尤其变空格）。
TOKEN=$(curl -sS --fail "$KC_URL/realms/master/protocol/openid-connect/token" \
  --data-urlencode "client_id=admin-cli" \
  --data-urlencode "username=$KC_ADMIN_USER" \
  --data-urlencode "password=$KC_ADMIN_PASSWORD" \
  --data-urlencode "grant_type=password" | jq -r .access_token)
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: failed to obtain admin token"; exit 1
fi
AUTH=( -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" )

# realm `meet` 应已由 bootstrap-realm.sh 建好；这里只做存在性提示，不重建。
echo "==> Checking realm '$REALM' exists"
if ! curl -sS --fail "${AUTH[@]}" "$KC_URL/admin/realms/$REALM" >/dev/null 2>&1; then
  echo "ERROR: realm '$REALM' 不存在。先跑 we-meet 仓库 deploy/aliyun/keycloak/bootstrap-realm.sh。"; exit 1
fi

echo "==> Creating OIDC client '$DOCS_CLIENT_ID' in realm '$REALM'"
# confidential + standardFlow（授权码流），照 meet client 对称设置。
curl -sS -X POST "$KC_URL/admin/realms/$REALM/clients" "${AUTH[@]}" -d '{
  "clientId": "'"$DOCS_CLIENT_ID"'",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": false,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "secret": "'"$DOCS_CLIENT_SECRET"'",
  "redirectUris": [
    "https://'"$DOCS_HOST"'/api/v1.0/callback/",
    "https://'"$DOCS_HOST"'/*"
  ],
  "webOrigins": [
    "https://'"$DOCS_HOST"'"
  ],
  "attributes": {
    "post.logout.redirect.uris": "https://'"$DOCS_HOST"'##https://'"$DOCS_HOST"'/*"
  }
}' || echo "(client may already exist)"

echo
echo "==> Done. Docs 复用同一 realm 的 SSO 会话："
echo "    $KC_URL/realms/$REALM/.well-known/openid-configuration"
echo
echo "把以下信息填到 deploy/aliyun-docs/docs.values.yaml:"
echo "    OIDC_RP_CLIENT_ID=$DOCS_CLIENT_ID"
echo "    OIDC_RP_CLIENT_SECRET=$DOCS_CLIENT_SECRET"
echo "    OIDC_REDIRECT_ALLOWED_HOSTS=https://$DOCS_HOST"
