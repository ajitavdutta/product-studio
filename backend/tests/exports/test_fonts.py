"""The export renderer relies on fonts bundled in the repo, not on system fonts."""

from pathlib import Path

import pytest

FONTS_DIR = Path(__file__).resolve().parents[2] / "app" / "exports" / "fonts"
BUNDLED_FONTS = [
    "Roboto-Regular.ttf",
    "Roboto-Medium.ttf",
    "Roboto-Bold.ttf",
    "RobotoMono-Regular.ttf",
    "RobotoMono-Medium.ttf",
]
TRUETYPE_SIGNATURES = (b"\x00\x01\x00\x00", b"true")


@pytest.mark.parametrize("font_name", BUNDLED_FONTS)
def test_bundled_fonts_present_and_truetype(font_name: str) -> None:
    font_path = FONTS_DIR / font_name

    signature = font_path.read_bytes()[:4]

    assert signature in TRUETYPE_SIGNATURES, f"{font_name} is not a TrueType font: {signature!r}"


@pytest.mark.parametrize("licence_name", ["OFL.txt", "OFL-RobotoMono.txt"])
def test_font_licence_present(licence_name: str) -> None:
    licence_text = (FONTS_DIR / licence_name).read_text(encoding="utf-8")

    assert "SIL Open Font License" in licence_text
