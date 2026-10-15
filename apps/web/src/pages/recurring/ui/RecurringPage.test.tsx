import { fireEvent, screen, within } from '@testing-library/react';
import { mockAccount } from '@/test/account';
import { FOOD, MAIN_ACCOUNT } from '@/test/api';
import { renderApp } from '@/test/render';
import type { Schemas } from '@/shared/api';

const RENT = {
  id: '0199d0a4-0000-7000-8000-00000000e171',
  kind: 'expense',
  name: 'Жильё',
} as const;

type CategorizedRule = Schemas['CategorizedRecurringRule'];

const rule = (overrides: Partial<CategorizedRule> = {}): CategorizedRule => ({
  id: '0199d0a4-2222-7000-8000-000000000001',
  type: 'expense',
  amount: '38000.00',
  comment: 'Аренда',
  every: 1,
  unit: 'month',
  account: {
    id: MAIN_ACCOUNT.id,
    name: MAIN_ACCOUNT.name,
    type: 'card',
    currency: 'RUB',
  },
  category: RENT,
  startOn: '2026-10-05',
  timeZone: 'Europe/Moscow',
  active: true,
  nextOn: '2026-11-05',
  lastError: null,
  ...overrides,
});

describe('RecurringPage', () => {
  it('shows when each rule pays next and why one was skipped', async () => {
    mockAccount({
      categories: [RENT],
      recurring: [
        rule(),
        rule({
          id: '0199d0a4-2222-7000-8000-000000000002',
          startOn: '2026-10-31',
          nextOn: '2026-11-30',
          comment: null,
          lastError: '31 октября: на счёте «Наличные» не хватило 500,00 ₽',
        }),
      ],
    });
    renderApp('/recurring', { session: 'authenticated' });

    const [rent, late] = await screen.findAllByRole('button', {
      name: /Жильё/,
    });
    expect(rent).toHaveTextContent(
      /раз в месяц, 5-е число · следующая 5 ноября.*Аренда.*−38\s000,00\s₽/,
    );
    // From the 29th on, the text says what a short month does.
    expect(late).toHaveTextContent(
      /раз в месяц, 31-е число или последний день месяца/,
    );
    expect(late).toHaveTextContent(
      'Пропущена: 31 октября: на счёте «Наличные» не хватило 500,00 ₽',
    );
  });

  it('creates a rule that repeats every two weeks', async () => {
    const { sent } = mockAccount({ categories: [RENT, FOOD] });
    const { user } = renderApp('/recurring', { session: 'authenticated' });
    const form = within(
      (
        await screen.findByRole('heading', {
          name: 'Новая регулярная операция',
        })
      ).closest('section')!,
    );
    await form.findByRole('option', { name: RENT.name });

    await user.type(form.getByLabelText('Сумма'), '500');
    await user.selectOptions(form.getByLabelText('Категория'), RENT.name);
    fireEvent.change(form.getByLabelText('Первый платёж'), {
      target: { value: '2026-11-05' },
    });
    await user.clear(form.getByLabelText('Повторять раз в'));
    await user.type(form.getByLabelText('Повторять раз в'), '2');
    // The unit reads as the count asks: "недели", not "неделю".
    await user.selectOptions(form.getByLabelText('Период'), 'недели');

    // The hint says what was set, before anything is sent.
    expect(form.getByText(/раз в 2 недели, четверг/)).toBeInTheDocument();

    await user.click(form.getByRole('button', { name: 'Добавить' }));

    expect(
      await screen.findByText('Регулярная операция добавлена'),
    ).toBeInTheDocument();
    expect(sent.recurring[0]).toMatchObject({ every: 2, unit: 'week' });
  });

  it('creates a rule with the date and the time zone of the browser', async () => {
    const { sent } = mockAccount({ categories: [RENT, FOOD] });
    const { user } = renderApp('/recurring', { session: 'authenticated' });
    const form = within(
      (
        await screen.findByRole('heading', {
          name: 'Новая регулярная операция',
        })
      ).closest('section')!,
    );
    await form.findByRole('option', { name: RENT.name });

    await user.type(form.getByLabelText('Сумма'), '38 000');
    await user.selectOptions(form.getByLabelText('Категория'), RENT.name);
    // user-event cannot type into a date input in jsdom.
    fireEvent.change(form.getByLabelText('Первый платёж'), {
      target: { value: '2026-11-05' },
    });
    await user.type(form.getByLabelText('Комментарий'), 'Аренда');
    await user.click(form.getByRole('button', { name: 'Добавить' }));

    expect(
      await screen.findByText('Регулярная операция добавлена'),
    ).toBeInTheDocument();
    expect(sent.recurring).toEqual([
      {
        type: 'expense',
        categoryId: RENT.id,
        accountId: MAIN_ACCOUNT.id,
        amount: '38000',
        comment: 'Аренда',
        startOn: '2026-11-05',
        every: 1,
        unit: 'month',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        active: true,
      },
    ]);
  });
});
