import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

async function clickChip(url, ticker) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => ({
      text: b.textContent.trim(),
      bg: getComputedStyle(b).backgroundColor,
    })),
  );
  const started = Date.now();
  await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
    if (!btn) throw new Error(`no chip ${name}`);
    btn.click();
  }, ticker);
  await new Promise((r) => setTimeout(r, 400));
  const after = await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
    return { text: btn?.textContent, bg: btn ? getComputedStyle(btn).backgroundColor : null };
  }, ticker);
  const elapsed = Date.now() - started;
  await page.close();
  return { before, after, elapsed, errors };
}

try {
  const filter = await clickChip('http://localhost:3010/widgets/filter', 'BR');
  const dash = await clickChip('http://localhost:3010/widgets/dashboard', 'BR');
  console.log(JSON.stringify({ filter, dash }, null, 2));
  const painted = (bg) => bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(232, 236, 241)';
  if (filter.elapsed > 1500 || dash.elapsed > 1500) {
    console.error('FAIL: click too slow', filter.elapsed, dash.elapsed);
    process.exit(1);
  }
  if (!painted(filter.after.bg) || !painted(dash.after.bg)) {
    console.error('FAIL: BR not painted', filter.after, dash.after);
    process.exit(1);
  }
  if (filter.errors.length || dash.errors.length) {
    console.error('FAIL: page errors', filter.errors, dash.errors);
    process.exit(1);
  }
  console.log('ok: BR paints on filter and dashboard');
} finally {
  await browser.close();
}
