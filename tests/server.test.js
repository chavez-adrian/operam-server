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

// ─── Iteracion 2: editarBranch con branchConfig + postCrearClienteHandler pais ─

test('editarBranch: mezcla branchConfig en el PUT body', async (t) => {
  const { editarBranch } = require('../server-helpers.js');

  const fetchCalls = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (url.includes('/api/v3/sales/customers/')) {
      return { ok: true, json: async () => ({ data: [{ branches: [{ branch_code: 'BR-EXT' }] }] }) };
    }
    if (url.includes('/api/v3/sales/branches/BR-EXT')) {
      return { ok: true, json: async () => ({ result: true }) };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };

  const branchConfig = {
    tax_group_id: '2',
    sales_account: '401-07-000',
    receivables_account: '105-02-001',
    payment_discount_account: '401-07-000',
  };

  await editarBranch('tok', 55, { br_name: 'acme corp', email: 'a@b.com' }, null, branchConfig);

  const putCall = fetchCalls.find(c => c.url.includes('/api/v3/sales/branches/BR-EXT'));
  assert.ok(putCall, 'debe hacer PUT al branch');
  const body = JSON.parse(putCall.opts.body);
  assert.equal(body.tax_group_id, '2', 'tax_group_id debe venir del branchConfig');
  assert.equal(body.sales_account, '401-07-000');
  assert.equal(body.receivables_account, '105-02-001');
  assert.equal(body.br_name, 'Acme Corp', 'br_name aun debe estar en Title Case');
});

test('editarBranch: sin branchConfig funciona igual que antes', async (t) => {
  const { editarBranch } = require('../server-helpers.js');

  const fetchCalls = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (url.includes('/api/v3/sales/customers/')) {
      return { ok: true, json: async () => ({ data: [{ branches: [{ branch_code: 'BR-MX' }] }] }) };
    }
    if (url.includes('/api/v3/sales/branches/BR-MX')) {
      return { ok: true, json: async () => ({ result: true }) };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };

  const result = await editarBranch('tok', 10, { br_name: 'tienda local' });
  assert.deepEqual(result, { ok: true });

  const putCall = fetchCalls.find(c => c.url.includes('/api/v3/sales/branches/BR-MX'));
  const body = JSON.parse(putCall.opts.body);
  assert.equal(body.tax_group_id, undefined, 'no debe haber tax_group_id sin branchConfig');
  assert.equal(body.br_name, 'Tienda Local');
});

test('postCrearClienteHandler: pasa branchConfig a editarBranch para cliente US', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let capturedBranchConfig;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 200, nombre: 'US Corp' }),
    editarBranch: async (token, cliente_id, entrega, baseUrl, branchConfig) => {
      capturedBranchConfig = branchConfig;
      return { ok: true };
    },
    getToken: async () => 'jwt-token',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = {
    tax_id: 'XEXX010101000',
    CustName: 'US Corp LLC',
    country: 'US',
    entrega: { br_name: 'warehouse', addr_street: 'main st' },
  };

  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok);
  assert.equal(capturedBranchConfig.tax_group_id, '2');
  assert.equal(capturedBranchConfig.sales_account, '401-07-000');
  assert.equal(capturedBranchConfig.receivables_account, '105-02-001');
});

test('postCrearClienteHandler: pasa branchConfig vacio para cliente MX', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let capturedBranchConfig;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 201, nombre: 'MX SA' }),
    editarBranch: async (token, cliente_id, entrega, baseUrl, branchConfig) => {
      capturedBranchConfig = branchConfig;
      return { ok: true };
    },
    getToken: async () => 'jwt-token',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = {
    tax_id: 'MXS010101ABC',
    CustName: 'MX SA de CV',
    country: 'MX',
    entrega: { br_name: 'sucursal mx' },
  };

  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok);
  assert.deepEqual(capturedBranchConfig, {}, 'branchConfig debe ser vacio para MX');
});

// ─── Iteracion 3: buildClienteBody ───────────────────────────────────────────

test('buildClienteBody: usa curr_code y area_pais del cliente cuando vienen', (t) => {
  const { buildClienteBody } = require('../server-helpers.js');
  const cliente = {
    CustName: 'Acme LLC',
    tax_id: 'XEXX010101000',
    curr_code: 'USD',
    area_pais: '5',
    cfdi_regimen_fiscal: '610',
    csf_fecha: '2026-01-01',
    actividades: [],
  };
  const body = buildClienteBody(cliente, {});
  assert.equal(body.curr_code, 'USD');
  assert.equal(body.area, '5');
  assert.equal(body.cfdi_regimen_fiscal, '610');
});

