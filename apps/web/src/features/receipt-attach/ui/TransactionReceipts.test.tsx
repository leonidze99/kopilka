import { fireEvent, screen, within } from '@testing-library/react';
import { mockAccount } from '@/test/account';
import { FOOD, transaction } from '@/test/api';
import { renderApp } from '@/test/render';

const RECEIPT = {
  id: '0199d0a4-0000-7000-8000-0000000c0de1',
  width: 800,
  height: 1200,
  size: 120_000,
  createdAt: '2026-10-05T12:00:00.000Z',
};

const photo = (name = 'check.jpg', type = 'image/jpeg', size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

/** Opens the transaction with the comment "Ужин" and returns its dialog. */
async function openDinner(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByText('Ужин'));
  return within(screen.getByRole('dialog', { name: 'Операция' }));
}

describe('TransactionReceipts', () => {
  it('shows the photos of a transaction and adds one as soon as it is picked', async () => {
    const { sent, state } = mockAccount({
      categories: [FOOD],
      transactions: [transaction({ comment: 'Ужин', receipts: [RECEIPT] })],
    });
    const { user } = renderApp('/', { session: 'authenticated' });
    // The row says there is a photo.
    expect(
      await screen.findByRole('button', { name: /есть фото чека.*Ужин/ }),
    ).toBeInTheDocument();
    const dialog = await openDinner(user);

    expect(
      dialog.getByRole('button', { name: 'Фото чека 1' }),
    ).toBeInTheDocument();
    await user.upload(dialog.getByLabelText('Добавить фото чека'), photo());

    expect(
      await dialog.findByRole('button', { name: 'Фото чека 2' }),
    ).toBeInTheDocument();
    expect(sent.receipts).toEqual([
      { transactionId: state.transactions[0]!.id, name: 'check.jpg' },
    ]);
  });

  it('opens a photo and deletes it after confirmation', async () => {
    const { state } = mockAccount({
      categories: [FOOD],
      transactions: [transaction({ comment: 'Ужин', receipts: [RECEIPT] })],
    });
    const { user } = renderApp('/', { session: 'authenticated' });
    const dialog = await openDinner(user);

    await user.click(dialog.getByRole('button', { name: 'Фото чека 1' }));
    const viewer = within(screen.getByRole('dialog', { name: 'Фото чека' }));
    expect(
      await viewer.findByRole('img', { name: 'Фото чека' }),
    ).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    await user.click(viewer.getByRole('button', { name: 'Удалить фото чека' }));
    await user.click(
      viewer.getByRole('button', { name: 'Подтвердите: Удалить фото чека' }),
    );

    expect(await screen.findByText('Фото удалено')).toBeInTheDocument();
    expect(
      dialog.queryByRole('button', { name: 'Фото чека 1' }),
    ).not.toBeInTheDocument();
    expect(state.transactions[0]!.receipts).toEqual([]);
  });

  it('says why a photo is not sent: HEIC, or too large', async () => {
    const { sent } = mockAccount({
      categories: [FOOD],
      transactions: [transaction({ comment: 'Ужин' })],
    });
    const { user } = renderApp('/', { session: 'authenticated' });
    const dialog = await openDinner(user);
    const input = dialog.getByLabelText('Добавить фото чека');

    // fireEvent: user.upload would drop a file the accept list excludes,
    // as the picker does — but a drag or "all files" in the picker does not.
    fireEvent.change(input, {
      target: { files: [photo('IMG_0001.HEIC', 'image/heic')] },
    });
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      '«IMG_0001.HEIC» в формате HEIC — сохраните фото как JPEG',
    );

    fireEvent.change(input, {
      target: { files: [photo('big.jpg', 'image/jpeg', 16 * 1024 * 1024)] },
    });
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      '«big.jpg» больше 15 МБ',
    );
    expect(sent.receipts).toEqual([]);
  });
});
