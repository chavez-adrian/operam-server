const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const pages = contexts[0].pages();

  console.log('Pestañas abiertas:');
  for (const page of pages) {
    console.log(' -', await page.title(), '|', page.url());
  }

  await browser.close();
})();
