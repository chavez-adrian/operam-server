'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Iteracion 1: editarBranch ────────────────────────────────────────────────

test('editarBranch: hace GET de cliente y PUT de branch con datos en Title Case', async (t) => {
  const { editarBranch } = require('../server-helpers.js');

  const TOKEN = 'test-token';
  const CUSTOMER_ID = 42;
  const BRANCH_CODE = 'BR-001';

  const fetchCalls = [];

  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (url.includes(`/api/v3/sales/customers/${CUSTOMER_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          data: [{ branches: [{ branch_code: BRANCH_CODE }] }]
        })
      };
    }
    if (url.includes(`/api/v3/sales/branches/${BRANCH_CODE}`)) {
      return {
        ok: true,
        json: async () => ({ result: true })
      };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };

  const entrega = {
    br_name:       'juan perez garcia',
    addr_street:   'insurgentes sur',
    addr_exterior: '123',
    addr_interior: 'int 4',
    addr_colony:   'del valle',
    addr_city:     'ciudad de mexico',
    addr_state:    'cdmx',
    addr_zip:      '03100',
    phone:         '+525512345678',
    email:         'contacto@empresa.com',
  };

  const result = await editarBranch(TOKEN, CUSTOMER_ID, entrega);

  assert.deepEqual(result, { ok: true });

  const getCall = fetchCalls.find(c => c.url.includes(`/api/v3/sales/customers/${CUSTOMER_ID}`));
  assert.ok(getCall, 'debe hacer GET al cliente');
  assert.equal(getCall.opts.method, 'GET');
  assert.equal(getCall.opts.headers['Authorization'], `Bearer ${TOKEN}`);

  const putCall = fetchCalls.find(c => c.url.includes(`/api/v3/sales/branches/${BRANCH_CODE}`));
  assert.ok(putCall, 'debe hacer PUT al branch');
  assert.equal(putCall.opts.method, 'PUT');

  const putBody = JSON.parse(putCall.opts.body);
  assert.equal(putBody.br_name, 'Juan Perez Garcia', 'br_name debe estar en Title Case');
  assert.equal(putBody.addr_street, 'Insurgentes Sur', 'addr_street debe estar en Title Case');
  assert.equal(putBody.addr_colony, 'Del Valle', 'addr_colony debe estar en Title Case');
  assert.equal(putBody.addr_city, 'Ciudad De Mexico', 'addr_city debe estar en Title Case');
  assert.equal(putBody.addr_state, 'Cdmx', 'addr_state debe estar en Title Case');
  assert.equal(putBody.customer_id, CUSTOMER_ID, 'customer_id debe estar en el PUT body');
  assert.equal(putBody.email, 'contacto@empresa.com', 'email no debe transformarse con toTitleCase');
  assert.equal(putBody.phone, '+525512345678', 'phone no debe transformarse con toTitleCase');
  assert.equal(putBody.addr_zip, '03100', 'addr_zip no debe transformarse');
});

test('editarBranch: lanza error si el GET no devuelve branches', async (t) => {
  const { editarBranch } = require('../server-helpers.js');

  global.fetch = async (url) => {
    if (url.includes('/api/v3/sales/customers/')) {
      return { ok: true, json: async () => ({ data: [{ branches: [] }] }) };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };

  await assert.rejects(
    () => editarBranch('tok', 99, { br_name: 'test' }),
    /branch/i
  );
});
