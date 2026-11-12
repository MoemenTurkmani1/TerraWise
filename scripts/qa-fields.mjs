import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect as playwrightExpect } from '@playwright/test';

// Run after `npm run dev`. Uses an isolated browser context; the developer's
// browser profile and existing farm records are never opened or changed.
const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
const executablePath = process.env.BROWSER_PATH || process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const expect = playwrightExpect.configure({ timeout: 15_000 });
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await mkdir('test-results', { recursive: true });

async function open(path) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, `${path} should load successfully`);
}

async function noOverflow(label) {
  // Recharts updates its SVG after ResizeObserver runs following a viewport
  // change, so assert the settled layout rather than the intermediate frame.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${label} must not overflow horizontally` }).toBe(true);
}

async function continueStep() {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

try {
  await open('/fields');
  await expect(page.getByRole('heading', { name: 'My fields', exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('terrawise.fields.v1', '[]');
    localStorage.setItem('terrawise.plans', '{}');
    localStorage.setItem('terrawise.preferences', JSON.stringify({ name: 'Field QA', climateMode: 'demo' }));
  });
  await open('/fields/new');
  await expect(page.getByRole('heading', { name: 'Let’s get to know your land', exact: true })).toBeVisible();

  // Required values and storage-adapter boundaries must agree with the wizard.
  await continueStep();
  await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#location')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#area')).toHaveAttribute('aria-invalid', 'true');
  const originalName = `QA Field ${Date.now()}`;
  await page.locator('#name').fill(originalName);
  await page.locator('#location').fill('Zahlé, Bekaa Valley');
  await expect(page.locator('#name')).toHaveAttribute('maxlength', '500');
  await page.locator('#area').fill('0.0001');
  await page.locator('#latitude').fill('91');
  await page.locator('#longitude').fill('181');
  await continueStep();
  await expect(page.locator('#area-error')).toContainText('0.001 to 1,000,000');
  await expect(page.locator('#latitude-error')).toBeVisible();
  await expect(page.locator('#longitude-error')).toBeVisible();
  await page.locator('#area').fill('1000001');
  await continueStep();
  await expect(page.locator('#area-error')).toBeVisible();
  await page.locator('#area').fill('1.25');
  await page.locator('#latitude').fill('33.85');
  await page.locator('#longitude').fill('35.9');

  // The map and typed coordinates both provide a working location workflow.
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  await map.click({ position: { x: 120, y: 100 } });
  await expect.poll(() => page.locator('#latitude').inputValue()).not.toBe('33.85');
  await page.locator('#latitude').fill('33.8467');
  await page.locator('#longitude').fill('35.9019');
  await continueStep();

  await expect(page.getByRole('heading', { name: 'A closer look at your soil', exact: true })).toBeVisible();
  for (const id of ['ph', 'nitrogen', 'phosphorus', 'potassium', 'organicMatter']) await expect(page.locator(`#${id}`)).toHaveValue('');
  await page.locator('#ph').fill('15');
  await continueStep();
  await expect(page.locator('#ph-error')).toBeVisible();
  await page.locator('#ph').fill('');
  await page.getByLabel('Rainfed', { exact: true }).check();
  await continueStep();

  await expect(page.getByRole('heading', { name: 'What grew here before?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add previous crop', exact: true }).click();
  const expectedDefault = await page.evaluate(() => {
    const now = new Date();
    const season = Math.floor(now.getMonth() / 3);
    return { season: ['Winter', 'Spring', 'Summer', 'Autumn'][(season + 3) % 4], year: String(now.getFullYear() - (season === 0 ? 1 : 0)) };
  });
  await expect(page.locator('#history-season-0')).toHaveValue(expectedDefault.season);
  await expect(page.locator('#history-year-0')).toHaveValue(expectedDefault.year);
  await page.locator('#history-crop-0').selectOption('wheat');
  await page.locator('#history-season-0').selectOption('Summer');
  await page.locator('#history-year-0').fill('2024');
  await page.getByRole('button', { name: 'Add previous crop', exact: true }).click();
  await page.locator('#history-crop-1').selectOption('tomato');
  await page.locator('#history-season-1').selectOption('Spring');
  await page.locator('#history-year-1').fill('2025');
  await continueStep();

  await expect(page.getByRole('heading', { name: 'What matters most to you?', exact: true })).toBeVisible();
  await page.locator('input[name="priorities"][value="water-saving"]').check();
  await expect(page.locator('.field-review')).toContainText('0 of 5 provided');
  await page.getByRole('button', { name: 'Save field', exact: true }).click();
  await expect(page).toHaveURL(/\/fields\/[^/]+$/);
  const fieldPath = new URL(page.url()).pathname;
  const fieldId = fieldPath.split('/').at(-1);
  await expect(page.getByRole('heading', { name: originalName, exact: true })).toBeVisible();
  await expect(page.locator('.field-soil-metrics strong')).toHaveText(['—', '—', '—', '—', '—']);
  await expect(page.locator('.field-history-timeline li').first()).toContainText('Tomato');
  await expect(page.locator('.field-history-timeline li').nth(1)).toContainText('Durum wheat');
  await expect(page.locator('.field-detail-climate .source-note')).toContainText('Simulated demo data');
  await expect(page.locator('.field-detail-climate')).toContainText('not observations for this field');
  await page.locator('.climate-data-table summary').click();
  await expect(page.locator('.climate-data-table tbody tr')).toHaveCount(12);
  await page.locator('.climate-data-table summary').click();
  await page.screenshot({ path: 'test-results/field-desktop.png', fullPage: true });

  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem('terrawise.fields.v1')).find(field => field.id === id), fieldId);
  assert.equal(saved.name, originalName);
  assert.equal(saved.latitude, 33.8467);
  assert.equal(saved.longitude, 35.9019);
  assert.equal(saved.water, 'rainfed');
  assert(['ph', 'nitrogen', 'phosphorus', 'potassium', 'organicMatter'].every(key => saved.soil[key] === null), 'Blank soil test values must persist as null, never zero');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: originalName, exact: true })).toBeVisible();

  // Edit must initialize the existing profile and retain its nullable inputs.
  await page.getByRole('link', { name: 'Edit field', exact: true }).click();
  await expect(page.locator('#name')).toHaveValue(originalName);
  const editedName = `${originalName} updated`;
  await page.locator('#name').fill(editedName);
  await continueStep();
  await expect(page.locator('#ph')).toHaveValue('');
  await page.locator('#ph').fill('6.7');
  await continueStep();
  await expect(page.locator('#history-crop-0')).toHaveValue('tomato');
  await continueStep();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${fieldPath}$`));
  await expect(page.getByRole('heading', { name: editedName, exact: true })).toBeVisible();
  await expect(page.locator('.field-soil-metrics strong').first()).toHaveText('6.7');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: editedName, exact: true })).toBeVisible();

  // Mobile detail/list/wizard layouts and chronological list summary.
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('Field detail');
  await page.screenshot({ path: 'test-results/field-mobile.png', fullPage: true });
  await open('/fields');
  await expect(page.locator('.fields-page-card')).toHaveCount(1);
  await expect(page.locator('.fields-card-bottom')).toContainText('Last: Tomato');
  await noOverflow('Field list');
  await page.getByPlaceholder('Search by field or location…').fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'No fields match your search', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.fields-page-card')).toHaveCount(1);
  await open('/fields/new');
  await expect(page.locator('#name')).toHaveValue('');
  await noOverflow('New field wizard');

  // Cancel keeps the profile. Confirmed deletion also removes its saved plan.
  await open(fieldPath);
  await page.getByRole('button', { name: 'Remove field', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Confirm field deletion' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep field', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete field', exact: true })).toHaveCount(0);
  await page.evaluate(id => {
    localStorage.setItem('terrawise.plans', JSON.stringify({ [id]: [{ season: 'Spring', year: 2027, recommendation: { crop: { id: 'wheat' }, score: 70 } }] }));
  }, fieldId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Remove field', exact: true }).click();
  await page.getByRole('button', { name: 'Delete field', exact: true }).click();
  await expect(page).toHaveURL(/\/fields$/);
  await expect(page.getByRole('heading', { name: 'Your next season starts here', exact: true })).toBeVisible();
  await noOverflow('Empty fields page');
  assert.equal(await page.evaluate(() => localStorage.getItem('terrawise.fields.v1')), '[]');
  assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('terrawise.plans') || '{}')[id], fieldId), undefined);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Your next season starts here', exact: true })).toBeVisible();
  assert.deepEqual(pageErrors, [], 'Field flows should not raise browser exceptions');
  console.log('Field browser checks passed: all four wizard steps, validation, map and coordinates, nullable soil persistence, chronological history, detail data table, edit/reload, search, mobile layout, inline deletion confirmation, and empty states.');
} catch (error) {
  await page.screenshot({ path: 'test-results/fields-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
