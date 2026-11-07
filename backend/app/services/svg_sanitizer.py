"""Make an uploaded SVG logo safe to store, serve and render (NF-3).

The brief asks for scripts and foreignObject to go. Event-handler attributes and
`javascript:` links are the same attack class, so they go too. Only same-document
references (`#id`) and embedded raster images survive as links.

CairoSVG renders these logos in exports and can fetch external URLs, so anything that
can smuggle a URL past the attribute check goes as well: animation elements (they can
rewrite `href` at runtime), `<style>` sheets (`@import`, `url(...)`), and any attribute
with a CSS `url(...)` that isn't `#id`. A logo is static and has no need for either.
"""

import re
import xml.etree.ElementTree as ElementTree

from defusedxml import DefusedXmlException
from defusedxml import ElementTree as SafeElementTree

from app.services.errors import UnsupportedMediaTypeError

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
SVG_ROOT_TAG = f"{{{SVG_NAMESPACE}}}svg"

NOT_A_LOGO_MESSAGE = "Logos must be PNG, SVG, JPEG or WebP"
FORBIDDEN_FEATURES_MESSAGE = "This SVG uses features we can't accept"

REMOVED_ELEMENTS = frozenset(
    {
        "script",
        "foreignobject",
        "style",
        "animate",
        "animatecolor",
        "animatemotion",
        "animatetransform",
        "set",
    }
)
SAFE_HREF = re.compile(r"^(#|data:image/(png|jpeg|webp)[;,])", re.IGNORECASE)
# `url(` whose target, after optional whitespace and quote, doesn't start with `#`.
EXTERNAL_CSS_URL = re.compile(r"url\(\s*+['\"]?+\s*+(?!#)", re.IGNORECASE)
# CSS escapes (`\75 rl(`) could hide `url(` from the check above; fail closed.
CSS_ESCAPE = "\\"

# Serialise with these prefixes so the output reads `<svg xmlns=…>`, not `<ns0:svg>`.
ElementTree.register_namespace("", SVG_NAMESPACE)
ElementTree.register_namespace("xlink", XLINK_NAMESPACE)


def _local_name(qualified: str) -> str:
    return qualified.rsplit("}", 1)[-1].lower()


def _is_unsafe_attribute(name: str, value: str) -> bool:
    local = _local_name(name)
    if local.startswith("on"):
        return True
    if local == "href" and not SAFE_HREF.match(value.strip()):
        return True
    if local == "style" and CSS_ESCAPE in value:
        return True
    return EXTERNAL_CSS_URL.search(value) is not None


def _parse(data: bytes) -> ElementTree.Element:
    try:
        return SafeElementTree.fromstring(data, forbid_dtd=True)
    except DefusedXmlException as exc:
        raise UnsupportedMediaTypeError(FORBIDDEN_FEATURES_MESSAGE) from exc
    except ElementTree.ParseError as exc:
        raise UnsupportedMediaTypeError(NOT_A_LOGO_MESSAGE) from exc


def sanitize_svg(data: bytes) -> bytes:
    """The SVG without scripts, foreignObject, styles, animation, event handlers or unsafe links.

    Raises `UnsupportedMediaTypeError` when `data` isn't an SVG document, or when it uses a
    DTD, entities or external references.
    """
    root = _parse(data)
    if root.tag != SVG_ROOT_TAG:
        raise UnsupportedMediaTypeError(NOT_A_LOGO_MESSAGE)
    for parent in list(root.iter()):
        for child in list(parent):
            if _local_name(child.tag) in REMOVED_ELEMENTS:
                parent.remove(child)
    for element in root.iter():
        for name in [n for n, value in element.attrib.items() if _is_unsafe_attribute(n, value)]:
            del element.attrib[name]
    sanitized: bytes = ElementTree.tostring(root, encoding="utf-8", xml_declaration=False)
    return sanitized
