const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  const operam = pages.find(p => p.url().includes('operam.pro'));
  if (!operam) { console.log('No hay página de Operam abierta'); await browser.close(); return; }
  await operam.screenshot({ path: 'estado-actual.png' });
  console.log('URL:', operam.url());
  await browser.close();
})();
