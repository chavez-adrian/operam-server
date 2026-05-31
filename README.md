# operam-server

Servidor de integracion con Operam ERP para Peltre Nacional SA de CV. Expone endpoints para alta y actualizacion de clientes desde Constancia de Situacion Fiscal (CSF), con log persistente en Neon Postgres.

Incluye `csf-upload.html`: herramienta standalone para el equipo de administracion que permite subir una CSF, extraer datos automaticamente y dar de alta o actualizar el cliente en Operam.

**Produccion:** https://operam-server.onrender.com

## Stack

- Node.js / Express — CommonJS
- Base de datos: Neon Postgres (log de altas)
- Almacenamiento: Dropbox (backup de PDFs de CSF)
- Integracion: Operam ERP v3

## Requisitos

```
node >= 18
npm install
```

Variables de entorno requeridas:

| Variable | Descripcion |
|----------|-------------|
| `OPERAM_URL` | URL base de Operam (ej. `https://peltrenacional.operam.pro`) |
| `OPERAM_COMPANY` | ID de empresa en Operam (346) |
| `OPERAM_USER` | Usuario API Operam (`c.code`) |
| `OPERAM_PASS` | Contrasena API Operam |
| `DATABASE_URL` | Connection string de Neon Postgres |
| `DROPBOX_TOKEN` | Token de acceso Dropbox (backup CSF) |
| `PORT` | Puerto del servidor (default: 3000) |

## Uso

```bash
npm start    # produccion
npm test     # todos los tests
```

## Estructura

```
server.js           # API Express + endpoints + CORS
server-helpers.js   # funciones puras: Operam API, diff, busqueda por RFC
csf-upload.html     # herramienta web standalone para alta de clientes
tests/
  server.test.js    # tests de backend (node:test)
  frontend.test.js  # tests de estructura HTML y JS de csf-upload
```

## Herramienta csf-upload.html

Interfaz web para el equipo administrativo. Flujo completo:

1. Subir PDF de Constancia de Situacion Fiscal del SAT
2. El sistema extrae automaticamente: RFC, razon social, domicilio fiscal, regimen fiscal, IDCIF
3. **Guard de duplicado:** si el RFC ya existe en Operam, carga los datos del cliente existente
4. Campos de domicilio de entrega pre-llenados desde el domicilio fiscal (editables)
5. Alta de cliente nuevo en Operam con un clic, o actualizacion de cliente existente

### Flujo de actualizacion de cliente existente
1. Se detecta RFC duplicado al parsear la CSF
2. Se cargan todos los datos del cliente existente en el formulario
3. El vendedor puede editar cualquier campo
4. Al hacer clic en "Actualizar cliente": se calcula el diff con los valores originales
5. Panel de confirmacion lista los campos que van a cambiar
6. Al confirmar: Operam recibe solo los campos modificados

## API endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/crear-cliente` | Crear cliente en Operam desde datos de CSF. Devuelve datos completos si ya existe (duplicado). |
| GET | `/api/buscar-cliente?rfc=...` | Buscar cliente en Operam por RFC exacto |
| PUT | `/api/actualizar-cliente/:id` | Actualizar cliente en Operam con solo los campos del diff |
| GET | `/api/log` | Historial de altas (ultimas 200) |

### Respuesta POST /api/crear-cliente

Cuando el cliente ya existe (`duplicado: true`), la respuesta incluye los datos completos del cliente para pre-llenar el formulario:

```json
{
  "duplicado": true,
  "cliente_id": 123,
  "nombre": "EMPRESA SA DE CV",
  "tax_id": "EMP930101ABC",
  "CustName": "EMPRESA SA DE CV",
  "street": "Calle Ejemplo",
  "district": "Colonia Centro",
  "postal_code": "06600",
  "city": "Ciudad de Mexico",
  "state": "CDMX",
  "cfdi_regimen_fiscal": "601",
  "branch": {
    "br_name": "Sucursal Principal",
    "addr_street": "Calle Entrega 1",
    "addr_colony": "Col. Norte",
    "addr_zip": "06600",
    "addr_city": "Ciudad de Mexico",
    "addr_state": "CDMX",
    "phone": "5512345678",
    "email": "contacto@empresa.mx"
  }
}
```

## Log de clientes

Cada alta o intento queda registrado en la tabla `clientes_log` de Neon Postgres:

| Campo | Descripcion |
|-------|-------------|
| `rfc` | RFC del cliente |
| `nombre` | Razon social |
| `resultado` | `creado`, `duplicado`, o `error` |
| `cliente_id` | ID asignado por Operam |
| `fuente` | Origen: `csf-upload`, `cotizador`, etc. |
| `dropbox_ok` | Si el PDF se subio a Dropbox |
| `error_msg` | Mensaje de error si aplica |

## Tests

```bash
npm test
# 76 tests, 0 fallas
```
