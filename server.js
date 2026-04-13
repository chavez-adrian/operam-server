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
    console.log(`[operam] Login OK, URL: ${page.url()}`);

    // Todo en un solo page.evaluate para mantener la sesión
    const result = await page.evaluate(
      async ({ formUrl, postUrl, ajaxUrl, cliente, defaults, CustName, cust_ref, notes }) => {

        // 1. Verificar si el RFC ya existe
        const ajaxR = await fetch(
          `${ajaxUrl}?inactive=false&term=${encodeURIComponent(cliente.tax_id)}`,
          { credentials: 'include' }
        );
        const ajaxText = await ajaxR.text();

        let ajaxData = { results: [] };
        if (ajaxText) {
          try { ajaxData = JSON.parse(ajaxText); }
          catch(e) { return { error: `Respuesta AJAX no válida: ${ajaxText.slice(0, 150)}` }; }
        }

        const existente = ajaxData.results?.find(x => x.rfc === cliente.tax_id);
        if (existente) {
          return { duplicado: true, cliente_id: existente.id, nombre: existente.text };
        }

        // 2. Obtener formulario
        const r    = await fetch(formUrl, { credentials: 'include' });
        const html = await r.text();
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        const form = [...doc.querySelectorAll('form')].find(f => f.querySelector('[name="CustName"]'));
        if (!form) {
          const title = doc.querySelector('title')?.textContent || '';
          const formCount = doc.querySelectorAll('form').length;
          const fieldNames = [...doc.querySelectorAll('input[name],select[name],textarea[name]')]
            .map(e => e.name).slice(0, 20);
          return {
            error: 'Formulario no encontrado',
            diag: { title, formCount, fieldNames, htmlSnippet: html.slice(0, 500) }
          };
        }

        // 3. Llenar y enviar
        const fd = new FormData(form);
        fd.set('CustName',            CustName);
        fd.set('cust_ref',            cust_ref);
        fd.set('tax_id',              cliente.tax_id);
        fd.set('idcif',               cliente.idcif               || '');
        fd.set('street',              cliente.street               || '');
        fd.set('street_number',       cliente.street_number        || '');
        fd.set('suite_number',        cliente.suite_number         || '');
        fd.set('district',            cliente.district             || '');
        fd.set('postal_code',         cliente.postal_code          || '');
        fd.set('city',                cliente.city                 || '');
        fd.set('state',               cliente.state                || '');
        fd.set('country',             cliente.country              || 'México');
        fd.set('phone',               cliente.phone                || '');
        fd.set('email',               cliente.email                || '');
        fd.set('salesman',            cliente.salesman             || '');
        fd.set('segmento_id',         cliente.segmento_id          || '');
        fd.set('cfdi_regimen_fiscal', cliente.cfdi_regimen_fiscal  || '612');
        fd.set('notes',               notes);
        fd.set('cfdi_form_payment',   defaults.cfdi_form_payment);
        fd.set('timbrado_uso_cfdi',   cliente.timbrado_uso_cfdi    || defaults.timbrado_uso_cfdi);
        fd.set('payment_terms',       defaults.payment_terms);
        fd.set('location',            defaults.location);
        fd.set('area',                defaults.area);
        fd.delete('dimensiones_id[]');
        fd.append('dimensiones_id[]', defaults.dimension1_id);
        fd.append('dimensiones_id[]', defaults.dimension2_id);
        fd.set('dimension1_id',       defaults.dimension1_id);
        fd.set('dimension2_id',       defaults.dimension2_id);
        fd.set('process',             'Añadir Nuevo Cliente');

        const postResp = await fetch(postUrl, { method: 'POST', credentials: 'include', body: fd });
        const postBody = await postResp.text();

        // 4. Confirmar que quedó registrado
        const ajaxR2 = await fetch(
          `${ajaxUrl}?inactive=false&term=${encodeURIComponent(cliente.tax_id)}`,
          { credentials: 'include' }
        );
        const ajaxText2 = await ajaxR2.text();
        let ajaxData2 = { results: [] };
        if (ajaxText2) {
          try { ajaxData2 = JSON.parse(ajaxText2); } catch(e) { /* ignore */ }
        }
        const creado = ajaxData2.results?.find(x => x.rfc === cliente.tax_id);

        if (!creado) {
          return {
            warn: true,
            mensaje: 'El POST se ejecutó pero el cliente no aparece en Operam. Verificar manualmente.',
            postStatus: postResp.status,
            postSnippet: postBody.slice(0, 300)
          };
        }

        return { duplicado: false, cliente_id: creado.id, nombre: creado.text };
      },
      { formUrl: FORM_URL, postUrl: POST_URL, ajaxUrl: AJAX_URL, cliente, defaults: DEFAULTS, CustName, cust_ref, notes }
    );

    console.log(`[operam] Resultado:`, JSON.stringify(result).slice(0, 300));
    return result;

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
