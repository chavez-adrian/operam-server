# RALPH PROGRESS - Issue #5

## Estado: COMPLETO

## Iteraciones completadas

### Iteracion 1 - buscarClientePorRFC (RED -> GREEN)
- Test: 3 tests para buscarClientePorRFC (datos completos, no encontrado, env URL)
- Impl: funcion buscarClientePorRFC en server-helpers.js
- Exportada en module.exports
- Commit: feat(#5): agregar buscarClientePorRFC en server-helpers (iter 1)

### Iteraciones 2-4 - Backend endpoint + Frontend guard (RED -> GREEN)
- Test server: crearClienteEnOperam devuelve datos completos cuando duplicado
- Test frontend: 4 tests nuevos (bannerDuplicado, _clienteExistente, Actualizar cliente, API call)
- Impl server.js:
  - Importar buscarClientePorRFC
  - crearClienteEnOperam: llama buscarClientePorRFC en duplicado y retorna datos completos
  - Nuevo endpoint GET /api/buscar-cliente?rfc=... 
  - CORS actualizado para GET
- Impl csf-upload.html:
  - Variable _clienteExistente en scope
  - Constante API_BUSCAR
  - Funcion buscarClienteExistente(rfc) - llama al endpoint
  - Funcion poblarFormDesdeOperam(datos) - pobla form con datos del servidor
  - procesarPDF: llama buscarClienteExistente despues de extraer RFC
  - Si hay match: muestra bannerDuplicado, pobla form, cambia boton a "Actualizar cliente"
  - resetForm: limpia _clienteExistente y banner
- Commit: feat(#5): endpoint buscar-cliente, guard RFC duplicado en frontend (iter 2-4)

## Tests finales
- 55 tests, 55 pass, 0 fail
- Push a master exitoso

