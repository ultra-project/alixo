/* Capture une page du site local : node shot-site.js <url-path> <out.png> <width> [mobile] */
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/alixo';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.txt': 'text/plain' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const [urlPath, out, w, mobile] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: { width: 390, height: 844 } } : { viewport: { width: +w || 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('reqfail: ' + r.url()));
  const resp404 = []; page.on('response', r => { if (r.status() >= 400) resp404.push(r.status() + ' ' + r.url()); });
  await page.goto(`http://127.0.0.1:${port}${urlPath}`);
  await page.waitForTimeout(1200);
  for (let y = 0; y < 12000; y += 500) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(4500);
  await page.screenshot({ path: out, fullPage: true });
  console.log('ok', out, 'height', await page.evaluate(() => document.body.scrollHeight));
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  if (resp404.length) console.log('HTTP>=400:\n' + resp404.join('\n'));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
