'use strict';

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

module.exports = { toTitleCase, editarBranch };
