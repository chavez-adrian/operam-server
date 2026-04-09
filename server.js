const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');

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

// Credenciales desde variables de entorno (en Render: Environment > Add var)
const CONFIG = {
  url:      process.env.OPERAM_URL      || 'https://peltrenacional.operam.pro',
  user:     process.env.OPERAM_USER,
  password: process.env.OPERAM_PASSWORD,
};

const DEFAULTS = {
  cfdi_form_payment: '99',
  timbrado_uso_cfdi: 'S01',
  payment_terms:     '9',
  location:          '40',
  area:              '1',
  dimension1_id:     '1',
  dimension2_id:     '5',
};

// Mapa de texto de régimen SAT → código
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

async function login(page) {
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded' });
  const esLogin = await page.$('[name="user_name_entry_field"]');
  if (!esLogin) {
    console.log('[operam] Ya logueado, URL:', page.url());
    return;
  }
  await page.fill('[name="user_name_entry_field"]', CONFIG.user);
  await page.fill('[name="password"]', CONFIG.password);
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForURL(url => !url.href.includes('login') && !url.href.includes('access'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  console.log('[operam] Post-login URL:', page.url());
  const cookies = await page.context().cookies();
  console.log('[operam] Cookies:', cookies.map(c => c.name).join(', '));
}

async function crearClienteEnOperam(cliente) {
  const FORM_URL = `${CONFIG.url}/sales/manage/customers.php?NewDebtor=1`;
  const POST_URL = `${CONFIG.url}/sales/manage/customers.php`;
  const AJAX_URL = `${CONFIG.url}/sales/inquiry/customers.ajax.php`;

  const CustName = cliente.CustName || '';
  const cust_ref = cliente.cust_ref || '';
  const notes = `Actividades económicas (CSF ${cliente.csf_fecha}):\n` +
    (cliente.actividades || []).map(a => `- ${a}`).join('\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    console.log(`[operam] Iniciando creación RFC: ${cliente.tax_id}`);
    await login(page);
    console.log(`[operam] Login OK`);

    // 1. Verificar si el RFC ya existe — navegando con el browser (sesión completa)
    await page.goto(`${AJAX_URL}?inactive=false&term=${encodeURIComponent(cliente.tax_id)}`, { waitUntil: 'domcontentloaded' });
    const ajaxText1 = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
    console.log(`[operam] AJAX body: ${ajaxText1.slice(0, 300)}`);

    let ajaxData1;
    try { ajaxData1 = JSON.parse(ajaxText1); }
    catch(e) { return { error: `Respuesta AJAX no válida: ${ajaxText1.slice(0, 150)}` }; }

    const existente = ajaxData1.results?.find(x => x.rfc === cliente.tax_id);
    if (existente) return { duplicado: true, cliente_id: existente.id, nombre: existente.text };

    // 2. Navegar al formulario y extraer campos existentes vía DOM
    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded' });
    const formFields = await page.evaluate(() => {
      const form = [...document.querySelectorAll('form')].find(f => f.querySelector('[name="CustName"]'));
      if (!form) return null;
      const data = {};
      for (const el of form.elements) {
        if (el.name && el.type !== 'submit') data[el.name] = el.value;
      }
      return data;
    });
    if (!formFields) return { error: 'Formulario no encontrado (¿sesión expirada?)' };
    console.log(`[operam] Formulario cargado OK`);

    // 3. POST con context.request (multipart)
    const multipart = {
      ...formFields,
      CustName,
      cust_ref,
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
      phone:               cliente.phone                || '',
      email:               cliente.email                || '',
      salesman:            cliente.salesman             || '',
      segmento_id:         cliente.segmento_id          || '',
      cfdi_regimen_fiscal: cliente.cfdi_regimen_fiscal  || '612',
      notes,
      cfdi_form_payment:   DEFAULTS.cfdi_form_payment,
      timbrado_uso_cfdi:   cliente.timbrado_uso_cfdi    || DEFAULTS.timbrado_uso_cfdi,
      payment_terms:       DEFAULTS.payment_terms,
      location:            DEFAULTS.location,
      area:                DEFAULTS.area,
      dimension1_id:       DEFAULTS.dimension1_id,
      dimension2_id:       DEFAULTS.dimension2_id,
      process:             'Añadir Nuevo Cliente',
    };
    // dimensiones_id[] requiere array
    delete multipart['dimensiones_id[]'];
    multipart['dimensiones_id[]'] = [DEFAULTS.dimension1_id, DEFAULTS.dimension2_id];

    const postResp = await context.request.post(POST_URL, { multipart });
    console.log(`[operam] POST status: ${postResp.status()}`);

    // 4. Verificar creación
    await new Promise(r => setTimeout(r, 2000));
    await page.goto(`${AJAX_URL}?inactive=false&term=${encodeURIComponent(cliente.tax_id)}`, { waitUntil: 'domcontentloaded' });
    const ajaxText2 = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
    let ajaxData2;
    try { ajaxData2 = JSON.parse(ajaxText2); } catch(e) { ajaxData2 = {}; }
    const creado = ajaxData2.results?.find(x => x.rfc === cliente.tax_id);

    if (!creado) return { warn: true, mensaje: 'El cliente puede haberse creado. Verifica en Operam buscando el RFC.' };
    return { duplicado: false, cliente_id: creado.id, nombre: creado.text };

  } finally {
    await browser.close();
  }
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
