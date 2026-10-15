import { screen } from '@testing-library/react';
import { mockAccount } from '@/test/account';
import { FOOD, MAIN_ACCOUNT } from '@/test/api';
import { renderApp } from '@/test/render';

const DOLLARS = {
  id: '0199d0a4-0000-7000-8000-0000000acc0d',
  name: 'Карта в долларах',
  type: 'card',
  currency: 'USD',
  openingBalance: '0.00',
  allowNegative: true,
  balance: '0.00',
} as const;

describe('TransactionForm in other currencies', () => {
  it('takes the amount in the account’s currency, and in roubles if known', async () => {
    const { sent } = mockAccount({
      accounts: [MAIN_ACCOUNT, DOLLARS],
      categories: [FOOD],
    });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findAllByRole('option', { name: DOLLARS.name });
    // A rouble account asks for nothing more.
    expect(
      screen.queryByLabelText('В основной валюте'),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Счёт'), DOLLARS.name);
    await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
    await user.type(screen.getByLabelText('Сумма'), '10');
    await user.type(screen.getByLabelText('В основной валюте'), '925,5');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    expect(await screen.findByText('Операция добавлена')).toBeInTheDocument();
    expect(sent.transactions).toEqual([
      expect.objectContaining({
        accountId: DOLLARS.id,
        amount: '10',
        baseAmount: '925.5',
      }),
    ]);
  });

  it('leaves the conversion to the Bank of Russia rate when left empty', async () => {
    const { sent } = mockAccount({
      accounts: [MAIN_ACCOUNT, DOLLARS],
      categories: [FOOD],
    });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findAllByRole('option', { name: DOLLARS.name });

    await user.selectOptions(screen.getByLabelText('Счёт'), DOLLARS.name);
    await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
    await user.type(screen.getByLabelText('Сумма'), '10');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    expect(await screen.findByText('Операция добавлена')).toBeInTheDocument();
    expect(sent.transactions[0]).not.toHaveProperty('baseAmount');
  });

  it('asks what arrived on a transfer between two currencies', async () => {
    const { sent } = mockAccount({ accounts: [MAIN_ACCOUNT, DOLLARS] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findAllByRole('option', { name: DOLLARS.name });

    await user.click(screen.getByRole('radio', { name: 'Перевод' }));
    await user.selectOptions(screen.getByLabelText('На счёт'), DOLLARS.name);
    await user.type(screen.getByLabelText('Сумма'), '9250');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    // Required: the bank's rate is not known in advance.
    expect(
      await screen.findByLabelText('Зачислено'),
    ).toHaveAccessibleDescription(/./);
    expect(sent.transactions).toEqual([]);

    await user.type(screen.getByLabelText('Зачислено'), '100');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    expect(await screen.findByText('Перевод сохранён')).toBeInTheDocument();
    expect(sent.transactions).toEqual([
      expect.objectContaining({
        type: 'transfer',
        amount: '9250',
        toAccountId: DOLLARS.id,
        toAmount: '100',
      }),
    ]);
  });
});
