import pytest
from defusedxml import ElementTree as SafeElementTree

from app.services.errors import UnsupportedMediaTypeError
from app.services.svg_sanitizer import sanitize_svg

SVG_OPEN = b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
SVG_CLOSE = b"</svg>"


def svg(body: bytes) -> bytes:
    return SVG_OPEN + body + SVG_CLOSE


def test_NF_3_strips_script() -> None:
    cleaned = sanitize_svg(svg(b'<g><script type="text/javascript">alert(1)</script></g>'))

    assert b"script" not in cleaned


def test_NF_3_strips_script_in_another_namespace() -> None:
    cleaned = sanitize_svg(
        svg(b'<h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script>')
    )

    assert b"alert" not in cleaned


def test_NF_3_strips_foreign_object() -> None:
    cleaned = sanitize_svg(
        svg(b'<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>')
    )

    assert b"foreignObject" not in cleaned


def test_NF_3_strips_event_handlers() -> None:
    cleaned = sanitize_svg(svg(b'<rect width="4" onload="x()" onClick="y()"/>'))

    assert (b"onload" in cleaned, b"onClick" in cleaned, b'width="4"' in cleaned) == (
        False,
        False,
        True,
    )


def test_NF_3_strips_javascript_href() -> None:
    cleaned = sanitize_svg(
        svg(b'<a href="javascript:alert(1)"><use xlink:href=" JavaScript:alert(2)"/></a>')
    )

    assert b"alert" not in cleaned


def test_NF_3_strips_external_image_href() -> None:
    cleaned = sanitize_svg(svg(b'<image href="https://tracker.example/pixel.png"/>'))

    assert b"tracker" not in cleaned


def test_NF_3_rejects_entities() -> None:
    hostile = b'<!DOCTYPE svg [<!ENTITY boom "boom">]>' + svg(b"<text>&boom;</text>")

    with pytest.raises(UnsupportedMediaTypeError, match="features we can't accept"):
        sanitize_svg(hostile)


def test_NF_3_rejects_external_entities() -> None:
    hostile = b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg(b"<text>&x;</text>")

    with pytest.raises(UnsupportedMediaTypeError, match="features we can't accept"):
        sanitize_svg(hostile)


def test_NF_3_rejects_non_svg_xml() -> None:
    with pytest.raises(UnsupportedMediaTypeError, match="Logos must be PNG, SVG, JPEG or WebP"):
        sanitize_svg(b"<html><body/></html>")


def test_NF_3_rejects_non_xml() -> None:
    with pytest.raises(UnsupportedMediaTypeError, match="Logos must be PNG, SVG, JPEG or WebP"):
        sanitize_svg(b"\x00\x01 not xml")


def test_keeps_paths_and_internal_use_refs() -> None:
    cleaned = sanitize_svg(
        svg(
            b'<defs><path id="p" d="M0 0L4 4"/></defs><use xlink:href="#p"/>'
            b'<image href="data:image/png;base64,iVBORw0KGgo="/>'
        )
    )

    root = SafeElementTree.fromstring(cleaned)
    assert (
        root.tag,
        cleaned.startswith(b"<svg"),
        b'd="M0 0L4 4"' in cleaned,
        b'xlink:href="#p"' in cleaned,
        b'href="data:image/png;base64,' in cleaned,
    ) == ("{http://www.w3.org/2000/svg}svg", True, True, True, True)


def test_NF_3_strips_animated_javascript_href() -> None:
    cleaned = sanitize_svg(
        svg(
            b'<a><animate attributeName="href" values="javascript:alert(1)"/>'
            b'<set attributeName="xlink:href" to="javascript:alert(2)"/>'
            b'<animateMotion dur="1s" path="M0 0L4 4"/><text>Logo</text></a>'
        )
    )

    assert (b"javascript" in cleaned, b"animate" in cleaned, b"<text>Logo</text>" in cleaned) == (
        False,
        False,
        True,
    )


def test_NF_3_strips_external_css_urls() -> None:
    cleaned = sanitize_svg(
        svg(
            b"<style>@import url(http://evil.example/a.css);"
            b" rect { fill:url(http://evil.example/b) }</style>"
            b'<rect width="4" style="fill:url(http://evil.example/c)"/>'
            b'<circle r="2" fill="url( \'https://evil.example/d\' )"/>'
            b'<path d="M0 0" style="fill:url(#grad)"/><path d="M1 1" fill="url( \'#grad\')"/>'
        )
    )

    assert (
        b"evil" in cleaned,
        b"<style" in cleaned,
        b'width="4"' in cleaned,
        b'style="fill:url(#grad)"' in cleaned,
        b"fill=\"url( '#grad')\"" in cleaned,
    ) == (False, False, True, True, True)


def test_NF_3_strips_css_escaped_style_attribute() -> None:
    cleaned = sanitize_svg(svg(b'<rect width="4" style="fill:\\75 rl(http://evil.example/e)"/>'))

    assert b"evil" not in cleaned