test('buildClienteBody: usa defaults MXN y area 1 cuando no vienen', (t) => {
  const { buildClienteBody } = require('../server-helpers.js');
  const cliente = {
    CustName: 'Nacional SA',
    tax_id: 'NAC010101ABC',
    csf_fecha: '2026-01-01',
    actividades: [],
  };
  const body = buildClienteBody(cliente, { area: 1, cfdi_regimen_fiscal: '612' });
  assert.equal(body.curr_code, 'MXN');
  assert.equal(body.area, 1);
  assert.equal(body.cfdi_regimen_fiscal, '612');
});

test('buildClienteBody: prepend Tax ID en notes cuando viene invoice_tax_id', (t) => {
  const { buildClienteBody } = require('../server-helpers.js');
  const cliente = {
    CustName: 'US Corp',
    tax_id: 'XEXX010101000',
    invoice_tax_id: 'EIN-12-3456789',
    curr_code: 'USD',
    area_pais: '5',
    csf_fecha: '2026-01-01',
    actividades: ['Comercio exterior'],
  };
  const body = buildClienteBody(cliente, { area: 1, cfdi_regimen_fiscal: '612' });
  assert.ok(body.notes.startsWith('Tax ID: EIN-12-3456789\n'), 'notes debe empezar con Tax ID');
  assert.ok(body.notes.includes('Actividades economicas'), 'notes debe incluir actividades');
});

test('buildClienteBody: sin invoice_tax_id, notes empieza con Actividades', (t) => {
  const { buildClienteBody } = require('../server-helpers.js');
  const cliente = {
    CustName: 'MX SA',
    tax_id: 'MXS010101ABC',
    csf_fecha: '2026-01-01',
    actividades: ['Manufactura'],
  };
  const body = buildClienteBody(cliente, { area: 1, cfdi_regimen_fiscal: '612' });
  assert.ok(!body.notes.startsWith('Tax ID'), 'notes no debe tener Tax ID');
  assert.ok(body.notes.includes('Actividades'), 'notes debe incluir actividades');
});

// ─── Iteracion 4: csf-upload.html tiene selectores de pais y tax_id externo ──

test('csf-upload.html: existe select#f_pais con opciones MX, US, CA, other', (t) => {
  const fs = require('fs');
  const html = fs.readFileSync('C:\\Users\\chave\\OneDrive\\Documents\\_Claude\\operam\\csf-upload.html', 'utf8');
  assert.ok(html.includes('id="f_pais"'), 'debe existir select#f_pais');
  assert.ok(html.includes('value="MX"'), 'debe tener opcion MX');
  assert.ok(html.includes('value="US"'), 'debe tener opcion US');
  assert.ok(html.includes('value="CA"'), 'debe tener opcion CA');
});

test('csf-upload.html: existe input#f_tax_id_ext para Tax ID extranjero', (t) => {
  const fs = require('fs');
  const html = fs.readFileSync('C:\\Users\\chave\\OneDrive\\Documents\\_Claude\\operam\\csf-upload.html', 'utf8');
  assert.ok(html.includes('id="f_tax_id_ext"'), 'debe existir input#f_tax_id_ext');
});

test('csf-upload.html: leerForm incluye country, curr_code, area_pais en el payload', (t) => {
  const fs = require('fs');
  const html = fs.readFileSync('C:\\Users\\chave\\OneDrive\\Documents\\_Claude\\operam\\csf-upload.html', 'utf8');
  assert.ok(html.includes('curr_code'), 'leerForm debe incluir curr_code');
  assert.ok(html.includes('area_pais'), 'leerForm debe incluir area_pais');
  assert.ok(html.includes('invoice_tax_id'), 'leerForm debe incluir invoice_tax_id');
});

test('csf-upload.html: event listener en f_pais pone RFC XEXX010101000 para extranjero', (t) => {
  const fs = require('fs');
  const html = fs.readFileSync('C:\\Users\\chave\\OneDrive\\Documents\\_Claude\\operam\\csf-upload.html', 'utf8');
  assert.ok(html.includes('XEXX010101000'), 'debe usar RFC XEXX010101000 para extranjeros');
  assert.ok(html.includes('f_pais'), 'debe referenciar f_pais en el event listener');
});

// --- Iteracion 6: postCrearClienteHandler llama agregarContactoFactura -----------

