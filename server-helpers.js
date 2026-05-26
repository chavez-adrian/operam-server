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

async function editarBranch(token, customer_id, entrega, baseUrl) {
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

async function postCrearClienteHandler(cliente, deps) {
  const { crearClienteEnOperam, editarBranch: _editarBranch, getToken, logCliente, subirCsfDropbox } = deps;

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
      await _editarBranch(token, resultado.cliente_id, cliente.entrega);
    } catch (err) {
      console.error('[editarBranch] Error:', err.message);
    }
  }

  return { ok: true, ...resultado };
}

module.exports = { toTitleCase, editarBranch, postCrearClienteHandler, getConfigPorPais };
