# RALPH PLAN — Issue #2: Alta nacional con domicilio de entrega

## Objetivo
Implementar un flujo completo de alta de cliente nacional desde CSF donde:
1. csf-upload.html muestra un card "Domicilio de entrega" pre-llenado desde la CSF
2. El usuario puede editar los datos antes de crear el cliente
3. Al crear, el backend edita el branch auto-creado en Operam con los datos de entrega en Title Case

## Repo
`C:\Users\chave\OneDrive\Documents\_Claude\operam\`  
GitHub: `chavez-adrian/operam-server` rama `master`

## Archivos clave
- `server.js` — backend Express, CommonJS
- `csf-upload.html` — frontend 870 líneas, vanilla JS, se sirve en GitHub Pages
- `config-ids.json` — IDs de Operam (tax groups, áreas, cuentas)

## API Operam (backend)
- Auth: `POST /api/v3/login` → token JWT
- Crear cliente: `POST /api/v3/sales/customers` → `{ result, customer_id }`
- Ver cliente: `GET /api/v3/sales/customers/{id}` → `{ data: [{ branches: [{ branch_code }] }] }`
- Editar branch: `PUT /api/v3/sales/branches/{branch_code}` con campos:
  `{ customer_id, br_name, br_ref, addr_street, addr_exterior, addr_interior, addr_colony, addr_city, addr_state, addr_zip, contact_name, phone, email, tax_group_id, area, receivables_account, sales_account, payment_discount_account }`

## Contrato del endpoint `/api/crear-cliente` (existente)
El payload POST ya incluye campos de cliente. Añadir sub-objeto opcional:
```json
{
  "tax_id": "...",
  "CustName": "...",
  ...campos existentes...,
  "entrega": {
    "br_name": "Nombre del destinatario",
    "addr_street": "Calle",
    "addr_exterior": "123",
    "addr_interior": "",
    "addr_colony": "Colonia",
    "addr_city": "Ciudad",
    "addr_state": "Estado",
    "addr_zip": "00000",
    "phone": "+52...",
    "email": "contacto@empresa.com"
  }
}
```

## Función toTitleCase
Ya existe en server.js. Úsala para convertir los datos de entrega antes de enviarlos a Operam.

## Tests
Usar Node.js built-in test runner (`node:test` + `node:assert`). Crear `tests/server.test.js`.
Para testear server.js: importar funciones individualmente (extraer si necesario) o mockear `fetch` global.

---

## ITERACIONES (5 en total)

### Iteración 1 — `editarBranch` en server.js
**Tarea:** Crear función `async editarBranch(token, customer_id, entrega)` en server.js que:
1. GET `/api/v3/sales/customers/{customer_id}` → extraer `branches[0].branch_code`
2. PUT `/api/v3/sales/branches/{branch_code}` con los campos de `entrega` en Title Case
3. Retorna `{ ok: true }` o lanza error
Añadir también `node:test` al package.json como script de test.
**Test:** `tests/server.test.js` — mockear fetch, verificar que el PUT recibe los datos en Title Case.

### Iteración 2 — Integrar editarBranch en el flujo POST /api/crear-cliente
**Tarea:** En el handler de `/api/crear-cliente`, después de `crearClienteEnOperam` exitoso y no duplicado, si `req.body.entrega` existe, llamar `editarBranch`. Errores de editarBranch se loguean pero no fallan la respuesta (igual que Dropbox).
**Test:** Verificar que el flujo completo llama editarBranch cuando se pasa el sub-objeto entrega.

### Iteración 3 — Card "Domicilio de entrega" en csf-upload.html
**Tarea:** Agregar un card HTML nuevo ANTES del card "Contacto y vendedor" con:
- `f_del_name` — Entregar a (nombre destinatario)
- `f_del_street` — Calle
- `f_del_ext` — Núm. exterior
- `f_del_int` — Núm. interior (opcional)
- `f_del_colony` — Colonia
- `f_del_zip` — Código postal
- `f_del_city` — Ciudad / Municipio
- `f_del_state` — Estado
- `f_del_phone` — Teléfono de entrega
- `f_del_email` — Correo de entrega
**Test:** Verificar que los IDs de los campos existen en el DOM (puede ser un test de parseo de HTML).

### Iteración 4 — Pre-llenado del card de entrega al parsear CSF
**Tarea:** En la función `parsearCSF()` (o donde se llama), después de extraer los datos fiscales, pre-llenar los campos del card de entrega con los datos del domicilio fiscal como sugerencia editable:
- f_del_street ← calle del domicilio fiscal
- f_del_ext ← num exterior fiscal
- f_del_int ← num interior fiscal
- f_del_colony ← colonia fiscal
- f_del_zip ← CP fiscal
- f_del_city ← municipio fiscal
- f_del_state ← estado fiscal
- f_del_name ← razón social (recortada) como sugerencia
**Test:** Verificar que la función de pre-llenado asigna correctamente los valores.

### Iteración 5 — Incluir entrega en el payload al crear cliente
**Tarea:** En la función `crearCliente()` de csf-upload.html (la que hace POST a /api/crear-cliente), recolectar los valores de los campos f_del_* y construir el sub-objeto `entrega`. Incluirlo en el body del POST.
**Test:** Verificar que el payload construido incluye el sub-objeto entrega con los valores correctos.

---

## Definition of Done (issue completo)
- [ ] editarBranch implementada y testeada
- [ ] Flujo POST /api/crear-cliente llama editarBranch
- [ ] Card de entrega visible en csf-upload.html
- [ ] Pre-llenado desde CSF funciona
- [ ] Payload incluye sub-objeto entrega
- [ ] Todos los tests pasan (`node --test tests/`)
- [ ] Commit por cada iteración con mensaje descriptivo
- [ ] Push a master al finalizar
