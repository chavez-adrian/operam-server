const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');

// ─── Configuración ───────────────────────────────────────────────
const DRY_RUN = false; // Cambiar a false para aplicar cambios reales
const BASE_URL = 'https://peltrenacional.operam.pro';
const EXCEL_PATH = 'D:/OneDrive/Documents/_Claude/LISTA DE PRECIOS 2025 Mayo.xlsx';

// ─── Extraer tablas auxiliares del catálogo ───────────────────────
function buildTables(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const models    = new Map(); // modelo_code → { nombre, genero }
  const colors    = new Map(); // color_code  → { m, mp, f, fp }
  const textures  = new Map(); // tex_num     → { m, f }
  const filetes   = new Map(); // filete_num  → descriptor string
  const colorFil  = new Map(); // colorfil_num→ { name, phrase }
  const decorados = new Map(); // dec_code    → display name

  let inColors = false, inDecorados = false;
  let inTextures = false, inFiletes = false, inColorFil = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    // ── Modelos (col 0-4) ────────────────────────────────────────
    const c0 = row[0]?.toString().trim();
    if (c0 && row[1] && row[4] &&
        !['COLOR','TEXTURA','FILETES','CAPAS','DECORADO','color_fil','PAQ','COLABORA'].includes(c0)) {
      models.set(c0, { nombre: row[1].toString(), genero: row[4].toString() });
    }

    // ── Colores / Decorados (col 33-37) ──────────────────────────
    if (row[33] !== null && row[33] !== undefined) {
      const c33 = row[33].toString().trim();
      if (c33 === 'COLOR')    { inColors = true; inDecorados = false; }
      else if (c33 === 'DECORADO') { inDecorados = true; inColors = false; }
      else if (c33 === 'COLABORA') { /* ignorar */ }
      else if (inColors) {
        colors.set(c33, {
          m:  row[34]?.toString() ?? null,
          mp: row[35]?.toString() ?? null,
          f:  row[36]?.toString() ?? null,
          fp: row[37]?.toString() ?? null,
        });
      } else if (inDecorados && row[34]) {
        decorados.set(c33, row[34].toString());
      }
    }

    // ── Texturas / Filetes / ColorFil (col 40+) ──────────────────
    if (row[40] !== null && row[40] !== undefined) {
      const c40 = row[40].toString().trim();
      if      (c40 === 'TEXTURA')   { inTextures = true;  inFiletes = false; inColorFil = false; }
      else if (c40 === 'CAPAS')     { inTextures = false; }
      else if (c40 === 'FILETES')   { inFiletes  = true;  inTextures = false; inColorFil = false; }
      else if (c40 === 'color_fil') { inColorFil = true;  inFiletes  = false; inTextures = false; }
      else if (c40 === 'PAQ')       { inColorFil = false; inFiletes  = false; inTextures = false; }
      else if (typeof row[40] === 'number') {
        if (inTextures) textures.set(row[40], { m: row[42]?.toString() ?? null, f: row[44]?.toString() ?? null });
        if (inFiletes)  filetes.set(row[40],  row[41]?.toString() ?? null);
        if (inColorFil) colorFil.set(row[40], {
          name:   row[41]?.toString()?.toLowerCase() ?? '',
          phrase: row[42]?.toString() ?? '',
        });
      }
    }
  }

  return { models, colors, textures, filetes, colorFil, decorados };
}

