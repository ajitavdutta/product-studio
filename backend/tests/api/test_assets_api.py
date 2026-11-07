from httpx import AsyncClient

from app.core.limits import MAX_LOGO_BYTES

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'
MISSING_ID = "00000000-0000-4000-8000-000000000000"


def upload(data: bytes, content_type: str, file_name: str = "logo") -> dict[str, object]:
    return {"files": {"file": (file_name, data, content_type)}}


async def test_NF_3_logo_png_upload_and_fetch_headers(client: AsyncClient) -> None:
    asset = (await client.post("/api/assets", **upload(PNG_BYTES, "image/png"))).json()

    fetched = await client.get(f"/api/assets/{asset['id']}")

    assert (
        fetched.content,
        fetched.headers["content-type"],
        fetched.headers["x-content-type-options"],
        fetched.headers["content-security-policy"],
    ) == (PNG_BYTES, "image/png", "nosniff", "default-src 'none'; style-src 'unsafe-inline'")


async def test_NF_3_logo_upload_returns_201_asset(client: AsyncClient) -> None:
    response = await client.post("/api/assets", **upload(PNG_BYTES, "image/png"))

    body = response.json()
    assert (response.status_code, body["kind"], body["mime"], body["size"]) == (
        201,
        "logo",
        "image/png",
        len(PNG_BYTES),
    )


async def test_NF_3_logo_over_2mb_413(client: AsyncClient) -> None:
    oversized = PNG_BYTES + b"\x00" * MAX_LOGO_BYTES

    response = await client.post("/api/assets", **upload(oversized, "image/png"))

    assert (response.status_code, response.json()["detail"]) == (
        413,
        "Logos must be 2 MB or smaller",
    )


async def test_NF_3_logo_type_sniffed_not_trusted(client: AsyncClient) -> None:
    png_as_svg = await client.post("/api/assets", **upload(PNG_BYTES, "image/svg+xml"))
    text_as_png = await client.post("/api/assets", **upload(b"hello there", "image/png"))

    assert (
        png_as_svg.json()["mime"],
        text_as_png.status_code,
        text_as_png.json()["detail"],
    ) == ("image/png", 415, "Logos must be PNG, SVG, JPEG or WebP")


async def test_NF_3_logo_jpeg_webp_and_svg_types(client: AsyncClient) -> None:
    mimes = [
        (await client.post("/api/assets", **upload(data, "application/octet-stream"))).json()[
            "mime"
        ]
        for data in (JPEG_BYTES, WEBP_BYTES, SVG_BYTES)
    ]

    assert mimes == ["image/jpeg", "image/webp", "image/svg+xml"]


async def test_NF_3_svg_logo_is_sanitised_when_stored(client: AsyncClient) -> None:
    hostile = SVG_BYTES.replace(b"<rect", b'<script>alert(1)</script><rect onclick="x()"')
    asset = (await client.post("/api/assets", **upload(hostile, "image/svg+xml"))).json()

    stored = (await client.get(f"/api/assets/{asset['id']}")).content

    assert (b"script" in stored, b"onclick" in stored) == (False, False)


async def test_NF_3_svg_with_entities_415(client: AsyncClient) -> None:
    hostile = b'<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'

    response = await client.post("/api/assets", **upload(hostile, "image/svg+xml"))

    assert (response.status_code, response.json()["detail"]) == (
        415,
        "This SVG uses features we can't accept",
    )


async def test_logo_dedupes_on_sha256(client: AsyncClient) -> None:
    first = (await client.post("/api/assets", **upload(PNG_BYTES, "image/png"))).json()

    second = (await client.post("/api/assets", **upload(PNG_BYTES, "image/png"))).json()

    assert second == first


async def test_asset_404(client: AsyncClient) -> None:
    response = await client.get(f"/api/assets/{MISSING_ID}")

    assert response.status_code == 404
