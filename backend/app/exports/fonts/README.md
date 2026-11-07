# Bundled export fonts

Static TrueType fonts used by the export renderer (CairoSVG for PDF/PNG). Every
export SVG uses `font-family="Roboto"`; the files cover weights 400, 500 and 700
(`font.weights` in `shared/design-tokens.json`).

`google/fonts` (`ofl/roboto`, `ofl/robotomono`) now ships only variable fonts, so
the static instances come from the upstream release repositories, as the M0 plan
allows (ASSUMPTION in `docs/plans/M0-bootstrap.md`, task 4).

| File | Source | Version |
|---|---|---|
| `Roboto-Regular.ttf`, `Roboto-Medium.ttf`, `Roboto-Bold.ttf` | https://github.com/googlefonts/roboto-3-classic/releases/download/v3.016/Roboto_v3.016.zip (`hinted/static/`) | v3.016 |
| `RobotoMono-Regular.ttf`, `RobotoMono-Medium.ttf` | https://github.com/googlefonts/RobotoMono/tree/v3.001/fonts/ttf | v3.001 |
| `OFL.txt` | https://github.com/googlefonts/roboto-3-classic/blob/v3.016/OFL.txt | v3.016 |
| `OFL-RobotoMono.txt` | https://github.com/googlefonts/RobotoMono/blob/v3.001/OFL.txt | v3.001 |

Both families are licensed under the SIL Open Font License 1.1. The two licence
files are kept verbatim because their copyright lines differ.

Fontconfig registration happens in M5 (`app/exports/`); in M0 only the Docker
image installs these fonts system-wide.
