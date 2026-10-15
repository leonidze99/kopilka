import { CURRENCIES, type Currency } from '@kopilka/shared';
import { useState } from 'react';
import {
  useBaseCurrency,
  useSetBaseCurrencyMutation,
} from '@/entities/session';
import { errorMessage } from '@/shared/lib';
import { Button, Form, FormError, SelectField, toast } from '@/shared/ui';
import styles from './BaseCurrencyForm.module.css';

/**
 * The currency totals, budgets and analytics are counted in. A change
 * converts everything on the server, so it is a deliberate button press,
 * not a select that applies itself.
 */
export function BaseCurrencyForm() {
  const current = useBaseCurrency();
  const [chosen, setChosen] = useState<Currency>(current);
  const [setBaseCurrency, { isLoading, error }] = useSetBaseCurrencyMutation();

  return (
    <Form
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await setBaseCurrency({ baseCurrency: chosen });
        if (!result.error) toast('Основная валюта изменена');
      }}
    >
      <SelectField
        label="Основная валюта"
        value={chosen}
        onChange={(event) => setChosen(event.target.value as Currency)}
      >
        {CURRENCIES.map(({ code, name }) => (
          <option key={code} value={code}>
            {code} — {name}
          </option>
        ))}
      </SelectField>
      <p className={styles.hint}>
        В ней итоги, бюджеты и аналитика. Счета остаются в своих валютах.
        Операции пересчитаются по курсу ЦБ на их дату, лимиты бюджетов — по
        сегодняшнему курсу.
      </p>
      <FormError message={error && errorMessage(error)} />
      <Button
        type="submit"
        variant="secondary"
        loading={isLoading}
        disabled={chosen === current}
      >
        Пересчитать в {chosen}
      </Button>
    </Form>
  );
}