test('postCrearClienteHandler: llama agregarContactoFactura cuando invoice_email y no duplicado', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let agregarContactoFacturaCalled = false;
  let agregarArgs = null;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 55, nombre: 'Test SA' }),
    editarBranch: async () => ({ ok: true }),
    agregarContactoFactura: async (token, cliente_id, invoice_email) => {
      agregarContactoFacturaCalled = true;
      agregarArgs = { token, cliente_id, invoice_email };
      return { ok: true };
    },
    getToken: async () => 'jwt-tok',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = {
    tax_id: 'TST010101ABC',
    CustName: 'Test SA de CV',
    invoice_email: 'facturas@test.com',
  };

  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok);
  assert.ok(agregarContactoFacturaCalled, 'debe llamar agregarContactoFactura');
  assert.equal(agregarArgs.token, 'jwt-tok');
  assert.equal(agregarArgs.cliente_id, 55);
  assert.equal(agregarArgs.invoice_email, 'facturas@test.com');
});

test('postCrearClienteHandler: NO llama agregarContactoFactura si cliente es duplicado', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let called = false;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: true, cliente_id: 55, nombre: 'Test SA' }),
    editarBranch: async () => ({ ok: true }),
    agregarContactoFactura: async () => { called = true; return { ok: true }; },
    getToken: async () => 'jwt-tok',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = { tax_id: 'TST010101ABC', CustName: 'Test SA de CV', invoice_email: 'f@t.com' };
  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok);
  assert.ok(!called, 'NO debe llamar agregarContactoFactura si duplicado');
});

test('postCrearClienteHandler: NO llama agregarContactoFactura si invoice_email vacio', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let called = false;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 66, nombre: 'New SA' }),
    editarBranch: async () => ({ ok: true }),
    agregarContactoFactura: async () => { called = true; return { ok: true }; },
    getToken: async () => 'jwt-tok',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = { tax_id: 'NEW010101ABC', CustName: 'New SA de CV', invoice_email: '' };
  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok);
  assert.ok(!called, 'NO debe llamar agregarContactoFactura si invoice_email vacio');
});

test('postCrearClienteHandler: error en agregarContactoFactura no falla el response', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 77, nombre: 'Fail SA' }),
    editarBranch: async () => ({ ok: true }),
    agregarContactoFactura: async () => { throw new Error('network timeout'); },
    getToken: async () => 'jwt-tok',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = { tax_id: 'FAL010101ABC', CustName: 'Fail SA de CV', invoice_email: 'f@fail.com' };
  const result = await postCrearClienteHandler(body, deps);

  assert.ok(result.ok, 'debe retornar ok: true aunque agregarContactoFactura falle');
  assert.equal(result.cliente_id, 77);
});

// --- Iteracion 7: csf-upload.html campo f_invoice_email --------------------------

test('csf-upload.html: existe input#f_invoice_email en la card Contacto y vendedor', (t) => {
  const fs = require('fs');
  const html = fs.readFileSync('C:\\Users\\chave\\OneDrive\\Documents\\_Claude\\operam\\csf-upload.html', 'utf8');
  assert.ok(html.includes('id="f_invoice_email"'), 'debe existir input#f_invoice_email');
  assert.ok(html.includes('type="email"'), 'f_invoice_email debe ser tipo email');
});

test('csf-upload.html: leerForm incluye invoice_email en el payload', (t) => {
  const fs = require('fs');
  const html = fs.readFileSync('C:\\Users\\chave\\OneDrive\\Documents\\_Claude\\operam\\csf-upload.html', 'utf8');
  assert.ok(html.includes('invoice_email'), 'leerForm debe incluir invoice_email');
  assert.ok(html.includes('f_invoice_email'), 'leerForm debe leer f_invoice_email');
});

// --- Iteracion 8: edge cases adicionales -----------------------------------------

test('postCrearClienteHandler: NO llama agregarContactoFactura si invoice_email es undefined', async (t) => {
  const { postCrearClienteHandler } = require('../server-helpers.js');

  let called = false;

  const deps = {
    crearClienteEnOperam: async () => ({ duplicado: false, cliente_id: 88, nombre: 'SA' }),
    editarBranch: async () => ({ ok: true }),
    agregarContactoFactura: async () => { called = true; return { ok: true }; },
    getToken: async () => 'jwt-tok',
    logCliente: () => {},
    subirCsfDropbox: async () => {},
  };

  const body = { tax_id: 'UND010101ABC', CustName: 'Undef SA' };
  await postCrearClienteHandler(body, deps);

  assert.ok(!called, 'NO debe llamar agregarContactoFactura si invoice_email es undefined');
});

test('agregarContactoFactura: usa OPERAM_URL de process.env cuando no se pasa baseUrl', async (t) => {
  const { agregarContactoFactura } = require('../server-helpers.js');

  const originalUrl = process.env.OPERAM_URL;
  process.env.OPERAM_URL = 'https://env.operam.pro';

  const fetchCalls = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, method: opts.method });
    if (opts.method === 'GET') {
      return { ok: true, json: async () => ({ data: [{ cust_ref: 'TEST', contacts: [] }] }) };
    }
    return { ok: true, json: async () => ({ version: '3.26.20' }) };
  };

  await agregarContactoFactura('tok', 5, 'f@test.com');

  process.env.OPERAM_URL = originalUrl;

  const getCall = fetchCalls.find(c => c.method === 'GET');
  assert.ok(getCall.url.startsWith('https://env.operam.pro'), 'debe usar OPERAM_URL del env');
});

