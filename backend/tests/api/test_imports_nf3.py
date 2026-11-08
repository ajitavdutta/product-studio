"""NF-3 for Jira uploads: the 20 MB cap, XML entities, and binary files rejected plainly."""

import json
import struct
import zlib
from pathlib import Path
from typing import Any, Final

import pytest
from httpx import AsyncClient

from app.core.limits import MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE
from app.importers.jira.detect import NOT_JIRA_MESSAGE, UNDECODABLE_MESSAGE

PLAIN_BINARY_MESSAGES: Final = {NOT_JIRA_MESSAGE, UNDECODABLE_MESSAGE}
MINIMAL_REST_EXPORT: Final = json.dumps(
    {"issues": [{"key": "PAY-1", "fields": {"summary": "Wallet", "issuetype": {"name": "Epic"}}}]}
).encode()


def upload(file_name: str, content: bytes, content_type: str = "text/csv") -> dict[str, Any]:
    return {"file": (file_name, content, content_type)}


def tiny_png() -> bytes:
    """A valid 4×1 RGB PNG, built here so no binary fixture is checked in."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    header = struct.pack(">IIBBBBB", 4, 1, 8, 2, 0, 0, 0)
    pixels = zlib.compress(b"\x00" + b"\xff\x00\x00" * 4)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")
    )


async def test_NF_3_upload_over_20mb_413(client: AsyncClient) -> None:
    # A real export padded one byte past the cap, so only the size can be the reason.
    oversized = MINIMAL_REST_EXPORT.ljust(MAX_UPLOAD_BYTES + 1)

    response = await client.post(
        "/api/imports/jira", files=upload("export.json", oversized, "application/json")
    )

    assert (response.status_code, response.json()["detail"]) == (413, MAX_UPLOAD_MESSAGE)


async def test_NF_3_upload_of_exactly_20mb_accepted(client: AsyncClient) -> None:
    at_cap = MINIMAL_REST_EXPORT.ljust(MAX_UPLOAD_BYTES)

    response = await client.post(
        "/api/imports/jira", files=upload("export.json", at_cap, "application/json")
    )

    assert (response.status_code, response.json()["size"]) == (201, MAX_UPLOAD_BYTES)


async def test_NF_3_xml_external_entity_rejected(client: AsyncClient, tmp_path: Path) -> None:
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP-SECRET-TOKEN", encoding="utf-8")
    xml = (
        f'<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY leak SYSTEM "{secret.as_uri()}">]>'
        "<rss><channel><item><key>PAY-1</key><summary>&leak;</summary></item></channel></rss>"
    ).encode()

    response = await client.post(
        "/api/imports/jira", files=upload("export.xml", xml, "application/xml")
    )

    assert (response.status_code, "TOP-SECRET-TOKEN" in response.text) == (422, False)


async def test_NF_3_xml_entity_expansion_rejected(client: AsyncClient) -> None:
    entities = "".join(f'<!ENTITY e{level} "{f"&e{level - 1};" * 10}">' for level in range(1, 10))
    xml = (
        f'<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY e0 "lol">{entities}]>'
        "<rss><channel><item><key>PAY-1</key><summary>&e9;</summary></item></channel></rss>"
    ).encode()

    response = await client.post(
        "/api/imports/jira", files=upload("export.xml", xml, "application/xml")
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("file_name", "content"),
    [
        ("logo.png", tiny_png()),
        ("export.csv", tiny_png()),
        ("export.xlsx", b"PK\x03\x04\x14\x00\x06\x00\x08\x00" + bytes(range(256))),
        ("export.csv", b"\x1f\x8b\x08\x00" + bytes(range(256))),
    ],
    ids=["png", "png-renamed-csv", "xlsx", "gzip-renamed-csv"],
)
async def test_NF_3_binary_file_rejected_plainly(
    client: AsyncClient, file_name: str, content: bytes
) -> None:
    response = await client.post(
        "/api/imports/jira", files=upload(file_name, content, "application/octet-stream")
    )

    assert (response.status_code, response.json().get("detail") in PLAIN_BINARY_MESSAGES) == (
        422,
        True,
    )
