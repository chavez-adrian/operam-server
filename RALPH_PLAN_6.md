# RALPH Plan - Issue #6: Actualizar cliente existente con diff y confirmacion

## Tareas

### Iteracion 1: `calcularDiff` + tests
- Agregar funcion `calcularDiff(snapshot, formValues)` en server-helpers.js
- Recibe snapshot (fieldId: value) y valores actuales del formulario
- Retorna objeto con solo los campos que cambiaron: { fieldId: { anterior, nuevo } }
- Tests en server.test.js (TDD red -> green)

### Iteracion 2: `actualizarClienteEnOperam` + endpoint `PUT /api/actualizar-cliente/:id`
- Agregar `actualizarClienteEnOperam(token, cliente_id, diff, baseUrl)` en server-helpers.js
- Hace PUT a Operam `/api/v3/sales/customers/:id` con solo los campos del diff
- Retorna `{ ok: true }` o lanza error
- Agregar endpoint `PUT /api/actualizar-cliente/:id` en server.js
- Actualizar Access-Control-Allow-Methods para incluir PUT
- Tests en server.test.js

### Iteracion 3: Panel de confirmacion en csf-upload.html
- Agregar HTML del panel `#panelConfirmacion` (hidden por defecto)
  - Mensaje fijo: "Se van a modificar los datos del cliente en Operam"
  - Lista de cambios (campo legible: valor anterior -> valor nuevo)
  - Boton "Confirmar cambios" (id="btnConfirmar")
  - Boton "Cancelar" (id="btnCancelarConfirmacion")
- Agregar CSS para el panel
- Tests en frontend.test.js

### Iteracion 4: Logica JS del flujo de confirmacion en csf-upload.html
- Modificar `crearCliente()` para bifurcar segun `_clienteExistente`:
  - Si hay cliente existente: calcular diff, mostrar panel o mensaje "No hay cambios"
  - Si no hay cliente existente: flujo normal de creacion
- Implementar `mostrarPanelConfirmacion(diff)`:
  - Construye lista legible de cambios
  - Muestra el panel
- Implementar handler de "Confirmar cambios":
  - Llama `PUT /api/actualizar-cliente/:id` con el diff
  - Muestra resultado (exito o error)
  - Oculta panel al terminar
- Implementar handler de "Cancelar":
  - Oculta panel
  - Vuelve al estado de edicion
- Agregar `API_ACTUALIZAR = ${API_BASE}/api/actualizar-cliente`
- Tests en frontend.test.js (funciones calcularDiff en HTML, existencia de elementos)

## Mapa de campos (snapshot -> formulario)
El snapshot que ya guardamos tiene las claves del objeto `encontrado` de buscarClientePorRFC:
- CustName, tax_id, street, street_number, suite_number, district, postal_code, city, state, cfdi_regimen_fiscal
- branch.br_name, branch.addr_street, branch.addr_colony, branch.addr_zip, branch.addr_city, branch.addr_state, branch.phone, branch.email

El diff que se envia al PUT de Operam debe usar los nombres de campo de la API de Operam (cust_name, street, etc.)

## Notas de implementacion
- `calcularDiff` compara string a string (trim)
- El diff para el PUT debe mapearse a nombres de campo de Operam, NO los del formulario
- El panel de confirmacion usa nombres legibles (labels del formulario)
- CORS: agregar PUT a Access-Control-Allow-Methods
