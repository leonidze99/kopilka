import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { mockAccount } from '@/test/account';
import { apiError, FOOD } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { API_URL } from '@/shared/config/env';

/** The panel under a heading such as "Доходы". */
const panel = async (title: string) =>
  within(
    (await screen.findByRole('heading', { name: title })).closest('section')!,
  );

describe('CategoriesPage', () => {
  it('creates a category of the chosen kind with a trimmed name', async () => {
    const { sent } = mockAccount();
    const { user } = renderApp('/categories', { session: 'authenticated' });

    await user.click(await screen.findByRole('radio', { name: 'Доход' }));
    await user.type(screen.getByLabelText('Название'), '  Кэшбэк ');
    await user.click(
      screen.getByRole('button', { name: 'Добавить категорию' }),
    );

    expect(
      await (await panel('Доходы')).findByText('Кэшбэк'),
    ).toBeInTheDocument();
    expect(sent.categories).toEqual([{ kind: 'income', name: 'Кэшбэк' }]);
    expect(screen.getByLabelText('Название')).toHaveValue('');
  });

  it('shows a duplicate name under the field', async () => {
    mockAccount({ categories: [FOOD] });
    server.use(
      http.post(`${API_URL}/categories`, () =>
        apiError(409, 'CONFLICT', 'Category with this name already exists', [
          { field: 'name', message: 'Категория с таким названием уже есть' },
        ]),
      ),
    );
    const { user } = renderApp('/categories', { session: 'authenticated' });

    await user.type(await screen.findByLabelText('Название'), FOOD.name);
    await user.click(
      screen.getByRole('button', { name: 'Добавить категорию' }),
    );

    expect(
      await screen.findByText('Категория с таким названием уже есть'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('explains why a category with transactions cannot be deleted', async () => {
    mockAccount({ categories: [FOOD] });
    server.use(
      http.delete(`${API_URL}/categories/:id`, () =>
        apiError(409, 'CATEGORY_IN_USE', 'Category has transactions'),
      ),
    );
    const { user } = renderApp('/categories', { session: 'authenticated' });
    const expenses = await panel('Расходы');

    await user.click(
      await expenses.findByRole('button', {
        name: 'Удалить категорию «Продукты»',
      }),
    );
    await user.click(
      expenses.getByRole('button', {
        name: 'Подтвердите: Удалить категорию «Продукты»',
      }),
    );

    expect(await expenses.findByRole('alert')).toHaveTextContent(
      'В категории есть операции',
    );
    expect(expenses.getByText(FOOD.name)).toBeInTheDocument();
  });

  it('deletes an unused category', async () => {
    const { state } = mockAccount({ categories: [FOOD] });
    const { user } = renderApp('/categories', { session: 'authenticated' });
    const expenses = await panel('Расходы');

    await user.click(
      await expenses.findByRole('button', {
        name: 'Удалить категорию «Продукты»',
      }),
    );
    await user.click(
      expenses.getByRole('button', {
        name: 'Подтвердите: Удалить категорию «Продукты»',
      }),
    );

    expect(await expenses.findByText('Пока пусто')).toBeInTheDocument();
    expect(state.categories).toEqual([]);
  });
});
