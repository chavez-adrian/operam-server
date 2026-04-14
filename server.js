const express = require('express');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const CONFIG = {
  url:      process.env.OPERAM_URL      || 'https://peltrenacional.operam.pro',
  company:  process.env.OPERAM_COMPANY  || '346',
  user:     process.env.OPERAM_USER,
  password: process.env.OPERAM_PASSWORD,
};

const DEFAULTS = {
  cfdi_form_payment:   '99',
  cfdi_method_payment: 'PPD',
  timbrado_uso_cfdi:   'S01',
  payment_terms:       9,
  location:            '40',
  area:                1,
  dimension_id:        1,
  dimension2_id:       5,
  credit_limit:        0,
  discount:            0,
  pymt_discount:       0,
};

const REGIMENES = {
  'General de Ley Personas Morales':                                     '601',
  'Personas Morales con Fines no Lucrativos':                            '603',
  'Sueldos y Salarios e Ingresos Asimilados a Salarios':                 '605',
  'Arrendamiento':                                                        '606',
  'Enajenación o Adquisición de Bienes':                                 '607',
  'Demás ingresos':                                                       '608',
  'Residentes en el Extranjero sin Establecimiento Permanente':           '610',
  'Ingresos por Dividendos':                                              '611',
  'Personas Físicas con Actividades Empresariales y Profesionales':       '612',
  'Ingresos por intereses':                                               '614',
  'Sin obligaciones fiscales':                                            '616',
  'Incorporación Fiscal':                                                 '621',
  'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras':             '622',
  'Plataformas Tecnológicas':                                             '625',
  'Régimen Simplificado de Confianza':                                    '626',
};

const PRIORIDAD = ['601','603','612','621','626','606','622','607','608','605','614','611','610','616','625'];

function detectarRegimen(textoRegimen) {
  const encontrados = [];
  for (const [clave, codigo] of Object.entries(REGIMENES)) {
    if (textoRegimen.includes(clave)) encontrados.push(codigo);
  }
  if (encontrados.length === 0) return '612';
  encontrados.sort((a, b) => PRIORIDAD.indexOf(a) - PRIORIDAD.indexOf(b));
  return encontrados[0];
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

// ─── API v3 ───────────────────────────────────────────────────────────────────

async function getToken() {
  const r = await fetch(`${CONFIG.url}/api/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: CONFIG.company, user: CONFIG.user, pass: CONFIG.password }),
  });
  const data = await r.json();
  if (!data.token) throw new Error(`Login fallido: ${JSON.stringify(data)}`);
  return data.token;
}

async function crearClienteEnOperam(cliente) {
  const CustName = cliente.CustName || '';
  const cust_ref = cliente.cust_ref || toTitleCase(CustName);
  const notes = `Actividades económicas (CSF ${cliente.csf_fecha}):\n` +
    (cliente.actividades || []).map(a => `- ${a}`).join('\n');

  console.log(`[operam] Iniciando creación RFC: ${cliente.tax_id}`);

  const token = await getToken();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Verificar duplicado
  const searchR = await fetch(
    `${CONFIG.url}/api/v3/sales/customers?tax_id=${encodeURIComponent(cliente.tax_id)}`,
    { headers }
  );
  const searchData = await searchR.json();
  if (searchData.total > 0) {
    const existente = searchData.data[0];
    console.log(`[operam] Duplicado: ${existente.CustName} (ID ${existente.customer_id})`);
    return { duplicado: true, cliente_id: existente.customer_id, nombre: existente.CustName };
  }

  // Crear cliente
  const body = {
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
    country:             cliente.country              || 'México',
    phone:               cliente.phone                || null,
    email:               cliente.email                || null,
    salesman:            cliente.salesman             ? Number(cliente.salesman) : null,
    segmento_id:         cliente.segmento_id          ? Number(cliente.segmento_id) : null,
    cfdi_regimen_fiscal: cliente.cfdi_regimen_fiscal  || '612',
    timbrado_uso_cfdi:   cliente.timbrado_uso_cfdi    || DEFAULTS.timbrado_uso_cfdi,
    notes:               notes,
    cfdi_form_payment:   DEFAULTS.cfdi_form_payment,
    cfdi_method_payment: DEFAULTS.cfdi_method_payment,
    payment_terms:       DEFAULTS.payment_terms,
    location:            DEFAULTS.location,
    area:                DEFAULTS.area,
    dimension_id:        DEFAULTS.dimension_id,
    dimension2_id:       DEFAULTS.dimension2_id,
    credit_limit:        DEFAULTS.credit_limit,
    discount:            DEFAULTS.discount,
    pymt_discount:       DEFAULTS.pymt_discount,
  };

  const r = await fetch(`${CONFIG.url}/api/v3/sales/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await r.json();

  if (!data.result) {
    console.error(`[operam] Error al crear cliente:`, data);
    return { error: data.messages?.join(', ') || 'Error desconocido', raw: data };
  }

  console.log(`[operam] Cliente creado: ID ${data.customer_id}`);
  return { duplicado: false, cliente_id: data.customer_id, nombre: CustName };
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

app.post('/api/crear-cliente', async (req, res) => {
  const cliente = req.body;

  if (!cliente?.tax_id) {
    return res.status(400).json({ error: 'Falta el RFC (tax_id)' });
  }
  if (!CONFIG.user || !CONFIG.password) {
    return res.status(500).json({ error: 'Credenciales de Operam no configuradas en el servidor' });
  }

  try {
    const resultado = await crearClienteEnOperam(cliente);
    if (resultado.error) return res.status(500).json(resultado);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
