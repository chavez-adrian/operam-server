# RALPH PLAN — Issue #3: Correo para factura

## Objetivo
Campo opcional "Correo para factura" en ambos formularios. Si se llena, crear
un contacto "Facturas" en Operam con `action: "invoice"`.

## Repos
- Backend + csf-upload.html: `C:\Users\chave\OneDrive\Documents\_Claude\operam\` (rama `master`)
- Cotizador: `C:\Users\chave\OneDrive\Documents\_Claude\cotizador\` (rama `main`)

## Archivos clave
- `operam/server-helpers.js` — añadir `agregarContactoFactura`
- `operam/server.js` — `crearClienteEnOperam` ya no se toca (lo hace el handler)
- `operam/csf-upload.html` — card "Contacto y vendedor" (línea ~272)
- `cotizador/public/index.html` — sección de datos de entrega/contacto
- `cotizador/public/js/app.js` — `crearClienteDesdeCSF()`

## Estructura del contacto en Operam (confirmada en issue #1)
```json
{
  "action": "invoice",
  "ref": "facturación",
  "name": "Facturas",
  "name2": "",
  "email": "<invoice_email>",
  "phone": "",
  "phone2": "",
  "fax": ""
}
```

## Mecanismo de contactos (a verificar en iteración 1)
El API probablemente acepta `PUT /api/v3/sales/customers/{id}` con un campo `contacts`
que reemplaza los contactos. Para AÑADIR uno sin borrar los existentes:
1. GET /api/v3/sales/customers/{id} → obtener `data.contacts` actuales
2. Agregar el nuevo contacto al array
3. PUT /api/v3/sales/customers/{id} con `{ contacts: [...existentes, nuevo] }`

Si ese endpoint no acepta contacts → fallback: agregar "Correo factura: <email>" al campo
`notes` del cliente (ya se puede hacer en `buildClienteBody` en server-helpers.js).

## Flujo esperado
1. Usuario llena `f_invoice_email` (csf-upload) o `cl-email-factura` (cotizador)
2. Payload incluye `invoice_email: "facturacion@empresa.com"`
3. Backend crea cliente → si invoice_email presente y cliente NO es duplicado:
   - GET cliente → leer contacts actuales
   - PUT cliente con contacts + nuevo contacto Facturas
4. En Operam: cliente tiene contacto "Facturas" con acción "invoice"
5. Si ya era duplicado → NO añadir contacto (podría duplicarlo)

---

## ITERACIONES (5 en total)

### Iteración 1 — `agregarContactoFactura` en server-helpers.js
**Tarea:**
1. Explorar si PUT /api/v3/sales/customers/{id} acepta `contacts` array:
   - Usar las credenciales de `C:/Users/chave/OneDrive/Documents/_Claude/.claude/operam-config.json`
   - GET /api/v3/sales/customers/1 → leer contacts existentes
   - PUT /api/v3/sales/customers/1 con `{ cust_ref: "UM UTILITARIO MEXICANO", contacts: [<los mismos contacts>] }` (sin cambiar nada, solo verificar que acepta el campo)
2. Implementar `agregarContactoFactura(token, customer_id, invoice_email, baseUrl)` que:
   - GET cliente → obtener contacts actuales
   - Si ya hay un contact con `ref: "facturación"` → no duplicar, retornar `{ ok: true, skipped: true }`
   - Construir nuevo contact y hacer PUT con contacts completo
   - Si PUT falla → lanzar error (el caller lo atrapa y loguea)
3. Exportar en `module.exports`
**Test:** `tests/server.test.js` — mock fetch, verificar el flujo GET→PUT y el case de skip si ya existe.

### Iteración 2 — `postCrearClienteHandler` llama `agregarContactoFactura`
**Tarea:** En `postCrearClienteHandler` en server-helpers.js:
- Si `!resultado.duplicado && cliente.invoice_email`: llamar `agregarContactoFactura`
- Errores se loguean pero NO fallan el response (igual que editarBranch)
- Pasar `agregarContactoFactura` como dep inyectado (agregar a `deps`)
**Test:** Tests que verifican que con `invoice_email`, se llama `agregarContactoFactura`; sin él, no se llama.

### Iteración 3 — Campo `f_invoice_email` en csf-upload.html
**Tarea:** En el card "Contacto y vendedor" (~línea 297), después del campo `f_email`:
```html
<div class="field">
  <label>Correo para factura <span style="opacity:0.5">(opcional)</span></label>
  <input id="f_invoice_email" type="email" inputmode="email" placeholder="facturacion@empresa.com">
</div>
```
En `leerForm()`: incluir `invoice_email: get('f_invoice_email')` en el objeto retornado.
**Test:** Test de HTML parsing verifica que el campo existe.

### Iteración 4 — Campo `cl-email-factura` en cotizador
**Tarea:**
- En `cotizador/public/index.html`: agregar campo `cl-email-factura` en la sección de datos de entrega/contacto, cerca de `cl-email-entrega`
- En `cotizador/public/js/app.js`, función `crearClienteDesdeCSF()`: incluir `invoice_email: document.getElementById('cl-email-factura')?.value || ''` en el payload
**Test:** helpers.cjs con test de que el payload incluye `invoice_email` cuando el campo tiene valor.

### Iteración 5 — Edge cases y no-regresión
**Tarea:**
- `invoice_email` vacío → `agregarContactoFactura` no se llama (verificar en handler)
- Cliente duplicado + `invoice_email` → `agregarContactoFactura` no se llama
- Contact "facturación" ya existe → skip sin error
- `agregarContactoFactura` falla → response sigue siendo `{ ok: true }`
**Test:** Cubrir los 4 casos edge en tests/server.test.js.

---

## Definition of Done
- [ ] `agregarContactoFactura` implementada y testeada
- [ ] Handler llama `agregarContactoFactura` solo si `!duplicado && invoice_email`
- [ ] Campo `f_invoice_email` en csf-upload.html
- [ ] Campo `cl-email-factura` en cotizador
- [ ] Todos los tests pasan
- [ ] Commits por iteración, push master (operam) y main (cotizador)
- [ ] Comentario en operam-server#3, issue cerrado

## Notas
- server-helpers.js es CommonJS
- app.js del cotizador es ES modules
- Git operam: `& "C:\Program Files\Git\bin\git.exe" -C "C:\Users\chave\OneDrive\Documents\_Claude\operam" ...`
- Git cotizador: `& "C:\Program Files\Git\bin\git.exe" -C "C:\Users\chave\OneDrive\Documents\_Claude\cotizador" ...`
- Tests operam: `& "C:\Program Files\nodejs\node.exe" --test "C:\Users\chave\OneDrive\Documents\_Claude\operam\tests\"`
- Tests cotizador: `& "C:\Program Files\nodejs\node.exe" --test "C:\Users\chave\OneDrive\Documents\_Claude\cotizador\public\js\__tests__\"`
- Credenciales Operam para exploración: `C:/Users/chave/OneDrive/Documents/_Claude/.claude/operam-config.json`
- Node: `& "C:\Program Files\nodejs\node.exe"`
