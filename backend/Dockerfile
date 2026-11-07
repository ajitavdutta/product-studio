FROM python:3.12-slim

# Cairo for CairoSVG; fontconfig so Cairo finds the bundled Roboto fonts by family name.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcairo2 fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY app/exports/fonts/*.ttf /usr/share/fonts/truetype/product-studio/
RUN fc-cache -f

COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /usr/local/bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Dependencies first so code edits don't invalidate this layer.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev

COPY . .

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
