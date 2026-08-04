"""
Tests for Documents API endpoint in impress's core app: search-for-user
(we-meet 全局搜索代理,server-to-server)。
"""

# pylint: disable=W0621

from django.test import override_settings

import pytest
from rest_framework.test import APIClient

from core import factories
from core.models import LinkReachChoices, LinkTrace

pytestmark = pytest.mark.django_db

URL = "/api/v1.0/documents/search-for-user/"


def test_api_documents_search_for_user_missing_token():
    """No token → 401,与 create-for-owner 同口径。"""
    response = APIClient().get(URL, {"sub": "123", "q": "预算"})
    assert response.status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_search_for_user_invalid_token():
    response = APIClient().get(
        URL, {"sub": "123", "q": "预算"}, HTTP_AUTHORIZATION="Bearer BadToken"
    )
    assert response.status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_search_for_user_param_validation():
    client = APIClient()
    auth = {"HTTP_AUTHORIZATION": "Bearer DummyToken"}
    assert client.get(URL, {"q": "预算"}, **auth).status_code == 400
    assert client.get(URL, {"sub": "123", "q": "短"}, **auth).status_code == 400


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_search_for_user_unknown_sub_returns_empty():
    """从未登录过 Docs 的 sub → 空结果而非报错。"""
    response = APIClient().get(
        URL,
        {"sub": "never-seen", "q": "预算"},
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )
    assert response.status_code == 200
    assert response.json() == {"results": [], "has_more": False}


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_search_for_user_visibility_boundary():
    """只回该用户可见的文档:自有访问 ∪ 非受限 LinkTrace;他人文档不泄漏。"""
    owner = factories.UserFactory()
    outsider = factories.UserFactory()

    mine = factories.DocumentFactory(title="季度预算方案", users=[owner])
    factories.DocumentFactory(title="预算黑箱(他人的)", users=[outsider])
    traced_open = factories.DocumentFactory(
        title="公开预算备忘", link_reach=LinkReachChoices.PUBLIC
    )
    LinkTrace.objects.create(document=traced_open, user=owner)
    traced_restricted = factories.DocumentFactory(
        title="受限预算文档", link_reach=LinkReachChoices.RESTRICTED
    )
    LinkTrace.objects.create(document=traced_restricted, user=owner)

    response = APIClient().get(
        URL,
        {"sub": owner.sub, "q": "预算"},
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )
    assert response.status_code == 200
    titles = {r["title"] for r in response.json()["results"]}
    assert titles == {"季度预算方案", "公开预算备忘"}
    ids = {r["id"] for r in response.json()["results"]}
    assert str(mine.id) in ids


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_search_for_user_title_match_case_insensitive():
    owner = factories.UserFactory()
    factories.DocumentFactory(title="OKR Planning", users=[owner])
    response = APIClient().get(
        URL,
        {"sub": owner.sub, "q": "okr"},
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )
    assert [r["title"] for r in response.json()["results"]] == ["OKR Planning"]


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_search_for_user_pagination():
    """limit/offset + has_more。

    we-meet 把云文档收进了它的全局搜索面板,并隐掉了 docs 自带的搜索弹窗(那个是
    无限滚动的)。这里若还钉死在默认 8 条,收敛就成了**能力退化** —— 所以分页是
    那次收敛的配套,不是可选项。
    """
    owner = factories.UserFactory()
    for i in range(12):
        factories.DocumentFactory(title=f"预算-{i:02d}", users=[owner])
    auth = {"HTTP_AUTHORIZATION": "Bearer DummyToken"}
    client = APIClient()

    # 不传参 = 改动前的行为:8 条,且还有更多。
    body = client.get(URL, {"sub": owner.sub, "q": "预算"}, **auth).json()
    assert len(body["results"]) == 8
    assert body["has_more"] is True

    # 翻到底:最后一页 has_more 为假。
    body = client.get(
        URL, {"sub": owner.sub, "q": "预算", "limit": 10, "offset": 10}, **auth
    ).json()
    assert len(body["results"]) == 2
    assert body["has_more"] is False

    # offset 不重复也不跳:两页拼起来正好是全集。
    first = client.get(
        URL, {"sub": owner.sub, "q": "预算", "limit": 6, "offset": 0}, **auth
    ).json()["results"]
    second = client.get(
        URL, {"sub": owner.sub, "q": "预算", "limit": 6, "offset": 6}, **auth
    ).json()["results"]
    assert len({r["id"] for r in first + second}) == 12

    # 垃圾参数不该 400,夹到合法区间继续 —— 调用方是 we-meet 后端,
    # 让整条搜索因为一个分页参数挂掉不划算。
    body = client.get(
        URL, {"sub": owner.sub, "q": "预算", "limit": "abc", "offset": "-5"}, **auth
    ).json()
    assert len(body["results"]) == 8

    # 上界防手搓的 limit=100000 拖垮查询。
    body = client.get(
        URL, {"sub": owner.sub, "q": "预算", "limit": 999999}, **auth
    ).json()
    assert len(body["results"]) == 12
