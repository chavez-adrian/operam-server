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
