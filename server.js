const express = require('express');
const { chromium } = require('playwright');

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
  if (!esLogin) return;
  await page.fill('[name="user_name_entry_field"]', CONFIG.user);
  await page.fill('[name="password"]', CONFIG.password);
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForURL(url => !url.href.includes('login') && !url.href.includes('access'), { timeout: 15000 });
  console.log('[operam] Login OK, URL:', page.url());
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

    // 1. Verificar duplicados — navegar al AJAX endpoint directamente
    const ajaxCheckUrl = `${AJAX_URL}?inactive=false&term=${encodeURIComponent(cliente.tax_id)}`;
    const ajaxResp = await page.goto(ajaxCheckUrl, { waitUntil: 'domcontentloaded' });
    const ajaxText = await page.evaluate(() => document.body?.innerText || '');
    console.log(`[operam] AJAX check: ${ajaxText.slice(0, 200)}`);

    let ajaxData = { results: [] };
    if (ajaxText) {
      try { ajaxData = JSON.parse(ajaxText); } catch(e) { /* no JSON = no results */ }
    }
    const existente = ajaxData.results?.find(x => x.rfc === cliente.tax_id);
    if (existente) return { duplicado: true, cliente_id: existente.id, nombre: existente.text };

    // 2. Navegar al formulario de nuevo cliente
    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded' });
    const currentUrl = page.url();
    console.log(`[operam] Formulario URL: ${currentUrl}`);

    // Verificar que estamos en el formulario, no en login
    const hasCustName = await page.$('[name="CustName"]');
    if (!hasCustName) {
      const title = await page.title();
      const fields = await page.evaluate(() =>
        [...document.querySelectorAll('input[name],select[name]')].map(e => e.name).slice(0, 15)
      );
      return { error: 'Formulario no encontrado (sesión perdida)', diag: { title, url: currentUrl, fields } };
    }

    // 3. Llenar el formulario directamente en la página
    await page.fill('[name="CustName"]', CustName);
    await page.fill('[name="cust_ref"]', cust_ref);
    await page.fill('[name="tax_id"]', cliente.tax_id);
    await page.fill('[name="idcif"]', cliente.idcif || '');
    await page.fill('[name="street"]', cliente.street || '');
    await page.fill('[name="street_number"]', cliente.street_number || '');
    await page.fill('[name="suite_number"]', cliente.suite_number || '');
    await page.fill('[name="district"]', cliente.district || '');
    await page.fill('[name="postal_code"]', cliente.postal_code || '');
    await page.fill('[name="city"]', cliente.city || '');
    await page.fill('[name="state"]', cliente.state || '');
    await page.fill('[name="country"]', cliente.country || 'México');
    await page.fill('[name="phone"]', cliente.phone || '');
    await page.fill('[name="email"]', cliente.email || '');
    await page.fill('[name="notes"]', notes);

    // Selects y campos que pueden ser select o input
    const fillOrSelect = async (name, value) => {
      if (!value) return;
      const el = await page.$(`[name="${name}"]`);
      if (!el) return;
      const tag = await el.evaluate(e => e.tagName.toLowerCase());
      if (tag === 'select') {
        await page.selectOption(`[name="${name}"]`, value);
      } else {
        await page.fill(`[name="${name}"]`, value);
      }
    };

    await fillOrSelect('salesman', cliente.salesman || '');
    await fillOrSelect('segmento_id', cliente.segmento_id || '');
    await fillOrSelect('cfdi_regimen_fiscal', cliente.cfdi_regimen_fiscal || '612');
    await fillOrSelect('cfdi_form_payment', DEFAULTS.cfdi_form_payment);
    await fillOrSelect('timbrado_uso_cfdi', cliente.timbrado_uso_cfdi || DEFAULTS.timbrado_uso_cfdi);
    await fillOrSelect('payment_terms', DEFAULTS.payment_terms);
    await fillOrSelect('location', DEFAULTS.location);
    await fillOrSelect('area', DEFAULTS.area);
    await fillOrSelect('dimension1_id', DEFAULTS.dimension1_id);
    await fillOrSelect('dimension2_id', DEFAULTS.dimension2_id);

    // Dimensiones array — setear via JS
    await page.evaluate(({ d1, d2 }) => {
      const dims = document.querySelectorAll('[name="dimensiones_id[]"]');
      dims.forEach(el => el.selected = false);
      // Si es un multi-select
      const multiSelect = document.querySelector('select[name="dimensiones_id[]"]');
      if (multiSelect) {
        [...multiSelect.options].forEach(opt => {
          opt.selected = (opt.value === d1 || opt.value === d2);
        });
      }
    }, { d1: DEFAULTS.dimension1_id, d2: DEFAULTS.dimension2_id });

    // 4. Submit — click en el botón "Añadir Nuevo Cliente"
    const submitBtn = await page.$('input[value="Añadir Nuevo Cliente"], button:has-text("Añadir Nuevo Cliente")');
    if (!submitBtn) {
      // Fallback: buscar cualquier submit
      const anySubmit = await page.$('input[type="submit"], button[type="submit"]');
      if (anySubmit) {
        const val = await anySubmit.evaluate(e => e.value || e.textContent);
        console.log(`[operam] Submit encontrado: "${val}"`);
      }
      return { error: 'Botón de submit no encontrado' };
    }

    await submitBtn.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    console.log(`[operam] POST completado, URL: ${page.url()}`);

    // 5. Verificar creación
    await page.goto(ajaxCheckUrl, { waitUntil: 'domcontentloaded' });
    const ajaxText2 = await page.evaluate(() => document.body?.innerText || '');
    let ajaxData2 = { results: [] };
    if (ajaxText2) {
      try { ajaxData2 = JSON.parse(ajaxText2); } catch(e) { /* ignore */ }
    }
    const creado = ajaxData2.results?.find(x => x.rfc === cliente.tax_id);

    if (!creado) {
      return { warn: true, mensaje: 'El POST se ejecutó pero el cliente no aparece. Verificar en Operam.' };
    }
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
