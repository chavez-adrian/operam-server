# RALPH PLAN - Issue #5: Guard RFC duplicado en csf-upload

## Objetivo
Detectar RFC duplicado antes de crear cliente, cargar datos existentes en el form.

## Tareas

### Iteracion 1 - buscarClientePorRFC en server-helpers.js (TDD)
- Test: `buscarClientePorRFC(token, rfc, baseUrl)` hace GET a Operam por tax_id y mapea datos completos
- Implementar: extraer datos del cliente (razon social, RFC, domicilio, regimen, primer branch)
- Mapeo: CustName, tax_id, street, street_number, suite_number, district, postal_code, city, state, regimen -> primer branch: br_name, addr_street, addr_colony, addr_zip, addr_city, addr_state, phone, email

### Iteracion 2 - GET /api/buscar-cliente en server.js (TDD)
- Test: endpoint existe en HTML (el frontend lo llama)
- Implementar: `GET /api/buscar-cliente?rfc=...` en server.js usando buscarClientePorRFC
- Responder con datos del cliente o `{ encontrado: false }` si no hay match

### Iteracion 3 - crearClienteEnOperam devuelve datos completos en duplicado (TDD)
- Test: cuando hay duplicado, crearClienteEnOperam llama buscarClientePorRFC y devuelve datos completos
- Implementar: ampliar el bloque de duplicado en crearClienteEnOperam para incluir datos completos

### Iteracion 4 - Frontend: llamar buscar-cliente despues de parsear PDF (TDD)
- Test: csf-upload.html tiene funcion `buscarClienteExistente(rfc)` que llama al API
- Implementar: en procesarPDF, despues de parsearCSF y si hay RFC, llamar al endpoint
- Si hay match: banner, poblar form, cambiar boton, guardar cliente_id y snapshot

### Iteracion 5 - Frontend: banner, poblar form con datos del servidor (TDD)
- Test: HTML tiene elemento para banner de duplicado (id="bannerDuplicado" o similar)
- Test: funcion que mapea respuesta del servidor a campos del form
- Implementar: mostrar banner, mapear campos, cambiar boton "Actualizar cliente"

### Iteracion 6 - Frontend: guardar cliente_id y snapshot en estado (TDD)
- Test: variable `_clienteExistente` con `{ cliente_id, snapshot }` queda definida
- Implementar: guardar en variables del scope al detectar duplicado

## Criterios de aceptacion
- [x] Todos los tests previos siguen pasando
- [ ] GET /api/buscar-cliente?rfc=... existe y devuelve datos completos
- [ ] POST /api/crear-cliente devuelve datos completos cuando duplicado: true
- [ ] Frontend llama a buscar-cliente al parsear CSF con RFC
- [ ] Si hay match: banner, form poblado, boton cambiado, estado guardado
- [ ] Tests unitarios para logica de busqueda y mapeo
