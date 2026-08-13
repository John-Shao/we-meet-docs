"""Server-to-server native table document creation contracts."""

import json
from unittest import mock

from django.test import override_settings

import pytest
from rest_framework.test import APIClient

from core import factories
from core.models import Document
from core.services import mime_types
from core.services.converter_services import Converter

pytestmark = pytest.mark.django_db


def payload(user):
    return {
        "title": "Calendar export",
        "intro": "Static snapshot",
        "columns": ["Subject", "Start"],
        "rows": [["Review", "2026-08-13 10:00"]],
        "sub": str(user.sub),
        "email": user.email,
    }


def test_create_table_for_owner_requires_s2s_token():
    user = factories.UserFactory()

    response = APIClient().post(
        "/api/v1.0/documents/create-table-for-owner/", payload(user), format="json"
    )

    assert response.status_code == 401
    assert not Document.objects.exists()


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_create_table_for_owner_rejects_ragged_rows():
    user = factories.UserFactory()
    data = payload(user)
    data["rows"] = [["missing second cell"]]

    response = APIClient().post(
        "/api/v1.0/documents/create-table-for-owner/",
        data,
        format="json",
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )

    assert response.status_code == 400
    assert "rows" in response.json()
    assert not Document.objects.exists()


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_create_table_for_owner_builds_native_table_and_owner_access():
    user = factories.UserFactory()
    with (
        mock.patch.object(Converter, "convert", return_value="table-yjs") as convert,
        mock.patch("core.api.serializers.posthog_capture"),
    ):
        response = APIClient().post(
            "/api/v1.0/documents/create-table-for-owner/",
            payload(user),
            format="json",
            HTTP_AUTHORIZATION="Bearer DummyToken",
        )

    assert response.status_code == 201
    document = Document.objects.get()
    assert response.json() == {"id": str(document.id)}
    assert document.creator == user
    assert document.accesses.filter(user=user, role="owner").exists()
    assert document.content == "table-yjs"

    raw, source_type, target_type = convert.call_args.args
    blocks = json.loads(raw.decode("utf-8"))
    assert source_type == mime_types.BLOCKNOTE
    assert target_type == mime_types.YJS
    assert blocks[0] == {"type": "paragraph", "content": "Static snapshot"}
    assert blocks[1]["type"] == "table"
    assert blocks[1]["content"]["headerRows"] == 1
    assert blocks[1]["content"]["rows"] == [
        {"cells": ["Subject", "Start"]},
        {"cells": ["Review", "2026-08-13 10:00"]},
    ]
