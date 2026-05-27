# RALPH PLAN — Issue #4: Cliente extranjero

## Objetivo
Soporte completo para clientes de USA, Canadá y otras regiones:
- Frontend adapta formulario al seleccionar país ≠ México (RFC readonly, campo Tax ID, régimen oculto)
- Backend crea cliente con `curr_code: USD`, `area` correcta, Tax ID en notas
- Branch se actualiza con tax group exento y cuentas contables de exportación

## Repos
- Backend + csf-upload.html: `C:\Users\chave\OneDrive\Documents\_Claude\operam\` (rama `master`)
- Cotizador: `C:\Users\chave\OneDrive\Documents\_Claude\cotizador\` (rama `main`)

## Archivos clave
- `operam/server-helpers.js` — `editarBranch`, `postCrearClienteHandler`
- `operam/server.js` — `crearClienteEnOperam`, DEFAULTS
- `operam/csf-upload.html` — card "Datos del contribuyente" (línea ~194), función `crearCliente()`
- `operam/config-ids.json` — IDs de Operam (leer para los valores exactos)
- `cotizador/public/js/app.js` — `crearClienteDesdeCSF()`, selector `cl-pais`

## Valores de config-ids.json (referencia rápida)
```
tax_group exento: "2"
area MX: "1", USA: "5", Canadá: "7", Otras: "6"
accounts: cxc_nacional "105-01-001", cxc_extranjero "105-02-001"
          ventas_exportacion "401-07-000", descuento_ventas "402-01-001"
