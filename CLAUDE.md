# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # run server locally (port 3000)
npm test           # run all tests (node:test built-in runner)

# Run a single test file
node --test tests/server.test.js
node --test tests/frontend.test.js
```

## Architecture

```
server.js           # Express API: endpoints, Operam auth, Dropbox upload, DB logging
server-helpers.js   # Pure functions only (no direct env vars, no side effects) — exported for tests
csf-upload.html     # Standalone frontend tool (~1000 lines vanilla JS, served via GitHub Pages)
tests/
  server.test.js    # Backend unit tests (mock global.fetch)
  frontend.test.js  # Structural tests of csf-upload.html DOM/JS
config-ids.json     # Operam IDs reference: tax_group IDs, areas, GL accounts, branch PUT fields
```

**Key design rule:** `server-helpers.js` contains all pure functions (`buildClienteBody`, `editarBranch`, `buscarClientePorRFC`, `calcularDiff`, `actualizarClienteEnOperam`, etc.). These accept explicit arguments (token, baseUrl) instead of reading `process.env` directly, making them testable without starting a server. `server.js` wires everything together with env vars.

## Operam API v3

- Auth: `POST /api/v3/login` with `{ company, user, pass }` → `{ token }`
- Company ID is `346` (numeric), not the subdomain. Stored in `OPERAM_COMPANY`.
- Crear cliente: `POST /api/v3/sales/customers`
- Ver cliente (incluye branches/contacts): `GET /api/v3/sales/customers/{id}`
- Editar branch: `PUT /api/v3/sales/branches/{branch_code}` — branch_code must be fetched first via GET customer
- Actualizar cliente: `PUT /api/v3/sales/customers/{id}`
- `config-ids.json` contains the canonical reference for supported PUT branch fields, area IDs, tax group IDs, and GL account codes.

## Testing pattern

Tests use `node:test` + `node:assert/strict` (no external libraries). To mock HTTP calls, assign `global.fetch` before calling the function under test. Tests import directly from `server-helpers.js`.

## External integrations

- **Neon Postgres** — log table `clientes_log` auto-created on startup if `DATABASE_URL` is set. Missing `DATABASE_URL` is gracefully handled (log calls become no-ops).
- **Dropbox** — PDF backup via OAuth token refresh (`DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`). Token cached in memory with expiry.
- **Production:** https://operam-server.onrender.com — `OPERAM_USER` is `c.code`.

## csf-upload.html flow

1. User uploads a CSF PDF (or SAT QR URL via `/api/csf-from-url` proxy)
2. `pdf-parse` extracts text server-side; frontend parses regimen fiscal, RFC, domicilio
3. Duplicate guard: if RFC exists in Operam, pre-fills form with existing client data
4. Create path: POST `/api/crear-cliente` → creates customer + edits branch with delivery address
5. Update path: `calcularDiff(snapshot, formValues)` computes changed fields → confirmation panel → PUT `/api/actualizar-cliente/:id`

## RALPH_PLAN files

`RALPH_PLAN_N.md` and `RALPH_PROGRESS_N.md` are implementation plans and progress logs for each numbered GitHub issue. Consult the latest numbered plan file before implementing a new feature to understand iteration structure and Definition of Done.
