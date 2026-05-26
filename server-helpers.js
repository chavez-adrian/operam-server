'use strict';

const CONFIG_BRANCH_EXTRANJERO = {
  tax_group_id: '2',
  sales_account: '401-07-000',
  receivables_account: '105-02-001',
  payment_discount_account: '401-07-000',
};

const AREA_POR_PAIS = { MX: '1', US: '5', CA: '7' };

function getConfigPorPais(country) {
  if (!country || country === 'MX') {
    return { curr_code: 'MXN', area: '1', esExtranjero: false, branchConfig: {} };
  }
  const area = AREA_POR_PAIS[country] || '6';
  return { curr_code: 'USD', area, esExtranjero: true, branchConfig: CONFIG_BRANCH_EXTRANJERO };
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

const TEXT_FIELDS = ['br_name', 'addr_street', 'addr_interior', 'addr_colony', 'addr_city', 'addr_state'];

function buildClienteBody(cliente, defaults) {
  const CustName = cliente.CustName || '';
  const cust_ref = cliente.cust_ref || toTitleCase(CustName);

  const taxIdPrefix = cliente.invoice_tax_id ? `Tax ID: ${cliente.invoice_tax_id}\n` : '';
  const notes = `${taxIdPrefix}Actividades economicas (CSF ${cliente.csf_fecha}):\n` +
    (cliente.actividades || []).map(a => `- ${a}`).join('\n');

  return {
    cust_name:           CustName,
    cust_ref:            cust_ref,
    tax_id:              cliente.tax_id,
    idcif:               cliente.idcif               || '',
    street:              cliente.street               || '',
    street_number:       cliente.street_number        || '',
    suite_number:        cliente.suite_number         || '',
    district:            cliente.district             || '',
    postal_code:         cliente.postal_code          || '',
    city:                cliente.city                 || '',
    state:               cliente.state                || '',
    country:             cliente.country              || 'Mexico',
    phone:               cliente.phone                || null,
    email:               cliente.email                || null,
    salesman:            cliente.salesman             ? Number(cliente.salesman) : null,
    segmento_id:         cliente.segmento_id          ? Number(cliente.segmento_id) : null,
    cfdi_regimen_fiscal: cliente.cfdi_regimen_fiscal  || defaults.cfdi_regimen_fiscal || '612',
    timbrado_uso_cfdi:   cliente.timbrado_uso_cfdi    || defaults.timbrado_uso_cfdi   || 'S01',
    notes,
    cfdi_form_payment:   defaults.cfdi_form_payment   || '99',
    cfdi_method_payment: defaults.cfdi_method_payment || 'PPD',
    payment_terms:       defaults.payment_terms       || 9,
    location:            defaults.location            || '40',
    area:                cliente.area_pais            || defaults.area || 1,
    curr_code:           cliente.curr_code            || 'MXN',
    dimension_id:        defaults.dimension_id        || 1,
    dimension2_id:       defaults.dimension2_id       || 5,
    credit_limit:        defaults.credit_limit        || 0,
    discount:            defaults.discount            || 0,
    pymt_discount:       defaults.pymt_discount       || 0,
  };
}

async function editarBranch(token, customer_id, entrega, baseUrl, branchConfig) {
  const url = baseUrl || process.env.OPERAM_URL || 'https://peltrenacional.operam.pro';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const getR = await fetch(`${url}/api/v3/sales/customers/${customer_id}`, { method: 'GET', headers });
  const getData = await getR.json();
  const branches = getData.data && getData.data[0] && getData.data[0].branches;
  if (!branches || branches.length === 0) {
    throw new Error(`No se encontro branch para el cliente ${customer_id}`);
  }
  const branch_code = branches[0].branch_code;

  const body = { customer_id };
  for (const [k, v] of Object.entries(entrega)) {
    if (typeof v === 'string' && TEXT_FIELDS.includes(k)) {
      body[k] = toTitleCase(v);
    } else {
      body[k] = v;
    }
  }
  if (branchConfig && Object.keys(branchConfig).length > 0) {
    Object.assign(body, branchConfig);
  }

  const putR = await fetch(`${url}/api/v3/sales/branches/${branch_code}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const putData = await putR.json();
  if (!putData.result) {
    throw new Error(`editarBranch fallo: ${JSON.stringify(putData)}`);
  }

  return { ok: true };
}

async function agregarContactoFactura(token, customer_id, invoice_email, baseUrl) {
  const url = baseUrl || process.env.OPERAM_URL || 'https://peltrenacional.operam.pro';
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const getR = await fetch(`${url}/api/v3/sales/customers/${customer_id}`, { method: 'GET', headers });
  const getData = await getR.json();
  const customer = getData.data && getData.data[0];
  const contacts = (customer && customer.contacts) || [];

  const yaExiste = contacts.some(c => c.name === 'Facturas' && c.action === 'invoice');
  if (yaExiste) return { ok: true, skipped: true };

  const nuevoContacto = {
    action: 'invoice',
    ref: 'facturacion',
    name: 'Facturas',
    name2: '',
    email: invoice_email,
    phone: '',
    phone2: '',
    fax: '',
  };

  await fetch(`${url}/api/v3/sales/customers/${customer_id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ contacts: [...contacts, nuevoContacto] }),
  });

  return { ok: true };
}

async function postCrearClienteHandler(cliente, deps) {
  const { crearClienteEnOperam, editarBranch: _editarBranch, agregarContactoFactura: _agregarContactoFactura, getToken, logCliente, subirCsfDropbox } = deps;

  const fuente = cliente.fuente || (cliente.pdf_base64 ? 'operam-csf' : 'operam-manual');

  const resultado = await crearClienteEnOperam(cliente);

  if (resultado.error) {
    logCliente(cliente.tax_id, cliente.CustName, 'error', null, fuente, null, resultado.error);
    return resultado;
  }

  if (!resultado.duplicado && cliente.pdf_base64) {
    subirCsfDropbox(cliente.pdf_base64, cliente.tax_id, cliente.CustName)
      .then(() => logCliente(cliente.tax_id, cliente.CustName, 'creado', resultado.cliente_id, fuente, true, null))
      .catch(err => {
        console.error('[dropbox] Error:', err.message);
        logCliente(cliente.tax_id, cliente.CustName, 'creado', resultado.cliente_id, fuente, false, err.message);
      });
  } else {
    logCliente(cliente.tax_id, cliente.CustName, resultado.duplicado ? 'duplicado' : 'creado', resultado.cliente_id, fuente, null, null);
  }

  if (!resultado.duplicado && cliente.entrega) {
    try {
      const token = await getToken();
      const { branchConfig } = getConfigPorPais(cliente.country);
      await _editarBranch(token, resultado.cliente_id, cliente.entrega, null, branchConfig);
    } catch (err) {
      console.error('[editarBranch] Error:', err.message);
    }
  }

  if (!resultado.duplicado && cliente.invoice_email) {
    try {
      const token = await getToken();
      await _agregarContactoFactura(token, resultado.cliente_id, cliente.invoice_email);
    } catch (err) {
      console.error('[agregarContactoFactura] Error:', err.message);
    }
  }

  return { ok: true, ...resultado };
}

module.exports = { toTitleCase, editarBranch, agregarContactoFactura, postCrearClienteHandler, getConfigPorPais, buildClienteBody };