// ─── Generar nombre desde la convención ──────────────────────────
function generateName(row, tables) {
  const { models, colors, textures, filetes, colorFil, decorados } = tables;

  const sku       = row[13]?.toString().trim() ?? '';
  const modelCode = sku.slice(0, 4);
  const model     = models.get(modelCode);
  if (!model) return null;

  const { nombre: modelName, genero } = model;
  const color01Code  = row[2]?.toString().trim() ?? '';
  const textura      = Number(row[3]);

  // Caso Muestras
  if (color01Code === '00' || textura === 0) return `${modelName} [Muestras]`;

  const parts = [modelName];

  // Decorado (col J = índice 9)
  const decCode = row[9]?.toString()?.trim() ?? '';
  if (decCode) {
    const decName = decorados.get(decCode);
    if (decName) parts.push(decName);
  }

  // Color01 (con género del modelo)
  const color01 = colors.get(color01Code);
  if (color01) {
    const cName = (genero === 'f' ? color01.f : color01.m);
    if (cName) parts.push(cName);
  }

  // Textura (con género, se omite si = 1 / sólido)
  if (textura && textura !== 1) {
    const tex = textures.get(textura);
    if (tex) {
      const tName = genero === 'f' ? tex.f : tex.m;
      if (tName) parts.push(tName);
    }
  }

  // Interior: CAPAS = 2 → "interior [COLOR02 masculino]"
  const capas      = Number(row[4]);
  const color02Code = row[6]?.toString().trim() ?? '';
  if (capas === 2 && color02Code && color02Code !== '00') {
    const color02 = colors.get(color02Code);
    if (color02?.m) parts.push('interior ' + color02.m);
  }

  // Filetes + colores de filete
  const filetesNum   = Number(row[5]);
  const colorRisoNum = Number(row[7]);
  const colorOrejaNum = Number(row[8]);

  if (filetesNum === 2) {
    const desc = filetes.get(2);
    if (desc) parts.push(desc); // "s/filetes"

  } else if (filetesNum === 4) {
    const desc = filetes.get(4);
    if (desc) parts.push(desc); // "s/filete riso"
    if (colorOrejaNum !== 0) {
      const cf = colorFil.get(colorOrejaNum);
      if (cf) parts.push('filete 2 ' + cf.name);
    }

  } else {
    // FILETES = 1, 3, 5
    if (filetesNum && filetesNum !== 1) {
      const desc = filetes.get(filetesNum);
      if (desc) parts.push(desc); // "s/filete oreja", "s/filete asas"
    }
    if (colorRisoNum && colorRisoNum !== 0) {
      const cf = colorFil.get(colorRisoNum);
      if (cf) parts.push(cf.phrase); // "filete negro", "filete azul"…
    }
    // Filete 2: OREJA ≠ 0 y OREJA ≠ RISO
    if (colorOrejaNum && colorOrejaNum !== 0 && colorOrejaNum !== colorRisoNum) {
      const cf = colorFil.get(colorOrejaNum);
      if (cf) parts.push('filete 2 ' + cf.name);
    }
  }

  return parts.join(' ');
}

// ─── Construir lookup SKU → nombre correcto ───────────────────────
function buildLookup(wb) {
  const tables = buildTables(wb.Sheets['catalogo']);
  const data   = XLSX.utils.sheet_to_json(wb.Sheets['carga_artículos'], { header: 1 });

  const lookup = new Map();
  for (const row of data.slice(1)) {
    const sku = row[13]?.toString().trim();
    if (!sku || lookup.has(sku)) continue;

    const decCode = row[9]?.toString()?.trim() ?? '';
    let nombre;

    if (decCode) {
      // Generar desde convención (incluye decorado/colaboración)
      nombre = generateName(row, tables) ?? row[14]?.toString().trim();
    } else {
      // Usar columna O directamente
      nombre = row[14]?.toString().trim();
    }

    if (nombre) lookup.set(sku, nombre);
  }

  return { lookup, tables };
}

