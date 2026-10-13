import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Experimentar a agenda' }).click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByRole('heading', { name: 'Horários do dia' })).toBeVisible();
}
async function fill(page: Page, purpose: string, start = '12:00', end = '13:00') {
  await page.getByLabel('Início', { exact: true }).fill(start);
  await page.getByLabel('Fim', { exact: true }).fill(end);
  await page.getByLabel('Finalidade', { exact: true }).fill(purpose);
}
async function keyboardFocus(page: Page, target: Locator) {
  for (let step = 0; step < 150; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard target was not reachable');
}
test('real booking conflict preserves draft, then reschedule/cancel/history persist on desktop and mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await fill(page, 'E2E fictício', '09:00', '10:00');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('já está reservado');
  await expect(page.getByLabel('Finalidade')).toHaveValue('E2E fictício');
  await page.getByRole('button', { name: 'Atualizar agenda' }).click();
  await expect(page.getByLabel('Finalidade')).toHaveValue('E2E fictício');
  await page.getByLabel('Recurso', { exact: true }).selectOption({ label: 'Kit Áudio 01' });
  await fill(page, 'E2E fictício');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByText('Reserva confirmada.', { exact: true })).toBeVisible();
  await page.locator('button.booking-row').filter({ hasText: 'E2E fictício' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico da reserva' })).toBeVisible();
  await page.getByRole('button', { name: 'Remarcar', exact: true }).click();
  await page.getByLabel('Recurso da remarcação').selectOption({ label: 'Sala Brisa' });
  await fill(page, 'E2E fictício remarcado', '16:00', '17:00');
  await page.getByLabel('Motivo da remarcação').fill('Ajuste fictício E2E');
  await page.getByRole('button', { name: 'Salvar remarcação' }).click();
  await expect(page.getByText('Confirmada · versão 2', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await page.getByLabel('Motivo do cancelamento').fill('Cancelamento fictício E2E');
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByText('Cancelada · versão 3', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Cancelada · versão 3', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('another visitor cannot read a booking and reset in another tab refuses an old draft', async ({
  page,
  browser,
}) => {
  await start(page);
  await page.getByLabel('Recurso', { exact: true }).selectOption({ label: 'Kit Áudio 01' });
  await fill(page, 'Isolamento fictício');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByText('Reserva confirmada.', { exact: true })).toBeVisible();
  await page.locator('button.booking-row').filter({ hasText: 'Isolamento fictício' }).click();
  const detail = new URL(page.url()).pathname;
  const foreign = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: 'pt-BR',
  });
  try {
    const other = await foreign.newPage();
    await start(other);
    const response = await other.request.get(`/api/reservations/${detail.split('/').at(-1)}`);
    expect(response.status()).toBe(404);
  } finally {
    await foreign.close();
  }
  const old = await page.context().newPage();
  await old.goto('/agenda');
  await old.getByLabel('Recurso', { exact: true }).selectOption({ label: 'Kit Áudio 01' });
  await fill(old, 'Rascunho da geração antiga', '14:00', '15:00');
  await page.getByRole('button', { name: 'Reiniciar demo' }).click();
  await page.getByRole('button', { name: 'Reiniciar demonstração', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/\/agenda$/);
  await old.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(old.getByRole('alert')).toContainText('ambiente');
  await expect(old.getByLabel('Finalidade')).toHaveValue('Rascunho da geração antiga');
  await old.close();
});
test('keyboard can select an interval, confirm and cancel; reset dialog traps and restores focus', async ({
  page,
}) => {
  await page.goto('/');
  const enter = page.getByRole('button', { name: 'Experimentar a agenda' });
  await keyboardFocus(page, enter);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/agenda$/);
  const slot = page.getByRole('button', { name: 'Selecionar 11:00 até 12:00', exact: true });
  await keyboardFocus(page, slot);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Início')).toHaveValue('11:00');
  await keyboardFocus(page, page.getByLabel('Finalidade'));
  await page.keyboard.type('Reserva fictícia por teclado');
  await keyboardFocus(page, page.getByRole('button', { name: 'Confirmar reserva' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Reserva confirmada.', { exact: true })).toBeVisible();
  const booking = page
    .locator('button.booking-row')
    .filter({ hasText: 'Reserva fictícia por teclado' });
  await keyboardFocus(page, booking);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Histórico da reserva' })).toBeVisible();
  await keyboardFocus(page, page.getByRole('button', { name: 'Cancelar reserva', exact: true }));
  await page.keyboard.press('Enter');
  await keyboardFocus(page, page.getByLabel('Motivo do cancelamento'));
  await page.keyboard.type('Cancelamento fictício por teclado');
  await keyboardFocus(page, page.getByRole('button', { name: 'Confirmar cancelamento' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Cancelada · versão 2', { exact: true })).toBeVisible();
  const reset = page.getByRole('button', { name: 'Reiniciar demo' });
  await keyboardFocus(page, reset);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manter ambiente' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Reiniciar demonstração', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Manter ambiente' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(reset).toBeFocused();
});
