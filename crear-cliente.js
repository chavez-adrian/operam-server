const fs = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH = 'C:/Users/chave/OneDrive/Documents/_Claude/.claude/operam-config.json';
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ─── Configuración ────────────────────────────────────────────────────────────
const DRY_RUN = true; // false para ejecutar el POST real

// ─── Datos del cliente (extraídos de la Constancia de Situación Fiscal) ───────
const CLIENTE = {
  nombre_s:          'ANTONIO',
  primer_apellido:   'ARANDA',
  segundo_apellido:  'LAVALLE',
  tax_id:            'AALA880303RW5',
  idcif:             '17070269875',
  street:            'CANAL',
  street_number:     '21',
  suite_number:      '',
  district:          'CENTRO',
  postal_code:       '37700',
  city:              'SAN MIGUEL DE ALLENDE',
  state:             'GUANAJUATO',
  country:           'México',
  phone:             '',
  email:             '',
  cfdi_regimen_fiscal: '612',
  actividades: [
    'Restaurantes-bar con servicio de meseros (35%)',
    'Restaurantes de comida para llevar (30%)',
    'Servicios de preparación de alimentos para ocasiones especiales (30%)',
    'Socio o accionista (5%)',
  ],
  csf_fecha: '2026-01-02',
};

// ─── Defaults ─────────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildNombres(c) {
  const completo = [c.nombre_s, c.primer_apellido, c.segundo_apellido]
    .filter(Boolean).join(' ');
  const toTitleCase = s => s.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  const corto = toTitleCase(`${c.nombre_s} ${c.primer_apellido}`);
  return { CustName: completo, cust_ref: corto };
}

function buildNotes(c) {
  const acts = c.actividades.map(a => `- ${a}`).join('\n');
  return `Actividades económicas (CSF ${c.csf_fecha}):\n${acts}`;
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

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const { CustName, cust_ref } = buildNombres(CLIENTE);
  const notes = buildNotes(CLIENTE);

  console.log(`\nModo: ${DRY_RUN ? 'DRY RUN (sin POST)' : 'REAL (creará el cliente)'}`);
  console.log(`Cliente:      ${CustName}`);
  console.log(`Nombre corto: ${cust_ref}`);
  console.log(`RFC:          ${CLIENTE.tax_id}`);
  console.log(`Notas:\n${notes}\n`);

  const body = {
    cust_name:           CustName,
    cust_ref:            cust_ref,
    tax_id:              CLIENTE.tax_id,
    idcif:               CLIENTE.idcif               || '',
    street:              CLIENTE.street               || '',
    street_number:       CLIENTE.street_number        || '',
    suite_number:        CLIENTE.suite_number         || '',
    district:            CLIENTE.district             || '',
    postal_code:         CLIENTE.postal_code          || '',
    city:                CLIENTE.city                 || '',
    state:               CLIENTE.state                || '',
    country:             CLIENTE.country              || 'México',
    phone:               CLIENTE.phone                || null,
    email:               CLIENTE.email                || null,
    cfdi_regimen_fiscal: CLIENTE.cfdi_regimen_fiscal  || '612',
    notes:               notes,
    cfdi_form_payment:   DEFAULTS.cfdi_form_payment,
    cfdi_method_payment: DEFAULTS.cfdi_method_payment,
    timbrado_uso_cfdi:   DEFAULTS.timbrado_uso_cfdi,
    payment_terms:       DEFAULTS.payment_terms,
    location:            DEFAULTS.location,
    area:                DEFAULTS.area,
    dimension_id:        DEFAULTS.dimension_id,
    dimension2_id:       DEFAULTS.dimension2_id,
    credit_limit:        DEFAULTS.credit_limit,
    discount:            DEFAULTS.discount,
    pymt_discount:       DEFAULTS.pymt_discount,
  };

  if (DRY_RUN) {
    console.log('Campos que se enviarían al POST:');
    for (const [k, v] of Object.entries(body)) {
      console.log(`  ${k}: ${v}`);
    }
    console.log('\nPara crear el cliente, cambia DRY_RUN = false y vuelve a correr.');
    return;
  }

  const token = await getToken();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Verificar duplicado
  const searchR = await fetch(
    `${CONFIG.url}/api/v3/sales/customers?tax_id=${encodeURIComponent(CLIENTE.tax_id)}`,
    { headers }
  );
  const searchData = await searchR.json();
  if (searchData.total > 0) {
    const existente = searchData.data[0];
    console.log(`Duplicado: ya existe "${existente.CustName}" (ID ${existente.customer_id})`);
    return;
  }

  // Crear
  const r = await fetch(`${CONFIG.url}/api/v3/sales/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await r.json();

  if (!data.result) {
    console.error('Error:', data.messages?.join(', ') || JSON.stringify(data));
    return;
  }

  console.log(`Cliente creado. ID: ${data.customer_id}`);
})();
