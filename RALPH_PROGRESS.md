# RALPH PROGRESS

## Estado
Iteraciones completadas: 2 / 5

## Completadas

### Iteracion 1 — `editarBranch` en server-helpers.js
- `server-helpers.js` creado con `toTitleCase` y `editarBranch`
- TEXT_FIELDS (que se convierten): br_name, addr_street, addr_interior, addr_colony, addr_city, addr_state
- `server.js` importa desde server-helpers.js
- 2 tests. Commit: 853cc3b

### Iteracion 2 — postCrearClienteHandler integra editarBranch
- `postCrearClienteHandler(cliente, deps)` en server-helpers.js
- Si !duplicado && cliente.entrega: llama editarBranch; errores no fallan el response
- server.js handler usa postCrearClienteHandler
- 3 tests nuevos. Commit: 4ef1443

## Siguiente
Iteracion 3 — Card "Domicilio de entrega" en csf-upload.html
