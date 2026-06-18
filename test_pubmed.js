const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://pubmed.ncbi.nlm.nih.gov/18830395/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'sticky') && parseInt(style.zIndex, 10) > 0) {
        el.style.display = 'none';
      }
    }
  });

  const pdfBuffer = await page.pdf({ 
      format: 'A4', 
      printBackground: false,
      margin: { top: '0.9in', right: '0.42in', bottom: '0.39in', left: '0.4in' }
  });
  
  fs.writeFileSync('test_pubmed.pdf', pdfBuffer);
  console.log("PDF generated, size:", pdfBuffer.length);
  await browser.close();
})();
