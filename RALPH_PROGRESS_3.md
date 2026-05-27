# RALPH PROGRESS — Issue #3

## Estado
Iteraciones completadas: 5 / 5

## Completadas

### Iteracion 1 — `agregarContactoFactura` en server-helpers.js
- Explorado: PUT /api/v3/sales/customers/{id} acepta `contacts` array
- Implementada `agregarContactoFactura(token, customer_id, invoice_email, baseUrl)`
- Skip si ya existe contacto con `name === "Facturas"` y `action === "invoice"`
- 3 tests: GET->PUT flow, conserva contactos existentes, skip si ya existe
- Commit: 766824a

### Iteracion 2 — `postCrearClienteHandler` llama `agregarContactoFactura`
- Handler llama `agregarContactoFactura` como dep inyectado
- Solo si `!resultado.duplicado && cliente.invoice_email`
- Error se loguea pero no falla el response
- 4 tests: llama cuando corresponde, no llama si duplicado, no llama si email vacio, error no falla
- Commit: c4996b0

### Iteracion 3 — Campo `f_invoice_email` en csf-upload.html
- Campo "Correo para factura (opcional)" agregado al card Contacto y vendedor
- `leerForm()` incluye `invoice_email: get('f_invoice_email')`
- 2 tests: campo existe, leerForm incluye el campo
- Commit: 0928c26

### Iteracion 4 — Campo `cl-email-factura` en cotizador
- Campo "Correo para factura (opcional)" agregado en sección datos de entrega
- `crearClienteDesdeCSF()` incluye `invoice_email` en payload
- `helpers.cjs` actualizado con `invoice_email: getVal('cl-email-factura')`
- 2 tests en csf-payload.test.cjs
- Commit: 3732337 (cotizador)

### Iteracion 5 — Edge cases y no-regresion
- Verificado: undefined invoice_email no llama agregarContactoFactura
- Verificado: OPERAM_URL env var fallback funciona correctamente
- Los 4 casos del plan ya cubiertos en iteraciones anteriores
- Commit: 98bd657

## Totales
- operam tests: 32/32 pass
- cotizador tests: 24/24 pass
- Pushes: master (operam) y main (cotizador) completos
- Issue #3 cerrado
