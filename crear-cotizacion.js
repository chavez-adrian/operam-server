'use strict';

const fs = require('fs');
const readline = require('readline');

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH = 'C:/Users/chave/OneDrive/Documents/_Claude/.claude/operam-config.json';
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const DRY_RUN = process.argv.includes('--dry-run');
const PDF_PATH = process.argv.find(a => a.endsWith('.pdf'));

// ─── Estado de token ──────────────────────────────────────────────────────────
let token = null;

// ─── API v3 ───────────────────────────────────────────────────────────────────
async function getToken() {
  const r = await fetch(`${CONFIG.url}/api/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: CONFIG.company, user: CONFIG.user, pass: CONFIG.password }),
  });
  const data = await r.json();
  if (!data.token) throw new Error(`Login fallido: ${JSON.stringify(data)}`);
  token = data.token;
  return token;
}

async function apiCall(method, endpoint, body, isRetry = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await fetch(`${CONFIG.url}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (r.status === 401 && !isRetry) {
      await getToken();
      return apiCall(method, endpoint, body, true);
    }
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Interactividad ───────────────────────────────────────────────────────────
function preguntar(texto) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(texto, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function confirmar(texto) {
  const ans = await preguntar(`${texto} [Y/N]: `);
  return ans.toLowerCase() === 'y' || ans.toLowerCase() === 's';
}

// ─── Parseo de PDF ────────────────────────────────────────────────────────────
async function parsePDF(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Número de OC
  const ocLine = lines.find(l => /^#\S+/.test(l));
  const ocRef = ocLine ? ocLine.replace('#', '').trim() : 'SIN-REF';

  // Nombre del cliente (buscar línea con "S.A." o "S. de" cerca de BILL TO)
  let clienteNombre = '';
  const billToIdx = lines.findIndex(l => l.includes('BILL TO'));
  if (billToIdx !== -1) {
    for (let i = billToIdx + 1; i < Math.min(billToIdx + 12, lines.length); i++) {
      if (/S\.A\.|S\. de|S de C\.V\.|SAPI|S\.C\./i.test(lines[i])) {
        clienteNombre = lines[i].trim();
        break;
      }
    }
  }
  if (!clienteNombre) {
    const headerEnd = lines.findIndex(l => /^PAYMENT TERMS/i.test(l));
    const headerLines = lines.slice(0, headerEnd > 0 ? headerEnd : 20);
    const empresa = headerLines.find(l => l.length > 5 && /^[A-Z]/.test(l) && !/SUPPLIER|SHIP|BILL|PELTRE|NACIONAL/.test(l));
    clienteNombre = empresa || '';
  }

  // Tabla de artículos
  const tableStart = lines.findIndex(l => /^PRODUCTS/.test(l));
  if (tableStart === -1) throw new Error('No se encontró encabezado PRODUCTS en el PDF');

  const items = [];
  let nombreAccum = [];
  let codigoShopify = null;

  // pdf-parse concatena columnas sin espacios: "TA14M3111196$42.0316%$4,680.46"
  // SKU de Peltre Nacional: 2 letras + 2 dígitos + letra + dígitos + 1111 (ej. TA14M31111, PH20V5001111)
  // Guión indica sin SKU: "-96$21.2116%$2,361.95"
  const dataRe = /^([A-Z]{2}\d{2}[A-Z]\d*1{4}|-)(\d+)\$([\d,]+\.\d{2})\d+%\$([\d,]+\.\d{2})$/;

  // Código Shopify: solo dígitos, entre 8 y 13 caracteres
  const esCodigoShopify = l => /^\d{8,13}$/.test(l);

  // Fin de tabla real (no encabezados de página)
  const esFinTabla = l => /^(REFERENCE NUMBER|COST SUMMARY|Taxes|Subtotal|Shipping|Total\s*\$)/i.test(l);

  // Encabezados de página del Shopify PO (ignorar, no son artículos ni fin de tabla)
  const esEncabezadoPagina = l => /^(Powered by Shopify|.*#PO\d)/i.test(l);

  for (let i = tableStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (esFinTabla(line)) break;
    if (esEncabezadoPagina(line)) continue;

    if (esCodigoShopify(line)) {
      codigoShopify = line;
      continue;
    }

    const dataMatch = line.match(dataRe);
    if (dataMatch) {
      const [, skuRaw, qty, cost] = dataMatch;
      items.push({
        descripcion: nombreAccum.join(' ').trim(),
        codigoShopify,
        skuOperam: skuRaw === '-' ? null : skuRaw,
        cantidad: parseInt(qty, 10),
        costoPDF: parseFloat(cost.replace(',', '')),
      });
      nombreAccum = [];
      codigoShopify = null;
      continue;
    }

    // Acumular nombre del artículo (texto en mayúsculas).
    // Se acumula incluso si ya hay codigoShopify, para manejar el caso
    // donde el código Shopify del artículo anterior queda huérfano tras
    // un salto de página, antes del nombre del artículo siguiente.
    if (/^[A-Z]/.test(line)) {
      nombreAccum.push(line);
    }
  }

  if (items.length === 0) throw new Error('No se encontraron artículos en la tabla del PDF');

  return { ocRef, clienteNombre, items };
}

// ─── Búsqueda en Operam ───────────────────────────────────────────────────────
async function buscarSKUEnOperam(descripcion) {
  // Intentar variantes de menor a mayor especificidad hasta encontrar resultados
  const terminoBase = descripcion.split('/')[0].trim();
  // Ej: "PORTAVASO M8 / MENTA" → ["PORTAVASO M8", "PORTAVASO", "M8"]
  const variantes = [
    terminoBase,
    terminoBase.split(' ')[0],                    // primera palabra (tipo de artículo)
    terminoBase.split(' ').slice(-1)[0],          // última palabra (ej. tamaño "M8")
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const termino of variantes) {
    const data = await apiCall('GET', `/api/v3/inventory/items?search=${encodeURIComponent(termino)}&limit=10`);
    const resultados = data.data || data.items || (Array.isArray(data) ? data : []);
    if (resultados.length > 0) return resultados;
  }
  return [];
}

async function inferirSKU(item, todosItems) {
  console.log(`\n[INFO] Sin SKU: "${item.descripcion}" (cód. Shopify: ${item.codigoShopify || 'N/A'})`);

  // Prefijo de 4 chars de artículos vecinos con SKU conocido
  const vecinos = todosItems.filter(it => it.skuOperam && it.skuOperam.length >= 4);
  const prefijos = [...new Set(vecinos.map(it => it.skuOperam.slice(0, 4)))];
  if (prefijos.length === 1) {
    console.log(`[INFO] Prefijo inferido por contexto: ${prefijos[0]}`);
  }

  const resultados = await buscarSKUEnOperam(item.descripcion);

  if (resultados.length === 0) {
    console.log(`[OMITIDO] No se encontró SKU en Operam para: "${item.descripcion}"`);
    return null;
  }

  if (resultados.length === 1) {
    console.log(`[INFO] SKU inferido automáticamente: ${resultados[0].stock_id} — ${resultados[0].description || resultados[0].stock_description}`);
    return resultados[0].stock_id;
  }

  console.log(`Se encontraron ${resultados.length} opciones:`);
  resultados.slice(0, 8).forEach((r, idx) => {
    console.log(`  ${idx + 1}. ${r.stock_id} — ${r.description || r.stock_description || ''}`);
  });
  const eleccion = await preguntar('Elige el número (0 = omitir): ');
  const num = parseInt(eleccion, 10);
  if (!num || num < 1 || num > resultados.length) {
    console.log('[OMITIDO] Artículo omitido por elección del usuario.');
    return null;
  }
  return resultados[num - 1].stock_id;
}

// ─── Búsqueda de cliente ──────────────────────────────────────────────────────
async function buscarCliente(nombre) {
  // Intentar por nombre completo y variantes
  const terminos = [nombre, nombre.split(' ')[0]];
  for (const t of terminos) {
    const data = await apiCall('GET', `/api/v3/sales/customers?search=${encodeURIComponent(t)}&limit=5`);
    const lista = data.data || (Array.isArray(data) ? data : []);
    if (lista.length > 0) return lista[0];
  }
  return null;
}

// ─── Precios de Operam ────────────────────────────────────────────────────────
async function obtenerPrecioOperam(salesTypeId, stockId) {
  const data = await apiCall('GET', `/api/v3/sales/prices_list?sales_type_id=${parseInt(salesTypeId, 10)}&stock_id=${encodeURIComponent(stockId)}`);
  const lista = data.data || (Array.isArray(data) ? data : []);
  if (lista.length === 0) return null;
  const entrada = lista[0];
  return parseFloat(entrada.price || entrada.sell_price || entrada.unit_price || 0) || null;
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
function mostrarResumen({ ocRef, clienteNombre, customerId, items, omitidos }) {
  const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  console.log('\n' + '='.repeat(60));
  console.log('  COTIZACIÓN A CREAR');
  console.log('='.repeat(60));
  console.log(`  Cliente:    ${clienteNombre}${customerId ? ` (ID: ${customerId})` : ' — sin ID en Operam'}`);
  console.log(`  OC Ref:     ${ocRef}`);
  console.log(`  Artículos:  ${items.length} de ${items.length + omitidos.length}`);
  console.log(`  Importe:    $${total.toFixed(2)} MXN (sin IVA)`);
  console.log('-'.repeat(60));
  console.log('  SKU              QTY    PRECIO    SUBTOTAL');
  for (const it of items) {
    const sub = (it.cantidad * it.precio).toFixed(2);
    console.log(`  ${it.skuOperam.padEnd(16)} ${String(it.cantidad).padStart(4)}   $${it.precio.toFixed(2).padStart(8)}   $${sub}`);
  }
  if (omitidos.length > 0) {
    console.log('-'.repeat(60));
    console.log('  OMITIDOS (sin SKU resuelto):');
    for (const o of omitidos) console.log(`  - "${o.descripcion}" (cód. Shopify: ${o.codigoShopify || 'N/A'})`);
  }
  console.log('='.repeat(60));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!PDF_PATH) {
    console.error('Uso: node crear-cotizacion.js <archivo.pdf> [--dry-run]');
    process.exit(1);
  }
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`[ERROR] Archivo no encontrado: ${PDF_PATH}`);
    process.exit(1);
  }

  console.log(`\nModo: ${DRY_RUN ? 'DRY RUN (sin POST)' : 'REAL (creará cotización en Operam)'}`);
  console.log(`PDF: ${PDF_PATH}\n`);

  // 1. Parsear PDF
  console.log('[INFO] Parseando PDF...');
  let parsed;
  try {
    parsed = await parsePDF(PDF_PATH);
  } catch (err) {
    console.error(`[ERROR] No se pudo parsear el PDF: ${err.message}`);
    process.exit(1);
  }
  const { ocRef, clienteNombre, items: rawItems } = parsed;
  console.log(`[OK] OC: ${ocRef} | Cliente: ${clienteNombre} | Artículos: ${rawItems.length}`);

  // 2. Login en Operam
  console.log('[INFO] Autenticando en Operam...');
  await getToken();
  console.log('[OK] Token obtenido.');

  // 3. Resolver SKUs faltantes
  const sinSKU = rawItems.filter(it => !it.skuOperam);
  if (sinSKU.length > 0) {
    console.log(`\n[INFO] ${sinSKU.length} artículo(s) sin SKU de Operam. Buscando en catálogo...`);
    for (const item of sinSKU) {
      item.skuOperam = await inferirSKU(item, rawItems);
    }
  }

  const itemsConSKU = rawItems.filter(it => it.skuOperam);
  const omitidos = rawItems.filter(it => !it.skuOperam);

  // 4. Buscar cliente en Operam
  let customerId = null;
  let branchId = 1;
  let salesTypeId = null;

  console.log(`\n[INFO] Buscando cliente "${clienteNombre}" en Operam...`);
  const cliente = await buscarCliente(clienteNombre);
  if (cliente) {
    customerId = cliente.customer_id;
    salesTypeId = cliente.sales_type;
    console.log(`[OK] Cliente encontrado: ${cliente.CustName} (ID: ${customerId}, lista: ${salesTypeId})`);
    // Obtener branch_id del cliente
    const detalle = await apiCall('GET', `/api/v3/sales/customers/${customerId}`);
    const branches = detalle.branches || detalle.data?.branches || [];
    if (branches.length > 0) branchId = branches[0].branch_code || branches[0].id || 1;
  } else {
    console.log(`[AVISO] No se encontró el cliente "${clienteNombre}" en Operam.`);
    const continuar = await confirmar('¿Continuar sin asignar cliente?');
    if (!continuar) { console.log('Cancelado.'); process.exit(0); }
  }

  // 5. Obtener precios de Operam y comparar con PDF
  console.log('\n[INFO] Verificando precios en Operam...');
  for (const item of itemsConSKU) {
    const precioOperam = salesTypeId ? await obtenerPrecioOperam(salesTypeId, item.skuOperam) : null;
    if (precioOperam !== null) {
      if (Math.abs(precioOperam - item.costoPDF) > 0.01) {
        console.log(`AVISO: ${item.skuOperam} — PDF: $${item.costoPDF.toFixed(2)} | Operam: $${precioOperam.toFixed(2)} → se usará $${precioOperam.toFixed(2)}`);
      }
      item.precio = precioOperam;
    } else {
      if (salesTypeId) console.log(`[INFO] ${item.skuOperam} sin precio en lista ${salesTypeId}, se usará precio del PDF: $${item.costoPDF.toFixed(2)}`);
      item.precio = item.costoPDF;
    }
  }

  // 6. Mostrar resumen y confirmar
  mostrarResumen({ ocRef, clienteNombre, customerId, items: itemsConSKU, omitidos });

  if (!DRY_RUN) {
    const ok = await confirmar('\n¿Crear cotización en Operam?');
    if (!ok) { console.log('Cancelado.'); process.exit(0); }
  }

  // 7. Construir body
  const hoy = new Date().toISOString().slice(0, 10);
  const body = {
    customer_id: customerId,
    branch_id: branchId,
    payment: 1,
    sucursal_id: 1,
    OrderDate: hoy,
    ref: ocRef,
    items: itemsConSKU.map(it => ({
      stock_id: it.skuOperam,
      qty: it.cantidad,
      price: it.precio,
    })),
    comments: `Generado desde OC ${ocRef}`,
  };

  if (DRY_RUN) {
    console.log('\nBody que se enviaría:\n');
    console.log(JSON.stringify(body, null, 2));
    console.log('\nPara crear la cotización, corre sin --dry-run.');
    return;
  }

  // 8. Crear cotización
  console.log('\n[INFO] Creando cotización...');
  let resultado = await apiCall('POST', '/api/v3/sales/quote', body);

  // Si falla por SKU inválido, reintentar sin ese artículo
  if (!resultado.result && resultado.messages) {
    const msg = resultado.messages.join ? resultado.messages.join(' ') : String(resultado.messages);
    const skuRejected = msg.match(/\b([A-Z0-9]{4,})\b/)?.[1];
    if (skuRejected) {
      console.log(`[ERROR] SKU rechazado: ${skuRejected}. Reintentando sin él...`);
      body.items = body.items.filter(it => it.stock_id !== skuRejected);
      resultado = await apiCall('POST', '/api/v3/sales/quote', body);
    }
  }

  if (!resultado.result) {
    const msg = resultado.messages?.join?.(', ') || JSON.stringify(resultado);
    console.error(`[ERROR] No se pudo crear la cotización: ${msg}`);
    process.exit(1);
  }

  const quoteId = resultado.quote_id || resultado.id || resultado.trans_no || JSON.stringify(resultado);
  console.log(`\n[OK] Cotización creada. ID: ${quoteId}`);
})();
