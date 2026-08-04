"""we-meet 内嵌云文档的会话引导:一次性票据换 Docs 会话。

原有链路是 ``/api/v1.0/authenticate/`` —— 拿浏览器里的 Keycloak 会话 cookie 静默
换一个 Docs 会话。但 meet 双端的登录态是 **Bearer token**(手机号 OTP 直连授权拿
的),浏览器 / WebView 里未必存在 KC 会话 cookie:一旦没有,authenticate 就把内嵌页
甩到 Keycloak 登录页,而 KC 自带 ``Content-Security-Policy: frame-ancestors 'self'``
会把 iframe 直接挡死(web 侧白屏报 CSP;App 侧变成「云文档要求再登一次」)。

这里补一条与 KC 浏览器会话**无关**的引导链路,让云文档的登录态跟随 meet 自己的
登录态:

1. meet 后端(已校验调用者身份)用 s2s token 换一张一次性票据 ——
   ``POST /api/v1.0/users/session-ticket/``;
2. 客户端把 iframe / WebView 指向 ``/api/v1.0/session-from-ticket/?ticket=…``,
   Docs 校验并**立即销毁**票据、建立 Docs 会话,再 302 到目标页。

票据只在服务端之间产生,60 秒有效、用一次即废,cache 里存的是 sha256 —— URL 里
那份即便落进 nginx / Caddy 的访问日志,被翻出来时也早已失效。

注:第 2 步能把 ``docs_sessionid`` 落进浏览器,前提是 meet 与 docs 同注册域
(``meet.we-meet.online`` / ``docs.we-meet.online``),iframe 里的导航才算 same-site、
``SameSite=Lax`` 的会话 cookie 才会被接受。跨注册域部署要另配 ``SameSite=None``
(现有 authenticate 链路同样受此约束)。
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from typing import Any
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import login as auth_login
from django.core.cache import cache
from django.http import HttpResponseRedirect
from django.utils.http import url_has_allowed_host_and_scheme
from django.views import View

from core import models

logger = logging.getLogger(__name__)

#: 票据有效期。够走完「meet 后端签发 → 客户端拿到 → iframe 发起导航」,
#: 短到没有被从日志里翻出来重放的窗口。
TICKET_TTL_SECONDS = 60

CACHE_KEY_PREFIX = "docs-session-ticket:"

#: 认证后端全名。``auth_login`` 要求会话里记一个 backend;记 OIDC 那个 —— 引导出来
#: 的会话与用户自己走 OIDC 登录出来的完全同源(登出、``get_user`` 都走同一条路)。
AUTH_BACKEND = "core.authentication.backends.OIDCAuthenticationBackend"


def _cache_key(ticket: str) -> str:
    """票据的 cache key:存 sha256 而非票据本身。"""
    digest = hashlib.sha256(ticket.encode("utf-8")).hexdigest()
    return f"{CACHE_KEY_PREFIX}{digest}"


def mint_ticket(payload: dict[str, Any]) -> str:
    """签发一张一次性票据,返回票据明文(只此一次可见)。"""
    ticket = secrets.token_urlsafe(32)
    cache.set(_cache_key(ticket), payload, TICKET_TTL_SECONDS)
    return ticket


def consume_ticket(ticket: str) -> dict[str, Any] | None:
    """校验并销毁票据,返回签发时存的 payload;无效 / 已用过返回 ``None``。

    先读后删,并且**以删除成功为准**:并发重放时只有真正删掉那一次的调用者拿到
    payload,另一边看到删除失败 → 当作无效票据。
    """
    if not ticket:
        return None
    key = _cache_key(ticket)
    payload = cache.get(key)
    if payload is None:
        return None
    if not cache.delete(key):
        # 同一张票据被并发使用,另一路已经消费掉了。
        return None
    return payload if isinstance(payload, dict) else None


def _safe_next(request, raw: str | None) -> str:
    """把 ``next`` 收敛到本站内部路径,防开放重定向。"""
    candidate = (raw or "").strip() or "/"
    if url_has_allowed_host_and_scheme(
        candidate,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return candidate
    logger.warning("session-from-ticket: rejected next=%r", raw)
    return "/"


def _resolve_user(payload: dict[str, Any]) -> models.User | None:
    """按 sub / email 找到用户;从未登录过 Docs 的按票据里的身份补建。

    补建走 ``User.objects.create``,与 OIDC 首次登录建号是同一条路 ——
    ``User.save()`` 在新建时会把待生效的 Invitation 转成 DocumentAccess
    (别人分享给他的文档因此立刻可见)。

    已存在的用户只认不改:昵称 / 邮箱以 Docs 自己的资料为准,免得 meet 侧一个
    临时展示名(常常就是手机号)把用户在 Docs 里的名字盖掉。
    """
    sub = str(payload.get("sub") or "").strip()
    email = str(payload.get("email") or "").strip()
    if not sub:
        return None

    try:
        user = models.User.objects.get_user_by_sub_or_email(sub, email)
    except models.DuplicateEmailError:
        logger.warning("session-from-ticket: duplicate email for sub=%s", sub)
        return None
    if user is not None:
        return user

    language = str(payload.get("language") or "").strip().lower()
    if language not in dict(settings.LANGUAGES):
        language = None

    return models.User.objects.create(
        sub=sub,
        email=email or None,
        password="!",  # noqa: S106 - OIDC-only account, never used for login
        full_name=str(payload.get("full_name") or "") or None,
        short_name=str(payload.get("short_name") or "") or None,
        language=language,
    )


class SessionFromTicketView(View):
    """``GET /api/v1.0/session-from-ticket/?ticket=…&next=/`` —— 票据换会话。

    不需要任何认证:票据本身就是凭证(服务端签发、60 秒、用一次即废)。校验通过
    就建立 Docs 会话并 302 到 ``next``;票据无效 / 过期则退回原来的 OIDC
    ``authenticate`` 链路 —— 有 KC 会话的浏览器照样能静默进站,没有的会看到
    Keycloak 登录页(iframe 里会被 CSP 挡住,由 meet 前端的兜底遮罩接手)。
    """

    def get(self, request, *args, **kwargs):
        """校验票据 → 建会话 → 跳目标页。"""
        next_url = _safe_next(request, request.GET.get("next"))
        fallback = (
            f"/api/{settings.API_VERSION}/authenticate/?{urlencode({'next': next_url})}"
        )
        payload = consume_ticket(str(request.GET.get("ticket") or ""))
        if payload is None:
            logger.info("session-from-ticket: invalid or expired ticket")
            return HttpResponseRedirect(fallback)

        user = _resolve_user(payload)
        if user is None:
            return HttpResponseRedirect(fallback)

        auth_login(request, user, backend=AUTH_BACKEND)
        return HttpResponseRedirect(next_url)
