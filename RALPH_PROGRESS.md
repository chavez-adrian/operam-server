# RALPH PROGRESS

## Estado
Iteraciones completadas: 1 / 5

## Completadas

### Iteracion 1 — `editarBranch` en server-helpers.js
- `server-helpers.js` creado con `toTitleCase` y `editarBranch`
- `editarBranch`: GET cliente -> branch_code, PUT branch con campos de texto en Title Case
- TEXT_FIELDS (que se convierten): br_name, addr_street, addr_interior, addr_colony, addr_city, addr_state
- Campos sin transformar: email, phone, addr_zip, addr_exterior, addr_int
- `server.js` actualizado para importar desde server-helpers.js (elimina duplicado toTitleCase)
- `tests/server.test.js` con 2 tests usando node:test + global.fetch mock
- `package.json` script test: `node --test tests/*.test.js`
- Commit: 853cc3b

## Siguiente
Iteracion 2 — Integrar editarBranch en el flujo POST /api/crear-cliente
