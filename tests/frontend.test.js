'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'csf-upload.html'), 'utf8');

// ─── Iteracion 3: Card domicilio de entrega ───────────────────────────────────

const DELIVERY_FIELD_IDS = [
  'f_del_name',
  'f_del_street',
  'f_del_ext',
  'f_del_int',
  'f_del_colony',
  'f_del_zip',
  'f_del_city',
  'f_del_state',
  'f_del_phone',
  'f_del_email',
];

for (const fieldId of DELIVERY_FIELD_IDS) {
  test(`Card entrega: campo #${fieldId} existe en HTML`, () => {
    assert.ok(
      html.includes(`id="${fieldId}"`),
      `El campo id="${fieldId}" no se encontro en csf-upload.html`
    );
  });
}

// ─── Iteracion 4: pre-llenado del card de entrega ────────────────────────────

test('buildEntregaPreFill: mapea datos fiscales a campos de entrega', () => {
  const match = html.match(/function buildEntregaPreFill\(data\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'buildEntregaPreFill no encontrada en csf-upload.html');

  const fn = new Function('data', match[1] + '\n');
  const data = {
    CustName:     'ACEROS SA DE CV',
    street:       'insurgentes sur',
    street_number: '1234',
    suite_number:  'int 5',
    district:     'del valle',
    postal_code:  '03100',
    city:         'benito juarez',
    state:        'cdmx',
  };

  const result = fn(data);

  assert.equal(result.f_del_name,   data.CustName,      'f_del_name debe ser la razon social');
  assert.equal(result.f_del_street, data.street,         'f_del_street <- calle fiscal');
  assert.equal(result.f_del_ext,    data.street_number,  'f_del_ext <- num exterior fiscal');
  assert.equal(result.f_del_int,    data.suite_number,   'f_del_int <- num interior fiscal');
  assert.equal(result.f_del_colony, data.district,       'f_del_colony <- colonia fiscal');
  assert.equal(result.f_del_zip,    data.postal_code,    'f_del_zip <- CP fiscal');
  assert.equal(result.f_del_city,   data.city,           'f_del_city <- municipio fiscal');
  assert.equal(result.f_del_state,  data.state,          'f_del_state <- estado fiscal');
});

test('poblarForm llama a buildEntregaPreFill para setear campos del card de entrega', () => {
  const hasPoblarForm = html.includes('buildEntregaPreFill');
  assert.ok(hasPoblarForm, 'poblarForm debe llamar a buildEntregaPreFill');
  const iteratesFields = html.includes('entregaFields') || html.includes('buildEntregaPreFill(data)');
  assert.ok(iteratesFields, 'poblarForm debe usar buildEntregaPreFill(data)');
});

// ─── Iteracion 5: buildEntregaPayload ────────────────────────────────────────

test('buildEntregaPayload: construye sub-objeto entrega con valores de f_del_*', () => {
  const match = html.match(/function buildEntregaPayload\(get\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'buildEntregaPayload no encontrada en csf-upload.html');

  const fn = new Function('get', match[1] + '\n');

  const values = {
    f_del_name:   'Almacen Central',
    f_del_street: 'Insurgentes Sur',
    f_del_ext:    '1234',
    f_del_int:    'Int 5',
    f_del_colony: 'Del Valle',
    f_del_zip:    '03100',
    f_del_city:   'Benito Juarez',
    f_del_state:  'CDMX',
    f_del_phone:  '+52 55 1234 5678',
    f_del_email:  'almacen@empresa.com',
  };
  const get = id => values[id] || '';

  const result = fn(get);

  assert.equal(result.br_name,       values.f_del_name,   'br_name <- f_del_name');
  assert.equal(result.addr_street,   values.f_del_street, 'addr_street <- f_del_street');
  assert.equal(result.addr_exterior, values.f_del_ext,    'addr_exterior <- f_del_ext');
  assert.equal(result.addr_interior, values.f_del_int,    'addr_interior <- f_del_int');
  assert.equal(result.addr_colony,   values.f_del_colony, 'addr_colony <- f_del_colony');
  assert.equal(result.addr_zip,      values.f_del_zip,    'addr_zip <- f_del_zip');
  assert.equal(result.addr_city,     values.f_del_city,   'addr_city <- f_del_city');
  assert.equal(result.addr_state,    values.f_del_state,  'addr_state <- f_del_state');
  assert.equal(result.phone,         values.f_del_phone,  'phone <- f_del_phone');
  assert.equal(result.email,         values.f_del_email,  'email <- f_del_email');
});

test('crearCliente incluye sub-objeto entrega en el payload', () => {
  const hasBuildEntregaPayload = html.includes('buildEntregaPayload');
  assert.ok(hasBuildEntregaPayload, 'csf-upload.html debe definir buildEntregaPayload');
  const usesInCrearCliente = html.includes('datos.entrega');
  assert.ok(usesInCrearCliente, 'crearCliente debe asignar datos.entrega');
});

// --- Issue #5: Guard RFC duplicado ---

test('csf-upload.html: llama a /api/buscar-cliente despues de parsear RFC', () => {
  assert.ok(
    html.includes('/api/buscar-cliente'),
    'csf-upload.html debe llamar a /api/buscar-cliente'
  );
  assert.ok(
    html.includes('buscarClienteExistente') || html.includes('buscar-cliente'),
    'csf-upload.html debe tener logica de busqueda de cliente existente'
  );
});

test('csf-upload.html: tiene banner para cliente duplicado (id="bannerDuplicado")', () => {
  assert.ok(
    html.includes('id="bannerDuplicado"'),
    'debe existir elemento con id="bannerDuplicado"'
  );
});

test('csf-upload.html: tiene variable _clienteExistente en el scope', () => {
  assert.ok(
    html.includes('_clienteExistente'),
    'debe haber variable _clienteExistente en el scope'
  );
});

test('csf-upload.html: boton btnCrear cambia a "Actualizar cliente" cuando hay duplicado', () => {
  assert.ok(
    html.includes('Actualizar cliente'),
    'debe haber texto "Actualizar cliente" para el boton cuando hay duplicado'
  );
});

test('Card entrega: aparece ANTES de "Contacto y vendedor"', () => {
  const deliveryPos = html.indexOf('f_del_name');
  const contactoPos = html.indexOf('Contacto y vendedor');
  assert.ok(deliveryPos !== -1, 'f_del_name no encontrado en HTML');
  assert.ok(contactoPos !== -1, '"Contacto y vendedor" no encontrado en HTML');
  assert.ok(
    deliveryPos < contactoPos,
    'El card de entrega debe aparecer ANTES del card "Contacto y vendedor"'
  );
});

// --- Issue #6 Iteracion 3: Panel de confirmacion ---------------------------------

test('csf-upload.html: existe div#panelConfirmacion', () => {
  assert.ok(
    html.includes('id="panelConfirmacion"'),
    'debe existir elemento con id="panelConfirmacion"'
  );
});

test('csf-upload.html: existe boton id="btnConfirmar"', () => {
  assert.ok(
    html.includes('id="btnConfirmar"'),
    'debe existir boton con id="btnConfirmar"'
  );
});

test('csf-upload.html: existe boton id="btnCancelarConfirmacion"', () => {
  assert.ok(
    html.includes('id="btnCancelarConfirmacion"'),
    'debe existir boton con id="btnCancelarConfirmacion"'
  );
});

test('csf-upload.html: panel de confirmacion tiene texto "Se van a modificar los datos del cliente en Operam"', () => {
  assert.ok(
    html.includes('Se van a modificar los datos del cliente en Operam'),
    'el panel debe tener el mensaje de confirmacion requerido'
  );
});

test('csf-upload.html: existe div#listaCambios para mostrar campos modificados', () => {
  assert.ok(
    html.includes('id="listaCambios"'),
    'debe existir elemento con id="listaCambios" para listar los campos'
  );
});

test('csf-upload.html: tiene API_ACTUALIZAR con ruta /api/actualizar-cliente', () => {
  assert.ok(
    html.includes('/api/actualizar-cliente'),
    'debe tener la constante o referencia a /api/actualizar-cliente'
  );
});
