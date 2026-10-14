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
    const dialog = await openCategory(user, 'Расходы', FOOD.name);

    await user.click(
      dialog.getByRole('button', { name: 'Удалить категорию «Продукты»' }),
    );
    await user.click(
      dialog.getByRole('button', {
        name: 'Подтвердите: Удалить категорию «Продукты»',
      }),
    );

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'В категории есть операции',
    );
    expect((await panel('Расходы')).getByText(FOOD.name)).toBeInTheDocument();
  });

  it('deletes an unused category', async () => {
    const { state } = mockAccount({ categories: [FOOD] });
    const { user } = renderApp('/categories', { session: 'authenticated' });
    const dialog = await openCategory(user, 'Расходы', FOOD.name);

    await user.click(
      dialog.getByRole('button', { name: 'Удалить категорию «Продукты»' }),
    );
    await user.click(
      dialog.getByRole('button', {
        name: 'Подтвердите: Удалить категорию «Продукты»',
      }),
    );

    expect(
      await (await panel('Расходы')).findByText('Пока пусто'),
    ).toBeInTheDocument();
    expect(state.categories).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renames a category', async () => {
    const { state } = mockAccount({ categories: [FOOD] });
    const { user } = renderApp('/categories', { session: 'authenticated' });
    const dialog = await openCategory(user, 'Расходы', FOOD.name);

    const name = dialog.getByLabelText('Название');
    expect(name).toHaveValue(FOOD.name);
    await user.clear(name);
    await user.type(name, 'Еда');
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }));

    expect(
      await (await panel('Расходы')).findByText('Еда'),
    ).toBeInTheDocument();
    expect(state.categories).toEqual([{ ...FOOD, name: 'Еда' }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('tags', () => {
    const TRIP = { id: '0199d0a4-0000-7000-8000-0000000071a9', name: 'Отпуск' };

    it('says where tags come from while there are none', async () => {
      mockAccount();
      renderApp('/categories', { session: 'authenticated' });

      expect(
        await (await panel('Теги')).findByText('Тегов пока нет'),
      ).toBeInTheDocument();
    });

    it('renames a tag', async () => {
      const { state } = mockAccount({ tags: [TRIP] });
      const { user } = renderApp('/categories', { session: 'authenticated' });

      await user.click(
        await (await panel('Теги')).findByRole('button', { name: TRIP.name }),
      );
      const dialog = within(screen.getByRole('dialog', { name: 'Тег' }));
      await user.clear(dialog.getByLabelText('Название'));
      await user.type(dialog.getByLabelText('Название'), 'Сочи');
      await user.click(dialog.getByRole('button', { name: 'Сохранить' }));

      expect(
        await (await panel('Теги')).findByRole('button', { name: 'Сочи' }),
      ).toBeInTheDocument();
      expect(state.tags).toEqual([{ ...TRIP, name: 'Сочи' }]);
    });

    it('deletes a tag after confirmation', async () => {
      const { state } = mockAccount({ tags: [TRIP] });
      const { user } = renderApp('/categories', { session: 'authenticated' });

      await user.click(
        await (await panel('Теги')).findByRole('button', { name: TRIP.name }),
      );
      const dialog = within(screen.getByRole('dialog', { name: 'Тег' }));
      await user.click(
        dialog.getByRole('button', { name: 'Удалить тег «Отпуск»' }),
      );
      await user.click(
        dialog.getByRole('button', {
          name: 'Подтвердите: Удалить тег «Отпуск»',
        }),
      );

      expect(
        await (await panel('Теги')).findByText('Тегов пока нет'),
      ).toBeInTheDocument();
      expect(state.tags).toEqual([]);
    });
  });
});

/** Clicks a category in a panel and returns the dialog it opens. */
async function openCategory(
  user: ReturnType<typeof renderApp>['user'],
  panelTitle: string,
  name: string,
) {
  await user.click(await (await panel(panelTitle)).findByText(name));
  return within(screen.getByRole('dialog', { name: 'Категория' }));
}