// ─── Script principal ────────────────────────────────────────────
(async () => {
  const wb = XLSX.readFile(EXCEL_PATH);
  const { lookup } = buildLookup(wb);
  console.log(`📋 SKUs en Excel: ${lookup.size}`);

  // Mostrar muestra de artículos con decorado para verificar
  const cargaData = XLSX.utils.sheet_to_json(wb.Sheets['carga_artículos'], { header: 1 });
  const tables = buildTables(wb.Sheets['catalogo']);
  const conDecor = cargaData.slice(1).filter(r => r[9]?.toString()?.trim());
  console.log(`\n📌 Artículos con DECORADO: ${conDecor.length}`);
  console.log('   Muestra de nombres generados:');
  conDecor.slice(0, 8).forEach(row => {
    const sku = row[13]?.toString().trim() ?? '';
    const gen = generateName(row, tables);
    console.log(`   ${sku} → ${gen}`);
  });

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  const operam = pages.find(p => p.url().includes('operam.pro'));

  await operam.goto(`${BASE_URL}/inventory/manage/items.php?stock_id=VA08G1N1M0`, {
    waitUntil: 'domcontentloaded', timeout: 10000
  });
  await operam.waitForTimeout(500);

  const resultados = [];
  const skus = [...lookup.keys()];
  let i = 0;

  for (const sku of skus) {
    i++;
    const nombreCorrecto = lookup.get(sku);
    process.stdout.write(`\r[${i}/${skus.length}] ${sku.padEnd(22)}`);

    try {
      const { html, status } = await operam.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'include' });
        return { html: await r.text(), status: r.status };
      }, `${BASE_URL}/inventory/manage/items.php?stock_id=${encodeURIComponent(sku)}`);

      if (status !== 200) { resultados.push({ sku, estado: 'ERROR', error: `HTTP ${status}` }); continue; }

      const skuEnPagina = html.match(/name=["']NewStockID["'][^>]*value=["']([^"']*)["']/)?.[1] ?? '';
      if (!skuEnPagina || skuEnPagina !== sku) { resultados.push({ sku, estado: 'NO ENCONTRADO' }); continue; }

      const nombreActual = html.match(/name=["']description["'][^>]*value=["']([^"']*)["']|value=["']([^"']*)["'][^>]*name=["']description["']/)?.[1] ?? '';

      if (nombreActual === nombreCorrecto) { resultados.push({ sku, estado: 'OK' }); continue; }

      if (DRY_RUN) {
        resultados.push({ sku, estado: 'CAMBIAR', de: nombreActual, a: nombreCorrecto });
        continue;
      }

      await operam.evaluate(async ({ pageUrl, postUrl, newDesc }) => {
        const r = await fetch(pageUrl, { credentials: 'include' });
        const html = await r.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const mainForm = [...doc.querySelectorAll('form')].find(f => f.querySelector('[name="description"]'));
        if (!mainForm) throw new Error('form not found');
        const fd = new FormData(mainForm);
        fd.set('description', newDesc);
        fd.set('addupdate', 'Actualizar Artículo');
        await fetch(postUrl, { method: 'POST', credentials: 'include', body: fd });
      }, {
        pageUrl: `${BASE_URL}/inventory/manage/items.php?stock_id=${encodeURIComponent(sku)}`,
        postUrl: `${BASE_URL}/inventory/manage/items.php`,
        newDesc: nombreCorrecto,
      });

      resultados.push({ sku, estado: 'ACTUALIZADO', de: nombreActual, a: nombreCorrecto });

    } catch (err) {
      resultados.push({ sku, estado: 'ERROR', error: err.message.slice(0, 80) });
    }
  }

  console.log('\n\n─── Resumen ───────────────────────────────────');
  const cambios       = resultados.filter(r => r.estado === 'CAMBIAR' || r.estado === 'ACTUALIZADO');
  const noEncontrados = resultados.filter(r => r.estado === 'NO ENCONTRADO');
  const errores       = resultados.filter(r => r.estado === 'ERROR');
  const ok            = resultados.filter(r => r.estado === 'OK');

  console.log(`✅ Ya correctos:             ${ok.length}`);
  console.log(`🔄 ${DRY_RUN ? 'Por cambiar' : 'Actualizados'}:             ${cambios.length}`);
  console.log(`❌ No encontrados en Operam: ${noEncontrados.length}`);
  console.log(`⚠️  Errores:                 ${errores.length}`);

  if (cambios.length > 0) {
    console.log('\n─── Primeros 30 cambios ───────────────────────');
    cambios.slice(0, 30).forEach(r => {
      console.log(`  ${r.sku}\n    Actual:   "${r.de}"\n    Correcto: "${r.a}"`);
    });
    if (cambios.length > 30) console.log(`  ... y ${cambios.length - 30} más`);
  }

  fs.writeFileSync('reporte.json', JSON.stringify({ fecha: new Date().toISOString(), dryRun: DRY_RUN, resultados }, null, 2));
  console.log('\n💾 Reporte guardado en reporte.json');
  if (DRY_RUN) console.log('\n⚠️  MODO DRY RUN — Cambia DRY_RUN = false para aplicar cambios.');

  await browser.close();
})();
