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

// ─── Iteracion 2: postCrearClienteHandler ─────────────────────────────────────

test('postCrearClienteHandler: llama editarBranch cuando se pasa entrega', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let editarBranchCalled = false;
  let editarBranchArgs = null;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 77, nombre: 'Test SA' }),
    editarBranch: async (token, cliente_id, entrega) => {
      editarBranchCalled = true;
      editarBranchArgs = { token, cliente_id, entrega };
      return { ok: true };
    },
    getToken: async () => 'jwt-token',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = {
    tax_id: 'TST010101ABC',
    CustName: 'Test SA de CV',
    entrega: {
      br_name: 'almacen central',
      addr_street: 'insurgentes',
      addr_exterior: '1',
      addr_colony: 'del valle',
      addr_city: 'cdmx',
      addr_state: 'cdmx',
      addr_zip: '03100',
      phone: '+525500000000',
      email: 'almacen@test.com',
    },
  };

  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok, 'debe retornar ok: true');
  assert.equal(result.cliente_id, 77);
  assert.ok(editarBranchCalled, 'debe haber llamado editarBranch');
  assert.equal(editarBranchArgs.token, 'jwt-token');
  assert.equal(editarBranchArgs.cliente_id, 77);
  assert.equal(editarBranchArgs.entrega.br_name, 'almacen central');
});

test('postCrearClienteHandler: NO llama editarBranch si no hay entrega', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let editarBranchCalled = false;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 88, nombre: 'Otro SA' }),
    editarBranch: async () => { editarBranchCalled = true; return { ok: true }; },
    getToken: async () => 'jwt-token',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = { tax_id: 'OTR010101XYZ', CustName: 'Otro SA de CV' };

  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok);
  assert.ok(!editarBranchCalled, 'NO debe llamar editarBranch si no hay entrega');
});

// ─── Iteracion 3: getConfigPorPais ───────────────────────────────────────────

test('getConfigPorPais: MX retorna MXN, area 1, no extranjero, branchConfig vacio', (t) => {
  const { getConfigPorPais } = require('../server-helpers.js');
  const config = getConfigPorPais('MX');
  assert.equal(config.curr_code, 'MXN');
  assert.equal(config.area, '1');
  assert.equal(config.esExtranjero, false);
  assert.deepEqual(config.branchConfig, {});
});

test('getConfigPorPais: US retorna USD, area 5, esExtranjero, branchConfig con cuentas exportacion', (t) => {
  const { getConfigPorPais } = require('../server-helpers.js');
  const config = getConfigPorPais('US');
  assert.equal(config.curr_code, 'USD');
  assert.equal(config.area, '5');
  assert.equal(config.esExtranjero, true);
  assert.equal(config.branchConfig.tax_group_id, '2');
  assert.equal(config.branchConfig.sales_account, '401-07-000');
  assert.equal(config.branchConfig.receivables_account, '105-02-001');
  assert.equal(config.branchConfig.payment_discount_account, '401-07-000');
});

test('getConfigPorPais: CA retorna USD, area 7, esExtranjero, branchConfig con cuentas exportacion', (t) => {
  const { getConfigPorPais } = require('../server-helpers.js');
  const config = getConfigPorPais('CA');
  assert.equal(config.curr_code, 'USD');
  assert.equal(config.area, '7');
  assert.equal(config.esExtranjero, true);
  assert.equal(config.branchConfig.tax_group_id, '2');
  assert.equal(config.branchConfig.sales_account, '401-07-000');
});

test('getConfigPorPais: otro pais retorna USD, area 6, esExtranjero, branchConfig con cuentas exportacion', (t) => {
  const { getConfigPorPais } = require('../server-helpers.js');
  const config = getConfigPorPais('DE');
  assert.equal(config.curr_code, 'USD');
  assert.equal(config.area, '6');
  assert.equal(config.esExtranjero, true);
  assert.equal(config.branchConfig.tax_group_id, '2');
});

// ─── (Iteracion 3 existente) postCrearClienteHandler: error en editarBranch no falla el response ───

test('postCrearClienteHandler: error en editarBranch no falla el response', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 99, nombre: 'Falla SA' }),
    editarBranch: async () => { throw new Error('timeout de red'); },
    getToken: async () => 'jwt-token',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = {
    tax_id: 'FLL010101ZZZ',
    CustName: 'Falla SA de CV',
    entrega: { br_name: 'sucursal', addr_street: 'calle 1' },
  };

  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok, 'debe retornar ok: true aunque editarBranch falle');
  assert.equal(result.cliente_id, 99);
});
