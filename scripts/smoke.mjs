import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5173'
const errors = []

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const x = m.text()
  if (/scenario\?wait=false/.test(x) || (/Failed to load resource/.test(x) && /404/.test(x))) return
  errors.push(`[console.error] ${x}`)
})

async function login(email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('evalai')) localStorage.removeItem(k)
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await new Promise(r=>setTimeout(r,300))
  for (const [s,v] of [['#email',email],['#password','demo1234']]) await page.$eval(s,(el,val)=>{const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}))},v)
  await page.evaluate(()=>document.querySelector('form').requestSubmit())
  await new Promise((r) => setTimeout(r, 2500))
}

async function visit(path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 1200))
  const body = await page.evaluate(() => document.body.innerText.slice(0, 200))
  const hasErrorBoundary = await page.evaluate(() =>
    document.body.innerText.includes('Something went wrong') || !!document.querySelector('vite-error-overlay'),
  )
  console.log(`  ${label.padEnd(28)} ${hasErrorBoundary ? 'RENDER ERROR' : 'ok'}  "${body.replace(/\s+/g, ' ').trim().slice(0, 60)}"`)
}

const flows = {
  admin: ['/admin', '/admin/subjects', '/admin/question-generator', '/admin/questions', '/admin/distribution', '/admin/students', '/admin/evaluators', '/admin/assignments', '/admin/submissions', '/admin/analytics', '/admin/settings'],
  evaluator: ['/evaluator', '/evaluator/assigned', '/evaluator/submissions', '/evaluator/ai-evaluations', '/evaluator/manual', '/evaluator/projects', '/evaluator/published', '/evaluator/analytics'],
  student: ['/student', '/student/assessments', '/student/project', '/student/submissions', '/student/results', '/student/profile'],
}

for (const [role, paths] of Object.entries(flows)) {
  console.log(`\n=== ${role} ===`)
  await login(`${role === 'student' ? 'student' : role}@example.com`)
  const url = page.url()
  console.log(`  after login -> ${url.replace(BASE, '') || '/'}`)
  for (const p of paths) await visit(p, p)
}

await browser.close()

console.log('\n--- JS errors ---')
if (errors.length === 0) console.log('none')
else {
  const uniq = [...new Set(errors)]
  uniq.slice(0, 30).forEach((e) => console.log(e))
  process.exitCode = 1
}
