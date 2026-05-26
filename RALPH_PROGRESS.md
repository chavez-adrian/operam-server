# RALPH PROGRESS

## Estado
Iteraciones completadas: 5 / 5 — COMPLETO

## Completadas

### Iteracion 1 — `editarBranch` en server-helpers.js (853cc3b)
- server-helpers.js: toTitleCase + editarBranch; TEXT_FIELDS convertidos
- server.js importa desde server-helpers. 2 tests.

### Iteracion 2 — postCrearClienteHandler integra editarBranch (4ef1443)
- postCrearClienteHandler(cliente, deps) en server-helpers.js
- Si !duplicado && cliente.entrega: llama editarBranch; errores no fallan response
- server.js handler usa postCrearClienteHandler. 3 tests.

### Iteracion 3 — Card "Domicilio de entrega" en csf-upload.html (2d18b52)
- 10 campos: f_del_name, f_del_street, f_del_ext, f_del_int, f_del_colony,
  f_del_zip, f_del_city, f_del_state, f_del_phone, f_del_email
- CSS .row-2 grid helper. 11 tests HTML parsing.

### Iteracion 4 — Pre-llenado del card de entrega (10a60f3)
- buildEntregaPreFill(data): mapea domicilio fiscal a campos f_del_*
- poblarForm llama buildEntregaPreFill y setea los 8 campos. 2 tests.

### Iteracion 5 — Sub-objeto entrega en payload (3006df4)
- buildEntregaPayload(get): mapea f_del_* a br_name/addr_*/phone/email
- crearCliente() asigna datos.entrega = buildEntregaPayload(get). 2 tests.

## Total: 20 tests en verde. Push a master. Comentario en issue #2.
