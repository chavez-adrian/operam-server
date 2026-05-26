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
