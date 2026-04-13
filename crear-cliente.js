const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── Config (credenciales — nunca hardcodear aquí) ────────────────────────────
const CONFIG_PATH = 'C:/Users/chave/OneDrive/Documents/_Claude/.claude/operam-config.json';
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ─── Configuración ────────────────────────────────────────────────────────────
const DRY_RUN = true; // false para ejecutar el POST real

// ─── Datos del cliente (extraídos de la Constancia de Situación Fiscal) ───────
// nombre_s        → campo "Nombre (s):"        de la CSF
// primer_apellido → campo "Primer Apellido:"   de la CSF
// segundo_apellido→ campo "Segundo Apellido:"  de la CSF (para CustName completo)
const CLIENTE = {
  nombre_s:          'ANTONIO',
  primer_apellido:   'ARANDA',
  segundo_apellido:  'LAVALLE',
  tax_id:            'AALA880303RW5',    // RFC
  idcif:             '17070269875',      // SAT IdCIF
  street:            'CANAL',
  street_number:     '21',
  suite_number:      '',
  district:          'CENTRO',
  postal_code:       '37700',
  city:              'SAN MIGUEL DE ALLENDE',
  state:             'GUANAJUATO',
  country:           'México',
  phone:             '',
  phone2:            '',
  fax:               '',                 // campo "Celular" en Operam
  email:             '',
  cfdi_regimen_fiscal: '612',            // 612 = Personas Físicas con Act. Empresariales
  actividades: [
    'Restaurantes-bar con servicio de meseros (35%)',
    'Restaurantes de comida para llevar (30%)',
    'Servicios de preparación de alimentos para ocasiones especiales (30%)',
    'Socio o accionista (5%)',
  ],
  csf_fecha: '2026-01-02',              // fecha de emisión de la CSF
};

// ─── Defaults de Operam para todos los clientes nuevos ────────────────────────
const DEFAULTS = {
  cfdi_form_payment: '99',   // 99 - Por definir
  timbrado_uso_cfdi: 'S01',  // S01 - Sin efectos fiscales
  payment_terms:     '9',    // Anticipo 50%
  location:          '40',   // PT
  area:              '1',    // 10 México
  dimension1_id:     '1',    // D1 - TALLER CASINO DE LA SELVA
  dimension2_id:     '5',    // D2 - CORPORATIVO
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

// ─── Login ────────────────────────────────────────────────────────────────────
async function login(page) {
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded' });

  const esLoginPage = await page.$('[name="user_name_entry_field"]');
  if (!esLoginPage) {
    console.log('  Sesión activa, no se requiere login.');
    return;
  }

  console.log('  Iniciando sesión...');
  await page.fill('[name="user_name_entry_field"]', CONFIG.user);
  await page.fill('[name="password"]', CONFIG.password);
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForURL(url => !url.href.includes('login') && !url.href.includes('access'), { timeout: 15000 });
  console.log('  Login exitoso.');
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

  const browser = await chromium.launch({ headless: false }); // headless: true para correr en background
  const context = await browser.newContext();
  const page    = await context.newPage();

  await login(page);

  const FORM_URL = `${CONFIG.url}/sales/manage/customers.php?NewDebtor=1`;
  const POST_URL = `${CONFIG.url}/sales/manage/customers.php`;

  const result = await page.evaluate(
    async ({ formUrl, postUrl, cliente, defaults, custName, custRef, notes, dryRun }) => {
      const r    = await fetch(formUrl, { credentials: 'include' });
      const html = await r.text();

      const parser = new DOMParser();
      const doc    = parser.parseFromString(html, 'text/html');
      const form   = [...doc.querySelectorAll('form')]
        .find(f => f.querySelector('[name="CustName"]'));
      if (!form) return { error: 'No se encontró el formulario de alta (¿sesión expirada?)' };

      const fd = new FormData(form);

      fd.set('CustName',     custName);
      fd.set('cust_ref',     custRef);
      fd.set('tax_id',       cliente.tax_id);
      fd.set('idcif',        cliente.idcif);
      fd.set('street',       cliente.street);
      fd.set('street_number',cliente.street_number);
      fd.set('suite_number', cliente.suite_number);
      fd.set('district',     cliente.district);
      fd.set('postal_code',  cliente.postal_code);
      fd.set('city',         cliente.city);
      fd.set('state',        cliente.state);
      fd.set('country',      cliente.country);
      fd.set('phone',        cliente.phone);
      fd.set('phone2',       cliente.phone2);
      fd.set('fax',          cliente.fax);
      fd.set('email',        cliente.email);
      fd.set('cfdi_regimen_fiscal', cliente.cfdi_regimen_fiscal);
      fd.set('notes',        notes);

      fd.set('cfdi_form_payment', defaults.cfdi_form_payment);
      fd.set('timbrado_uso_cfdi', defaults.timbrado_uso_cfdi);
      fd.set('payment_terms',     defaults.payment_terms);
      fd.set('location',          defaults.location);
      fd.set('area',              defaults.area);

      fd.delete('dimensiones_id[]');
      fd.append('dimensiones_id[]', defaults.dimension1_id);
      fd.append('dimensiones_id[]', defaults.dimension2_id);
      fd.set('dimension1_id', defaults.dimension1_id);
      fd.set('dimension2_id', defaults.dimension2_id);

      fd.set('process', 'Añadir Nuevo Cliente');

      if (dryRun) {
        const campos = {};
        for (const [k, v] of fd.entries()) campos[k] = v;
        return { modo: 'DRY RUN', campos };
      }

      const resp     = await fetch(postUrl, { method: 'POST', credentials: 'include', body: fd });
      const respHtml = await resp.text();
      const finalUrl = resp.url;

      const ajaxR    = await fetch(
        `${postUrl.split('/sales')[0]}/sales/inquiry/customers.ajax.php?inactive=false&term=${encodeURIComponent(cliente.tax_id)}`,
        { credentials: 'include' }
      );
      const ajaxData = await ajaxR.json();
      const encontrado = ajaxData.results?.find(x => x.rfc === cliente.tax_id);

      return {
        status:      resp.status,
        cliente_id:  encontrado?.id ?? null,
        rfc_en_resp: respHtml.includes(cliente.tax_id),
        duplicado:   respHtml.includes('duplicada'),
      };
    },
    { formUrl: FORM_URL, postUrl: POST_URL, cliente: CLIENTE, defaults: DEFAULTS,
      custName: CustName, custRef: cust_ref, notes, dryRun: DRY_RUN }
  );

  if (result.error) {
    console.error('ERROR:', result.error);
  } else if (DRY_RUN) {
    const mostrar = ['CustName','cust_ref','tax_id','idcif','street','street_number',
      'district','postal_code','city','state','country','cfdi_regimen_fiscal',
      'cfdi_form_payment','timbrado_uso_cfdi','payment_terms','location','area',
      'dimensiones_id[]','dimension1_id','dimension2_id','notes','_token'];
    console.log('Campos clave que se enviarían:');
    for (const k of mostrar) {
      if (result.campos[k] !== undefined) console.log(`  ${k}: ${result.campos[k]}`);
    }
    console.log('\nPara crear el cliente, cambia DRY_RUN = false y vuelve a correr.');
  } else {
    console.log('Resultado:');
    console.log('  Status HTTP: ', result.status);
    console.log('  Cliente ID:  ', result.cliente_id ?? '(no detectado)');
    console.log('  Duplicado:   ', result.duplicado ? 'SI — ya existía' : 'NO');
  }

  await browser.close();
})();
