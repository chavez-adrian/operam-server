# RALPH PROGRESS — Issue #4

## Estado
Iteraciones completadas: 5 / 5

## Completadas

### Iteracion 1 — getConfigPorPais (commit af0ff35)
- Funcion pura `getConfigPorPais(country)` en server-helpers.js
- Retorna `{ curr_code, area, esExtranjero, branchConfig }` para MX/US/CA/otros
- Exportada en `module.exports`
- 4 tests nuevos pasan

### Iteracion 2 — editarBranch + postCrearClienteHandler (commit fcdd823)
- `editarBranch` acepta 5to param opcional `branchConfig`; lo mezcla en el PUT body
- `postCrearClienteHandler` deriva `branchConfig` via `getConfigPorPais(cliente.country)`
- 4 tests nuevos pasan

### Iteracion 3 — buildClienteBody (commit a6e7122)
- `buildClienteBody(cliente, defaults)` extraida de `crearClienteEnOperam`
- Soporta `curr_code`, `area_pais`, `invoice_tax_id` del payload
- `crearClienteEnOperam` en server.js ahora usa `buildClienteBody`
- 4 tests nuevos pasan

### Iteracion 4 — csf-upload.html selector de pais (commit 215a5e2)
- Agregado `<select id="f_pais">` con opciones MX/US/CA/Otro
- Agregado `<input id="f_tax_id_ext">` oculto por defecto
- Event listener: RFC -> XEXX010101000 (readonly), oculta card fiscal, muestra f_tax_id_ext
- `leerForm()` incluye `country`, `curr_code`, `area_pais`, `invoice_tax_id`
- 4 tests nuevos pasan

### Iteracion 5 — cotizador buildPaisConfig (commit 347a9ff en cotizador)
- `buildPaisConfig(pais)` exportada en app.js y helpers.cjs
- `crearClienteDesdeCSF()` incluye `country`, `curr_code`, `area_pais`, `invoice_tax_id`
- Event listener para `cl-pais` (RFC readonly, muestra/oculta cl-tax-id-ext-wrap)
- 4 tests nuevos pasan en pais-config.test.cjs

## Totales
- operam: 21 tests pasan (5 originales + 16 nuevos)
- cotizador/__tests__: 12 tests pasan (8 originales + 4 nuevos)
