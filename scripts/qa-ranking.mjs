import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const base = process.env.BASE_URL || 'http://127.0.0.1:5173', origin = new URL(base).origin
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
await mkdir('test-results/ranking', { recursive: true })
function fixture(url, invalid = false) {
  const q = new URL(url).searchParams, parameter = { T2M: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {}, RH2M: {} }
  for (let y = +q.get('start'); y <= +q.get('end'); y++) for (let m = 1; m <= 12; m++) {
    const key = `${y}${String(m).padStart(2,'0')}`
    parameter.T2M[key] = invalid ? -999 : 20; parameter.PRECTOTCORR[key] = 2; parameter.ALLSKY_SFC_SW_DWN[key] = 18; parameter.RH2M[key] = 60
  }
  return { header: { fill_value: -999 }, parameters: { T2M: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day' }, RH2M: { units: '%' } }, properties: { parameter } }
}
const field = { id: 'qa-screen-field', name: 'QA synthetic network test', location: 'Test point', latitude: 33.8, longitude: 35.9, area: 1, soil: { ph: 6.5, nitrogen: null, phosphorus: null, potassium: null, organicMatter: null }, water: 'rainfed', previousCrops: [], priorities: [], image: '/images/field-1.jpg' }
try {
  for (const mobile of [false,true]) {
    const name = mobile ? 'mobile' : 'desktop', viewport = { width: mobile ? 390 : 1440, height: mobile ? 844 : 1080 }
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' })
    await ctx.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 503, body: 'QA blocked' }))
    const page = await ctx.newPage(), panel = page.locator('.best-crops'), errors = []
    page.on('pageerror', e => errors.push(e.message))
    try {
      await page.goto(base+'/login')
      await page.getByRole('button', { name: 'Try Demo Farm', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Crop Recommendations', exact: true })).toBeVisible()
      await expect(panel.getByRole('heading', { name: 'Best Crops for This Field' })).toBeVisible()
      for (const farm of ['bekaa','north','coast']) {
        await page.getByRole('region', { name: 'Local demo controls' }).getByLabel('Demo farm', { exact: true }).selectOption(farm)
        await expect(panel.locator('.ranked-crop').first()).toBeVisible()
        await expect(page.locator('.dashboard-field-card').getByRole('link', { name: 'Best Crops', exact: true })).toHaveCount(2)
        await page.locator('.dashboard-field-card').first().getByRole('link', { name: 'Best Crops', exact: true }).click()
        await expect(panel).toHaveAttribute('data-field-id', `demo:${farm}:main`)
        await page.getByLabel('Planting window', { exact: true }).selectOption('Spring')
        await expect(panel).toHaveAttribute('data-season', 'Spring')
        await expect.poll(async () => { const values = await panel.locator('.ranked-crop').evaluateAll(nodes => nodes.map(n => +n.dataset.score)); return values.length > 0 && values.every((v,i) => !i || values[i-1] >= v) }).toBe(true)
        const scores = await panel.locator('.ranked-crop').evaluateAll(nodes => nodes.map(n => +n.dataset.score))
        expect(scores.length).toBeGreaterThan(0); expect(scores).toEqual([...scores].sort((a,b)=>b-a))
        await expect(panel.locator('.crop-rank').first()).toHaveText('#1')
        await panel.locator('summary').first().click()
        await expect(panel.getByRole('heading', { name: 'Needed for a complete assessment' }).first()).toBeVisible()
        await page.getByLabel('Your field', { exact: true }).selectOption(`demo:${farm}:secondary`)
        await expect(panel).toHaveAttribute('data-field-id', `demo:${farm}:secondary`)
        if(farm === 'coast') {
          await expect(panel.getByRole('heading', { name: 'Insufficient Data', exact: true })).toBeVisible()
          await expect(panel.locator('.ranked-crop')).toHaveCount(0)
          await expect(panel.getByRole('link', { name: 'Add or correct field inputs' })).toBeVisible()
        }
        await page.getByLabel('Your field', { exact: true }).selectOption(`demo:${farm}:main`)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true)
        if(farm === 'north') await page.screenshot({ path: `test-results/ranking/${name}-ranking.png`, fullPage: true })
      }
      await page.goto(base+'/fields')
      await expect(page.locator('.fields-page-card').getByRole('link', { name: 'Best Crops', exact: true })).toHaveCount(2)
      await page.locator('.fields-page-card').first().getByRole('link').first().click()
      await expect(panel.getByRole('heading', { name: 'Best Crops for This Field' })).toBeVisible()
      await page.getByRole('link', { name: 'Edit field', exact: true }).click()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.locator('#ph').fill('')
      for(let i=0;i<2;i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      await expect(panel.getByRole('heading', { name: 'Insufficient Data', exact: true })).toBeVisible()
      await expect(panel.locator('.ranked-crop')).toHaveCount(0)
      if(mobile) {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click()
        await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Crop recommendations', exact: true }).click()
        await expect(panel).toBeVisible()
      }
      await page.goto(base+'/recommendations?field=unavailable-field')
      await expect(panel).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Manage fields', exact: true })).toBeVisible()
      expect(errors).toEqual([])
      console.log('PASS '+name+': discovery, demo farms, ranking order, field switching, edited pH, sources, responsive navigation')
    } catch(e) { await page.screenshot({ path: `test-results/ranking/${name}-FAIL.png`, fullPage: true }); throw e }
    finally { await ctx.close() }
    const live = await browser.newContext({ viewport, serviceWorkers: 'block' })
    let mode = 'pending', release
    const pending = new Promise(resolve => { release = resolve })
    await live.addInitScript(f => { if(!localStorage.getItem('qa-ranking-seeded')) { localStorage.setItem('terrawise.fields.v1',JSON.stringify([f])); localStorage.setItem('qa-ranking-seeded','yes') } }, field)
    await live.route('**/*',async route => {
      const url = route.request().url()
      if(url.includes('/api/temporal/monthly/point')) {
        if(mode === 'pending') await pending
        return mode === 'failure' ? route.fulfill({ status:503,body:'QA outage' }) : route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify(fixture(url,mode==='invalid')) })
      }
      return new URL(url).origin === origin ? route.continue() : route.fulfill({ status:503,body:'QA blocked' })
    })
    const p = await live.newPage(), ranking = p.locator('.best-crops')
    try {
      await p.goto(base+'/recommendations',{waitUntil:'domcontentloaded'})
      await expect(ranking.getByRole('heading',{name:'Loading climate data…'})).toBeVisible()
      await expect(ranking.locator('.ranked-crop')).toHaveCount(0)
      mode='success';release()
      await expect(ranking.locator('.ranked-crop')).toHaveCount(8)
      expect(await ranking.locator('.ranked-crop').evaluateAll(nodes=>nodes.map(n=>[n.dataset.cropId,+n.dataset.score]))).toEqual([['barley',100],['chickpea',100],['wheat',100],['fava',100],['lentil',100],['sunflower',100],['tomato',100],['potato',87]])
      for(const state of ['failure','invalid']) {
        mode=state;await p.evaluate(()=>sessionStorage.clear());await p.reload()
        await expect(ranking.getByRole('heading',{name:'Insufficient Data',exact:true})).toBeVisible()
        await expect(ranking.locator('.ranked-crop')).toHaveCount(0)
      }
      mode='success';await ranking.getByRole('button',{name:'Retry climate data',exact:true}).click()
      await expect(ranking.locator('.ranked-crop')).toHaveCount(8)
      console.log('PASS '+name+': all eight expected engine scores, loading, climate failure, invalid response and recovery (QA network fixtures)')
    } finally { await live.close() }
  }
} finally { await browser.close() }
