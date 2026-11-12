import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
const executablePath = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await mkdir('test-results', { recursive: true });

async function open(path) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, `${path} should load successfully`);
}

// TEST-ONLY HTTP fixture. These synthetic values exercise source transitions;
// they are never bundled with the app or presented as actual NASA observations.
function nasaShapedTestFixture(year, temperature) {
  const parameters = { T2M: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {} };
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}${String(month).padStart(2, '0')}`;
    parameters.T2M[key] = temperature;
    parameters.PRECTOTCORR[key] = 1;
    parameters.ALLSKY_SFC_SW_DWN[key] = 18;
  }
  return {
    header: { fill_value: -999, title: 'SYNTHETIC BROWSER TEST FIXTURE - NOT NASA OBSERVATIONS' },
    parameters: { T2M: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, ALLSKY_SFC_SW_DWN: { units: 'MJ/m^2/day' } },
    properties: { parameter: parameters },
  };
}

async function verifyClimateSourceTransitions() {
  const routePattern = 'https://power.larc.nasa.gov/api/temporal/monthly/point**';
  let releaseSecondRequest;
  const secondRequestGate = new Promise(resolve => { releaseSecondRequest = resolve; });
  const climateRequests = [];
  const handler = async route => {
    const url = new URL(route.request().url());
    const latitude = Number(url.searchParams.get('latitude'));
    const longitude = Number(url.searchParams.get('longitude'));
    const year = Number(url.searchParams.get('start'));
    assert.equal(url.searchParams.get('community'), 'AG');
    assert.equal(url.searchParams.get('end'), String(year));
    climateRequests.push({ latitude, longitude, year });
    const isRiverside = longitude === 35.8547;
    if (isRiverside) await secondRequestGate;
    // StrictMode may cancel the initial request. The visible success assertions
    // below ensure any surviving request still receives and validates the fixture.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nasaShapedTestFixture(year, isRiverside ? 21.5 : 10)) }).catch(error => {
      if (!route.request().failure()) throw error;
    });
  };
  await page.route(routePattern, handler);
  try {
    await page.evaluate(() => localStorage.setItem('terrawise.preferences', JSON.stringify({ name: 'QA', climateMode: 'live' })));
    await open('/recommendations?field=north-field');
    await expect(page.locator('.decision-toolbar-source')).toContainText('NASA POWER');
    await page.locator('.featured-crop-details summary').click();
    await expect(page.locator('.featured-crop-details .factor-item').first()).toContainText('10.0°C');
    assert(climateRequests.some(request => request.latitude === 33.8467 && request.longitude === 35.9019), 'The first climate result must belong to North Field coordinates');

    const riversideRequest = page.waitForRequest(request => request.url().startsWith('https://power.larc.nasa.gov/api/temporal/monthly/point') && new URL(request.url()).searchParams.get('longitude') === '35.8547');
    await page.locator('#recommendation-field').selectOption('riverside');
    await riversideRequest;
    await expect(page.locator('.decision-toolbar-source')).toContainText('Simulated demo data');
    await expect(page.locator('.decision-toolbar-source .source-nasa-power')).toHaveCount(0);
    await expect(page.getByText('Loading NASA POWER climate data.', { exact: false })).toBeVisible();
    await expect(page.locator('.featured-crop-details .factor-item').first()).not.toContainText('10.0°C');
    releaseSecondRequest();
    await expect(page.locator('.decision-toolbar-source')).toContainText('NASA POWER');
    await expect(page.locator('.featured-crop-details .factor-item').first()).toContainText('21.5°C');
    await expect(page.getByText('Loading NASA POWER climate data.', { exact: false })).toHaveCount(0);

    // Switch modes through the actual Settings UI, then return to the decision
    // page. Demo preference must immediately show a demo label and send no API call.
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: /Simulated demo climate/ }).check();
    const requestCountAfterDemoPreference = climateRequests.length;
    await page.getByRole('link', { name: 'Crop recommendations', exact: true }).click();
    await expect(page.locator('.decision-toolbar-source')).toContainText('Simulated demo data');
    await expect(page.locator('.decision-toolbar-source .source-nasa-power')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    assert.equal(climateRequests.length, requestCountAfterDemoPreference, 'Demo preference must not request NASA data');
  } finally {
    releaseSecondRequest();
    await page.unroute(routePattern, handler);
  }
}

try {
  await open('/recommendations?field=north-field');
  await expect(page.getByRole('heading', { name: 'Crop recommendations', exact: true })).toBeVisible();
  await expect(page.locator('.alternative-crop')).toHaveCount(4);
  await expect(page.locator('.decision-toolbar-source')).toContainText('Simulated demo data');
  await page.locator('#recommendation-season').selectOption('Spring');
  await page.getByLabel('Filter crop type').selectOption('Vegetable');
  await expect(page.locator('.alternative-crop')).toHaveCount(1);
  await page.locator('.featured-crop-details summary').click();
  await expect(page.locator('.featured-crop-details .factor-item')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/recommendations-desktop.png', fullPage: true });

  const springCropName = await page.locator('.featured-crop-heading h2').innerText();
  await page.locator('.featured-crop-body > a').click();
  await expect(page.locator('.rotation-season h3').first()).toHaveText(springCropName);
  await expect(page.locator('.rotation-season-date > span').first()).toHaveText('Spring');
  await expect(page.locator('.rotation-season-date > strong').first()).toHaveText('2027');
  await open('/recommendations?field=north-field');

  await page.getByLabel('Filter crop type').selectOption('All crops');
  await page.locator('#recommendation-season').selectOption('Autumn');
  const preferredCropName = await page.locator('.featured-crop-heading h2').innerText();
  await page.locator('.featured-crop-body > a').click();
  await expect(page.getByRole('heading', { name: 'Rotation planner', exact: true })).toBeVisible();
  await expect(page.locator('.rotation-season')).toHaveCount(4);
  await expect(page.locator('.rotation-season h3').first()).toHaveText(preferredCropName);
  await page.locator('#crop-0').selectOption('wheat');
  await expect(page.locator('.rotation-season h3').first()).toHaveText('Durum wheat');
  assert(!(await page.locator('.rotation-season .crop-category').nth(1).innerText()).includes('Poaceae'), 'The next auto-selected crop should break the cereal family');
  await page.locator('#crop-1').selectOption('barley');
  assert(Number.parseFloat(await page.locator('.rotation-match').nth(1).innerText()) <= 65, 'A manually repeated cereal family should receive the rotation cap');
  await expect(page.locator('.rotation-explanation').nth(1)).toContainText('repeated families can increase pest and disease pressure');
  await page.locator('#crop-1').selectOption('tomato');
  await expect(page.locator('.rotation-season h3').nth(1)).toHaveText('Tomato');
  assert(!(await page.locator('.rotation-season .crop-category').nth(2).innerText()).includes('Solanaceae'), 'The following crop should break the tomato family');
  await page.getByRole('button', { name: 'Save rotation', exact: true }).click();
  await expect(page).toHaveURL(/\/planner\?field=north-field$/);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#crop-0')).toHaveValue('wheat');
  await expect(page.locator('#crop-1')).toHaveValue('tomato');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export plan', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'terrawise-north-field-rotation.json');
  await page.screenshot({ path: 'test-results/planner-desktop.png', fullPage: true });

  // Incomplete browser snapshots must be skipped safely without overwriting
  // the raw records, so the farmer can still recover or export them.
  const malformedPlans = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('terrawise.plans') || '{}');
    for (const step of stored['north-field']) step.recommendation = { crop: { id: step.recommendation.crop.id }, score: 99 };
    const raw = JSON.stringify(stored);
    localStorage.setItem('terrawise.plans', raw);
    return raw;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.rotation-season')).toHaveCount(4);
  await expect(page.getByRole('alert')).toContainText('unsupported format and were skipped');
  assert.equal(await page.evaluate(() => localStorage.getItem('terrawise.plans')), malformedPlans, 'Malformed raw plans must be preserved');
  await expect(page.locator('.decision-toolbar-source')).toContainText('Simulated demo data');

  await verifyClimateSourceTransitions();

  await page.route('https://power.larc.nasa.gov/**', route => route.abort('failed'));
  await page.evaluate(() => sessionStorage.clear());
  await page.evaluate(() => localStorage.setItem('terrawise.preferences', JSON.stringify({ name: 'QA', climateMode: 'live' })));
  await open('/planner?field=north-field');
  await expect(page.getByText('Using simulated climate', { exact: true })).toBeVisible();
  await expect(page.locator('.decision-toolbar-source')).toContainText('Simulated demo data');
  await page.evaluate(() => localStorage.setItem('terrawise.preferences', JSON.stringify({ name: 'QA', climateMode: 'demo' })));

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/recommendations?field=north-field', '/planner?field=north-field']) {
    await open(path);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} must not overflow on mobile`);
    await page.screenshot({ path: `test-results/${path.startsWith('/planner') ? 'planner' : 'recommendations'}-mobile.png`, fullPage: true });
  }

  // The planner must begin after the most recent recorded planting window.
  await page.evaluate(() => {
    const fields = [{ id: 'future-field', name: 'Future history field', location: 'Bekaa Valley', area: 2, latitude: 33.84, longitude: 35.9, water: 'limited', image: '/images/field-1.jpg', soil: { ph: 6.8, nitrogen: 28, phosphorus: 22, potassium: 165, organicMatter: 2.8 }, previousCrops: [{ cropId: 'wheat', season: 'Autumn', year: 2028 }], priorities: ['soil-health'] }];
    localStorage.setItem('terrawise.fields.v1', JSON.stringify(fields));
  });
  await open('/planner?field=future-field');
  await expect(page.locator('.rotation-season-date > span').first()).toHaveText('Spring');
  await expect(page.locator('.rotation-season-date > strong').first()).toHaveText('2029');
  await page.evaluate(() => {
    const fields = JSON.parse(localStorage.getItem('terrawise.fields.v1'));
    fields[0].previousCrops[0].season = 'Summer';
    localStorage.setItem('terrawise.fields.v1', JSON.stringify(fields));
  });
  await open('/planner?field=future-field');
  await expect(page.locator('.rotation-season-date > span').first()).toHaveText('Autumn');
  await expect(page.locator('.rotation-season-date > strong').first()).toHaveText('2028');
  await page.evaluate(() => {
    const fields = JSON.parse(localStorage.getItem('terrawise.fields.v1'));
    fields[0].previousCrops[0].season = 'Winter';
    localStorage.setItem('terrawise.fields.v1', JSON.stringify(fields));
  });
  await open('/planner?field=future-field');
  await expect(page.locator('.rotation-season-date > span').first()).toHaveText('Spring');
  await expect(page.locator('.rotation-season-date > strong').first()).toHaveText('2028');

  await page.evaluate(() => localStorage.setItem('terrawise.fields.v1', '[]'));
  await open('/recommendations');
  await expect(page.getByRole('heading', { name: 'Start with your first field' })).toBeVisible();
  await open('/planner');
  await expect(page.getByRole('heading', { name: 'A great rotation begins with a field' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('terrawise.fields.v1', '{broken'));
  await open('/recommendations');
  await expect(page.locator('.alternative-crop')).toHaveCount(4);
  await expect(page.getByRole('alert')).toContainText('Sample fields are shown');
  await expect(page.getByRole('alert')).toContainText('existing browser data was left untouched');
  assert.equal(await page.evaluate(() => localStorage.getItem('terrawise.fields.v1')), '{broken', 'Corrupt raw field records must be preserved');
  assert.deepEqual(pageErrors, [], 'Decision flows should not raise browser exceptions');
  console.log('Decision browser checks passed: ranking filters, factor details, planner edits, family breaks and penalties, persistence, export, malformed saved plans, corrupt field recovery, successful/delayed NASA field-source transitions, demo preference isolation, NASA failure labels, mobile layout, chronological history, and empty states.');
} finally {
  await browser.close();
}