```

## Flujo esperado post-implementación
1. Usuario selecciona país = EUA en el formulario
2. RFC se llena con `XEXX010101000` (readonly), régimen se oculta (fijo 610), aparece campo "Tax ID / EIN"
3. Al crear: payload incluye `{ country: 'US', curr_code: 'USD', invoice_tax_id: '...' }`
4. Backend: crea cliente con `curr_code: 'USD'`, `area: 5`, notes incluye "Tax ID: ..."
5. Backend: edita branch con `tax_group_id: 2`, `sales_account: '401-07-000'`, `receivables_account: '105-02-001'`, `payment_discount_account: '401-07-000'`

## Constantes a usar en código
```js
const RFC_EXTRANJERO = 'XEXX010101000';
const REGIMEN_EXTRANJERO = '610';
const AREA_POR_PAIS = { MX: '1', US: '5', CA: '7' }; // default: '6'
const CONFIG_BRANCH_EXTRANJERO = {
  tax_group_id: '2',
  sales_account: '401-07-000',
  receivables_account: '105-02-001',
  payment_discount_account: '401-07-000',
};
```

---

## ITERACIONES (5 en total)

### Iteración 1 — `getConfigPorPais(country)` en server-helpers.js
**Tarea:** Agregar función pura `getConfigPorPais(country)` que dado un código de país ('MX', 'US', 'CA', u otro) retorna:
```js
{
  curr_code: 'MXN' | 'USD',
  area: '1' | '5' | '7' | '6',
  esExtranjero: false | true,
  branchConfig: {} | { tax_group_id, sales_account, receivables_account, payment_discount_account }
}
```
Para MX: `{ curr_code: 'MXN', area: '1', esExtranjero: false, branchConfig: {} }`
Para US: `{ curr_code: 'USD', area: '5', esExtranjero: true, branchConfig: CONFIG_BRANCH_EXTRANJERO }`
Para CA: `{ curr_code: 'USD', area: '7', esExtranjero: true, branchConfig: CONFIG_BRANCH_EXTRANJERO }`
Para otros: `{ curr_code: 'USD', area: '6', esExtranjero: true, branchConfig: CONFIG_BRANCH_EXTRANJERO }`
Exportar junto con las demás funciones en `module.exports`.
**Test:** `tests/server.test.js` — nuevos tests para `getConfigPorPais` con los 4 casos.

### Iteración 2 — `editarBranch` y `postCrearClienteHandler` con config extranjero
**Tarea:**
- `editarBranch(token, customer_id, entrega, baseUrl, branchConfig)`: acepta 5to parámetro opcional `branchConfig`. Si está presente, mezcla sus campos en el body del PUT (junto a los campos de `entrega` ya existentes).
- `postCrearClienteHandler`: al llamar `editarBranch`, pasar `branchConfig` derivado de `getConfigPorPais(cliente.country)`.
**Test:** Tests que verifican que con `country: 'US'`, el PUT al branch recibe `tax_group_id: '2'`, `sales_account: '401-07-000'`, etc.

### Iteración 3 — `crearClienteEnOperam` en server.js usa `curr_code` y `area` dinámicos
**Tarea:** En `crearClienteEnOperam(cliente)` en `server.js`:
- Usar `cliente.curr_code` si viene en el payload (default `'MXN'`)
- Usar `cliente.area_pais` si viene (default `DEFAULTS.area = '1'`)
- Si `cliente.invoice_tax_id` existe, agregar al campo `notes`: prepend `"Tax ID: {valor}\n"` antes de las actividades
- `cfdi_regimen_fiscal`: usar `cliente.cfdi_regimen_fiscal` (que puede llegar como `'610'` para extranjeros)
**Test:** No hay tests de integración para server.js directamente; verificar en exploración manual o agregar test en server.test.js mockeando fetch.

### Iteración 4 — Selector de país en csf-upload.html
**Tarea:** En el card "Datos del contribuyente" (línea ~194):
1. Agregar `<select id="f_pais">` antes del campo RFC con opciones: México, EUA (+US), Canadá (+CA), Otro
2. Agregar `<input id="f_tax_id_ext" type="text">` (hidden por default) con label "Tax ID / EIN / VAT"
3. Event listener en `f_pais`: al cambiar a extranjero → RFC = `XEXX010101000` (readonly), ocultar card "Fiscal", mostrar `f_tax_id_ext`; al volver a MX → RFC editable, mostrar "Fiscal", ocultar `f_tax_id_ext`
4. En `crearCliente()`: incluir en el payload `country`, `curr_code`, `area_pais` (derivados del selector `f_pais`) e `invoice_tax_id` (de `f_tax_id_ext`)
**Test:** Tests de parseo de HTML verificando que los nuevos elementos existen.

### Iteración 5 — Lógica de país en cotizador (app.js)
**Tarea:** En `cotizador/public/js/app.js`:
1. El selector `cl-pais` ya existe. Agregar event listener `change` equivalente: RFC → `XEXX010101000` (readonly), `cl-cfdi-regimen` hidden + fijo `610` si hay tal campo, mostrar/ocultar campo Tax ID externo (si existe o crearlo inline)
2. En `crearClienteDesdeCSF()`: incluir en el payload `country` (desde `cl-pais`), `curr_code` ('USD' si extranjero, 'MXN' si MX), `area_pais` y `invoice_tax_id`
**Test:** Tests de `buildEntregaPayload` o función nueva `buildPaisConfig(pais)` que retorna `{ country, curr_code, area_pais }`.

---

## Definition of Done
- [ ] `getConfigPorPais` implementada y testeada en server-helpers.js
- [ ] `editarBranch` acepta branchConfig para clientes extranjeros
- [ ] `postCrearClienteHandler` pasa branchConfig según país
- [ ] `crearClienteEnOperam` usa curr_code, area_pais e invoice_tax_id del payload
- [ ] csf-upload.html: selector de país, RFC readonly, campo Tax ID
- [ ] cotizador: misma lógica de selector de país
- [ ] Tests pasan en ambos repos
- [ ] Commits por iteración, push a master (operam) y main (cotizador)
- [ ] Comentario en operam-server#4, issue cerrado

## Notas importantes
- `server-helpers.js` es CommonJS (`require`/`module.exports`)
- `app.js` del cotizador es ES modules (`export function`)
- Git operam: `& "C:\Program Files\Git\bin\git.exe" -C "C:\Users\chave\OneDrive\Documents\_Claude\operam" ...`
- Git cotizador: `& "C:\Program Files\Git\bin\git.exe" -C "C:\Users\chave\OneDrive\Documents\_Claude\cotizador" ...`
- Node tests operam: `& "C:\Program Files\nodejs\node.exe" --test tests/` (desde operam/)
- Node tests cotizador: `& "C:\Program Files\nodejs\node.exe" --test public/js/__tests__/` (desde cotizador/)
