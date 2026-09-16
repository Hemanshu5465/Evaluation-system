// Drives the project-evaluation workflow through the real UI + backend.
import puppeteer from 'puppeteer-core'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5173'
const errors = []
const log = (...a) => console.log(...a)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`[console.error] ${m.text()}`))

async function login(email) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('#email')
  await wait(400)
  for (const [s, v] of [['#email', email], ['#password', 'demo1234']])
    await page.$eval(s, (el, val) => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      set.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, v)
  await wait(200)
  await page.evaluate(() => document.querySelector('form').requestSubmit())
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 })
  await wait(2500)
}
const byText = (re) => page.evaluate((r) => {
  const rx = new RegExp(r, 'i')
  const el =
    [...document.querySelectorAll('main button')].find((e) => rx.test(e.textContent.trim())) ||
    [...document.querySelectorAll('button')].find((e) => rx.test(e.textContent.trim()))
  if (el) el.click()
  return !!el
}, re.source)
const body = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))

try {
  log('== STUDENT: submit project ==')
  await login('priya@example.com')
  await page.goto(`${BASE}/student/project`, { waitUntil: 'networkidle0' })
  await wait(1500)
  log('  project page:', (await body()).slice(0, 90))
  await (await page.$('input[type=file]')).uploadFile(process.env.ZIP_PATH)
  await page.waitForFunction(() => /detected structure|extracted/i.test(document.body.innerText), { timeout: 20000 })
  log('  project ZIP uploaded, structure detected ✓')
  await byText(/submit project/)
  await wait(700)
  await byText(/confirm/)
  await page.waitForFunction(() => /project submitted/i.test(document.body.innerText), { timeout: 20000 })
  log('  project submitted ✓')

  log('\n== EVALUATOR: evaluate + publish project ==')
  await login('evaluator@example.com')
  await page.goto(`${BASE}/evaluator/projects`, { waitUntil: 'networkidle0' })
  await wait(1800)
  log('  project evaluations page:', (await body()).slice(0, 120))
  await byText(/^(ai evaluation|open evaluation)$/)
  await wait(800)
  await byText(/run ai evaluation/)
  log('  project AI evaluation running…')
  await page.waitForFunction(() => /project ai evaluation complete/i.test(document.body.innerText), { timeout: 90000 })
  const rep = await body()
  log('  project AI evaluation complete ✓  ', (rep.match(/AI Score \d+/) || [''])[0], (rep.match(/\d+% (Low|Moderate|High) Probability/i) || [''])[0])
  await byText(/publish to student/)
  await wait(1500)
  log('  project result published ✓')

  log('\n== STUDENT: view project result ==')
  await login('priya@example.com')
  await page.goto(`${BASE}/student/results`, { waitUntil: 'networkidle0' })
  await wait(2500)
  const res = await body()
  log('  results page has project result:', /project evaluation|architecture|code quality/i.test(res))
  log('  shows checks passed/failed:', /\d+ passed/i.test(res))
} catch (e) {
  errors.push(`[flow] ${e.message}`)
  log('FLOW ERROR:', e.message, '\n  url:', page.url(), '\n  body:', (await body()).slice(0, 300))
}

await browser.close()
log('\n--- JS errors ---')
if (!errors.length) log('none')
else {
  ;[...new Set(errors)].slice(0, 15).forEach((e) => log(e))
  process.exitCode = 1
}
