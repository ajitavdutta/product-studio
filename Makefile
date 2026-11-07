.PHONY: install dev test e2e lint gen

install:
	uv sync --directory backend
	pnpm -C frontend install
	pnpm -C frontend exec playwright install chromium

# One shell line so the trap kills both servers when either exits or on Ctrl+C.
dev:
	uv run --directory backend alembic upgrade head
	trap 'kill 0' EXIT; uv run --directory backend uvicorn app.main:app --reload --port 8000 & pnpm -C frontend dev & wait

test:
	uv run --directory backend pytest -q
	pnpm -C frontend test

# Needs `make dev` running in another terminal.
e2e:
	pnpm -C frontend e2e

lint:
	uv run --directory backend ruff check .
	uv run --directory backend ruff format --check .
	uv run --directory backend mypy --strict app
	pnpm -C frontend lint
	pnpm -C frontend typecheck

gen:
	pnpm -C frontend gen:api
