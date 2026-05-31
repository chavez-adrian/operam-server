# RALPH Progress - Issue #6

## Estado actual
- Iteracion 4 completada: 76 tests pasando

## Iteraciones completadas

### Iteracion 1 (commit a971668)
- `calcularDiff(snapshot, formValues)` agregada a server-helpers.js
- 6 tests unitarios cubriendo no-cambio, cambio parcial, normalizacion null/undefined

### Iteracion 2 (commit e959441)
- `actualizarClienteEnOperam(token, cliente_id, diff, baseUrl)` en server-helpers.js
- `PUT /api/actualizar-cliente/:id` endpoint en server.js
- CORS actualizado para incluir PUT
- 3 tests unitarios

### Iteracion 3 (commit e6bb1ee)
- Panel HTML #panelConfirmacion con #listaCambios, #btnConfirmar, #btnCancelarConfirmacion
- Constante API_ACTUALIZAR en csf-upload.html
- 6 tests frontend

### Iteracion 4 (en progreso)
- crearCliente() bifurca segun _clienteExistente
- mostrarPanelConfirmacion(cambios), confirmarCambios(), cancelarConfirmacion()
- calcularDiffFormulario() con CAMPOS_LEGIBLES y SNAPSHOT_KEY_TO_API mapas
- 6 tests frontend

## Proxima accion
Push a master (todas las tareas del issue completadas)
