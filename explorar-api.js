const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  const operam = pages.find(p => p.url().includes('operam.pro'));

  await operam.goto('https://peltrenacional.operam.pro/inventory/manage/items.php?stock_id=VA08G1N1M0', {
    waitUntil: 'domcontentloaded', timeout: 10000
  });
  await operam.waitForTimeout(1000);

  // Intercept network requests
  const requests = [];
  operam.on('request', req => {
    if (!req.url().includes('chrome-extension')) {
      requests.push({ method: req.method(), url: req.url(), postData: req.postData()?.slice(0, 100) });
    }
  });

  // Trigger the search autocomplete
  await operam.fill('#search_autocomplete', 'VA08');
  await operam.waitForTimeout(2000);

  console.log('Requests captured:');
  requests.forEach(r => console.log(r.method, r.url, r.postData || ''));

  // Also look at the page source for js that handles the stock_id search
  const scripts = await operam.$$eval('script', scripts =>
    scripts.map(s => s.src || s.textContent?.slice(0, 200)).filter(Boolean).slice(0, 10)
  );
  console.log('\nScripts:', scripts);

  await browser.close();
})();
