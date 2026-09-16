// Drives the full integrated workflow through the real UI + backend.
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5173'
const errors = []
const log = (...a) => console.log(...a)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
page.setDefaultTimeout(20000)
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const x = m.text()
  if (/scenario\?wait=false/.test(x) || (/Failed to load resource/.test(x) && /404/.test(x))) return
  errors.push(`[console.error] ${x}`)
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function setInput(sel, value) {
  await page.$eval(
    sel,
    (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    value,
  )
}

async function login(email) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('#email', { timeout: 15000 })
  await wait(400)
  await setInput('#email', email)
  await setInput('#password', 'demo1234')
  await wait(200)
  await page.evaluate(() => document.querySelector('form').requestSubmit())
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 })
  await wait(2500)
}

async function clickText(sel, text) {
  const clicked = await page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t))
      if (el) { el.click(); return true }
      return false
    },
    sel,
    text,
  )
  if (!clicked) throw new Error(`could not find ${sel} with text "${text}"`)
  await wait(400)
}

async function bodyText() {
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

try {
  // ---------------- ADMIN ----------------
  log('\n== ADMIN: generate + publish assessment ==')
  await login('admin@example.com')

  await page.goto(`${BASE}/admin/question-generator`, { waitUntil: 'networkidle0' })
  await wait(1500)
  await clickText('button', 'Generate Scenario Question')
  log('  generating…')
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('common scenario prompt'), { timeout: 60000 })
  log('  question generated ✓')

  await clickText('button', 'Publish')
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('published'), { timeout: 30000 })
  log('  assessment published ✓')

  await page.goto(`${BASE}/admin/distribution`, { waitUntil: 'networkidle0' })
  await wait(2500)
  const dist = await bodyText()
  const m = dist.match(/(?:Same for all|(\d+)\/)\s*(\d+)/) || dist.match(/(\d+) student scenario/)
  log(`  distribution page: ${m ? m[1] : '?'} student scenarios`)

  // ---------------- STUDENT ----------------
  log('\n== STUDENT: open assessment, upload, submit ==')
  await login('student@example.com')
  await page.goto(`${BASE}/student/assessments`, { waitUntil: 'networkidle0' })
  await wait(1500)
  await clickText('a', 'Open')
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('your scenario'), { timeout: 45000 })
  log('  assessment + personalized scenario visible ✓')

  const fileInput = await page.$('input[type=file]')
  const zipPath = process.env.ZIP_PATH
  await fileInput.uploadFile(zipPath)
  await page.waitForFunction(() => /required file checks|valid zip/i.test(document.body.innerText), { timeout: 20000 })
  log('  ZIP uploaded + extracted ✓')

  await clickText('button', 'Submit Solution')
  await wait(600)
  await clickText('button', 'Confirm')
  await page.waitForFunction(() => /solution submitted|with evaluator|evaluator review|ai evaluating/i.test(document.body.innerText), { timeout: 20000 })
  log('  solution submitted ✓')

  // ---------------- EVALUATOR ----------------
  log('\n== EVALUATOR: AI evaluation + manual + publish ==')
  await login('evaluator@example.com')
  await page.goto(`${BASE}/evaluator/submissions`, { waitUntil: 'networkidle0' })
  await wait(1500)
  const evText = await bodyText()
  log(`  submissions table: ${/(\d+)[–-]\d+ of (\d+)/.test(evText) ? evText.match(/of (\d+)/)[1] : (evText.includes('Rahul') ? '>=1' : '0')} rows`)

  await clickText('td button[title="AI Evaluation"]', '') .catch(async () => {
    // fallback: open row then run
    await clickText('tbody tr td', 'Rahul')
  })
  await wait(500)
  // modal open — run
  await clickText('button', 'Run AI Evaluation')
  log('  AI evaluation running…')
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('ai evaluation complete'), { timeout: 90000 })
  const rep = await bodyText()
  const score = rep.match(/AI Score (\d+)/)
  const prob = rep.match(/(\d+)%\s*(Low|Moderate|High) Probability/i)
  log(`  AI evaluation complete ✓  score=${score ? score[1] : '?'}  ai-content=${prob ? prob[0] : '?'}`)
  log(`  test cases rendered: ${rep.includes('Test Cases') ? 'yes' : 'no'}`)

  // close modal, open the submission detail page directly
  await page.keyboard.press('Escape')
  await wait(600)
  await page.goto(`${BASE}/evaluator/submissions`, { waitUntil: 'networkidle0' })
  await wait(1500)
  const subId = await page.evaluate(() => {
    // the "View" action button navigates to /evaluator/submissions/:id — read from the store via a link if present,
    // otherwise click the row and capture
    const btn = document.querySelector('button[title="View"]')
    if (btn) btn.click()
    return null
  })
  await page.waitForFunction(() => location.pathname.match(/\/evaluator\/submissions\/[0-9a-f-]{36}/), { timeout: 10000 })
  await wait(1500)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => /evaluate manually/i.test(e.textContent))
    b?.click()
  })
  await page.waitForFunction(() => location.pathname.includes('/evaluator/manual/'), { timeout: 10000 })
  await wait(1800)
  void subId
  // fill rubric inputs
  await page.evaluate(() => {
    document.querySelectorAll('input[type=number]').forEach((el) => {
      const max = Number(el.max) || 10
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, String(Math.max(0, max - 1)))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  })
  await wait(400)
  const total = (await bodyText()).match(/Total\s+(\d+)\s*\/\s*(\d+)/)
  log(`  manual rubric total: ${total ? total[1] + '/' + total[2] : '?'}`)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((e) => /submit evaluation/i.test(e.textContent))?.click())
  await wait(2000)
  await page.evaluate(() => [...document.querySelectorAll('button')].find((e) => /publish ai result to student/i.test(e.textContent))?.click())
  await wait(800)
  // confirmation modal
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((e) => e.textContent.trim() === 'Publish')
    ;(btns[btns.length - 1] || btns[0])?.click()
  })
  await page.waitForFunction(() => /published ✓|publication status|published/i.test(document.body.innerText), { timeout: 15000 })
  log('  AI result published ✓')

  // ---------------- STUDENT RESULT ----------------
  log('\n== STUDENT: view published result ==')
  await login('student@example.com')
  await page.goto(`${BASE}/student/results`, { waitUntil: 'networkidle0' })
  await wait(2500)
  const res = await bodyText()
  const rscore = res.match(/(\d+)\s*\/\s*100\s*AI SCORE/i) || res.match(/AI SCORE\s*(\d+)/i) || res.match(/(\d+)\s*\/\s*100/)
  log(`  result page: published=${/evaluation published/i.test(res)}  score=${rscore ? rscore[1] : '?'}`)
  log(`  shows test cases: ${/\d+ passed/i.test(res) && /\d+ failed/i.test(res)}`)
  log(`  shows AI-content indicator: ${/estimated ai-generated content probability/i.test(res)}`)
  log(`  leaks evaluator private data: ${/SECRET|evaluator comment|areas for improvement/i.test(res) ? 'YES (BUG)' : 'no'}`)
} catch (e) {
  errors.push(`[flow] ${e.message}`)
  log('FLOW ERROR:', e.message)
  log('  at url:', page.url())
  log('  body:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400))
  log('  buttons:', await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.title || b.textContent.trim().slice(0, 20)).filter(Boolean).slice(0, 20)))
}

await browser.close()
log('\n--- JS errors ---')
if (errors.length === 0) log('none')
else {
  ;[...new Set(errors)].slice(0, 20).forEach((e) => log(e))
  process.exitCode = 1
}