// --- Iteracion 5: agregarContactoFactura -----------------------------------------

test('agregarContactoFactura: hace GET de cliente y PUT con nuevo contacto Facturas', async (t) => {
  const { agregarContactoFactura } = require('../server-helpers.js');

  const TOKEN = 'test-tok';
  const CUSTOMER_ID = 10;
  const fetchCalls = [];

  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, method: opts.method, body: opts.body });
    if (opts.method === 'GET' && url.includes(`/api/v3/sales/customers/${CUSTOMER_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          data: [{ cust_ref: 'TEST SA', contacts: [] }]
        })
      };
    }
    if (opts.method === 'PUT' && url.includes(`/api/v3/sales/customers/${CUSTOMER_ID}`)) {
      return {
        ok: true,
        json: async () => ({ version: '3.26.20', cust_ref: 'TEST SA' })
      };
    }
    throw new Error(`fetch inesperado: ${url} ${opts.method}`);
  };

  const result = await agregarContactoFactura(TOKEN, CUSTOMER_ID, 'facturas@test.com', 'https://test.operam.pro');

  assert.deepEqual(result, { ok: true });

  const getCall = fetchCalls.find(c => c.method === 'GET');
  assert.ok(getCall, 'debe hacer GET al cliente');

  const putCall = fetchCalls.find(c => c.method === 'PUT');
  assert.ok(putCall, 'debe hacer PUT al cliente');

  const putBody = JSON.parse(putCall.body);
  assert.ok(Array.isArray(putBody.contacts), 'contacts debe ser array');
  assert.equal(putBody.contacts.length, 1, 'debe haber un contacto');
  assert.equal(putBody.contacts[0].name, 'Facturas');
  assert.equal(putBody.contacts[0].email, 'facturas@test.com');
  assert.equal(putBody.contacts[0].action, 'invoice');
  assert.equal(putBody.contacts[0].ref, 'facturacion');
});

test('agregarContactoFactura: conserva contactos existentes y agrega el nuevo', async (t) => {
  const { agregarContactoFactura } = require('../server-helpers.js');

  const existingContact = {
    id: '37', action: 'order', ref: 'Compras', name: 'Juan',
    name2: '', phone: '', phone2: '', fax: '', email: 'juan@test.com',
  };

  global.fetch = async (url, opts) => {
    if (opts.method === 'GET') {
      return { ok: true, json: async () => ({ data: [{ cust_ref: 'TEST', contacts: [existingContact] }] }) };
    }
    if (opts.method === 'PUT') {
      return { ok: true, json: async () => ({ version: '3.26.20', cust_ref: 'TEST' }) };
    }
    throw new Error(`fetch inesperado: ${url} ${opts.method}`);
  };

  let putBody;
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const r = await origFetch(url, opts);
    if (opts.method === 'PUT') putBody = JSON.parse(opts.body);
    return r;
  };

  await agregarContactoFactura('tok', 10, 'new@test.com', 'https://test.operam.pro');

  assert.equal(putBody.contacts.length, 2, 'debe haber 2 contactos (existente + nuevo)');
  assert.equal(putBody.contacts[0].ref, 'Compras', 'debe conservar el contacto existente');
  assert.equal(putBody.contacts[1].name, 'Facturas', 'debe agregar el contacto Facturas');
  assert.equal(putBody.contacts[1].email, 'new@test.com');
});

test('agregarContactoFactura: skip si ya existe contacto con name Facturas y action invoice', async (t) => {
  const { agregarContactoFactura } = require('../server-helpers.js');

  const existingFacturas = {
    id: '202', action: 'invoice', ref: 'facturacion', name: 'Facturas',
    name2: '', phone: '', phone2: '', fax: '', email: 'ya@existe.com',
  };
  let putCalled = false;

  global.fetch = async (url, opts) => {
    if (opts.method === 'GET') {
      return { ok: true, json: async () => ({ data: [{ cust_ref: 'TEST', contacts: [existingFacturas] }] }) };
    }
    if (opts.method === 'PUT') {
      putCalled = true;
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`fetch inesperado: ${url} ${opts.method}`);
  };

  const result = await agregarContactoFactura('tok', 10, 'otro@email.com', 'https://test.operam.pro');

  assert.deepEqual(result, { ok: true, skipped: true });
  assert.ok(!putCalled, 'NO debe hacer PUT si ya existe contacto Facturas');
});
