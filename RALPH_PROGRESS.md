# RALPH PROGRESS

## Estado
Iteraciones completadas: 3 / 5

## Completadas

### Iteracion 1 — `editarBranch` en server-helpers.js
- server-helpers.js: toTitleCase + editarBranch; TEXT_FIELDS convertidos
- server.js importa desde server-helpers. 2 tests. Commit: 853cc3b

### Iteracion 2 — postCrearClienteHandler integra editarBranch
- postCrearClienteHandler(cliente, deps) en server-helpers.js
- Si !duplicado && cliente.entrega: llama editarBranch; errores no fallan response
- server.js handler usa postCrearClienteHandler. 3 tests. Commit: 4ef1443

### Iteracion 3 — Card "Domicilio de entrega" en csf-upload.html
- Card con 10 campos: f_del_name, f_del_street, f_del_ext, f_del_int,
  f_del_colony, f_del_zip, f_del_city, f_del_state, f_del_phone, f_del_email
- Aparece ANTES del card "Contacto y vendedor"
- CSS .row-2 grid helper agregado
- tests/frontend.test.js con 11 tests HTML parsing. Commit: 2d18b52

## Siguiente
Iteracion 4 — Pre-llenado del card de entrega al parsear CSF
