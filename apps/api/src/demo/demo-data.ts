import { addMonths, todayIn } from '../recurring/schedule.js';

/**
 * The demo account: a few months of a believable budget, generated
 * relative to "now" so the demo never looks stale. A seeded random number
 * generator keeps it the same on every run of the same day. Pure data, no
 * database: the seed writes it, the unit test checks it.
 */

export const DEMO_EMAIL = 'demo@kopilka.test';
/** Not a secret: the demo account is public by design. */
export const DEMO_PASSWORD = 'kopilka-demo';
export const DEMO_TIME_ZONE = 'Europe/Moscow';
/** Moscow has no daylight saving time: local = UTC + 3 all year. */
const OFFSET = '+03:00';
/** Full months before the current one. */
const MONTHS_BACK = 3;

export type AccountKey = 'card' | 'cash' | 'savings';
export type CategoryKey =
  | 'groceries'
  | 'cafe'
  | 'transport'
  | 'housing'
  | 'health'
  | 'fun'
  | 'subscriptions'
  | 'salary'
  | 'freelance'
  | 'cashback';
export type RuleKey = 'rent' | 'music' | 'savings';

interface Money {
  account: AccountKey;
  /** Positive, "1234.50". */
  amount: string;
  comment: string | null;
}

/** An income or expense (by its category), or a transfer. */
export type DemoTransaction = Money & { occurredAt: Date } & (
    | { category: CategoryKey; toAccount?: never }
    | { toAccount: AccountKey; category?: never }
  ) & {
    /** Made by a recurring rule, for its occurrence on this date. */
    rule?: { key: RuleKey; on: string };
  };

export type DemoRule = Money & {
  key: RuleKey;
  startOn: string;
  nextOn: string;
  nextIndex: number;
} & (
    | { category: CategoryKey; toAccount?: never }
    | { toAccount: AccountKey; category?: never }
  );

export interface DemoData {
  accounts: {
    key: AccountKey;
    name: string;
    type: 'card' | 'cash' | 'savings';
    openingBalance: string;
    allowNegative: boolean;
  }[];
  /** In creation order: it sets the category colours. */
  categories: { key: CategoryKey; kind: 'income' | 'expense'; name: string }[];
  rules: DemoRule[];
  transactions: DemoTransaction[];
  budgets: {
    category: CategoryKey;
    amount: string | null;
    effectiveFrom: string;
  }[];
}

const ACCOUNTS: DemoData['accounts'] = [
  {
    key: 'card',
    name: 'Основной счёт',
    type: 'card',
    openingBalance: '42000',
    allowNegative: true,
  },
  {
    key: 'cash',
    name: 'Наличные',
    type: 'cash',
    openingBalance: '3000',
    allowNegative: false,
  },
  {
    key: 'savings',
    name: 'Накопления',
    type: 'savings',
    openingBalance: '150000',
    allowNegative: false,
  },
];

const CATEGORIES: DemoData['categories'] = [
  { key: 'groceries', kind: 'expense', name: 'Продукты' },
  { key: 'cafe', kind: 'expense', name: 'Кафе и рестораны' },
  { key: 'transport', kind: 'expense', name: 'Транспорт' },
  { key: 'housing', kind: 'expense', name: 'Жильё' },
  { key: 'health', kind: 'expense', name: 'Здоровье' },
  { key: 'fun', kind: 'expense', name: 'Развлечения' },
  { key: 'subscriptions', kind: 'expense', name: 'Подписки' },
  { key: 'salary', kind: 'income', name: 'Зарплата' },
  { key: 'freelance', kind: 'income', name: 'Фриланс' },
  { key: 'cashback', kind: 'income', name: 'Кэшбэк' },
];

/** mulberry32: tiny, fast, good enough to make up a budget. */
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    chance: (probability: number) => next() < probability,
    /** A whole number of `step`s between min and max. */
    amount: (min: number, max: number, step = 10) =>
      (Math.round((min + next() * (max - min)) / step) * step).toFixed(2),
    /** With kopecks, as a supermarket receipt. */
    receipt: (min: number, max: number) =>
      (Math.round((min + next() * (max - min)) * 100) / 100).toFixed(2),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)] as T,
    time: (fromHour: number, toHour: number) => {
      const minutes = Math.floor(next() * (toHour - fromHour) * 60);
      return `${String(fromHour + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    },
  };
}

const at = (date: string, time: string) =>
  new Date(`${date}T${time}:00${OFFSET}`);

const dayOf = (month: string, day: number) =>
  `${month}-${String(day).padStart(2, '0')}`;

const daysIn = (month: string) => {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
};

/** 0 = Sunday, from a "YYYY-MM-DD" date. */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function buildDemoData(now: Date): DemoData {
  const today = todayIn(DEMO_TIME_ZONE, now);
  const first = addMonths(`${today.slice(0, 7)}-01`, -MONTHS_BACK);
  const months = Array.from({ length: MONTHS_BACK + 1 }, (_, n) =>
    addMonths(first, n).slice(0, 7),
  );
  const rng = random(20261012);
  const transactions: DemoTransaction[] = [];
  const add = (
    date: string,
    time: string,
    entry: Omit<DemoTransaction, 'occurredAt'>,
  ) => {
    // Up to this moment: a demo with tonight's groceries already bought
    // would look odd.
    const occurredAt = at(date, time);
    if (occurredAt <= now) {
      transactions.push({ ...entry, occurredAt } as DemoTransaction);
    }
  };

  // Recurring rules, with every occurrence so far already made.
  const ruleTemplates: Omit<DemoRule, 'startOn' | 'nextOn' | 'nextIndex'>[] = [
    {
      key: 'rent',
      account: 'card',
      category: 'housing',
      amount: '38000.00',
      comment: 'Аренда квартиры',
    },
    {
      key: 'savings',
      account: 'card',
      toAccount: 'savings',
      amount: '15000.00',
      comment: 'Откладываю',
    },
    {
      key: 'music',
      account: 'card',
      category: 'subscriptions',
      amount: '299.00',
      comment: 'Яндекс Плюс',
    },
  ];
  const ruleDays: Record<RuleKey, number> = { rent: 5, savings: 11, music: 15 };
  const rules = ruleTemplates.map((template) => {
    const startOn = dayOf(months[0] ?? '', ruleDays[template.key]);
    let index = 0;
    for (; addMonths(startOn, index) <= today; index++) {
      const on = addMonths(startOn, index);
      // The runner dates a payment at the start of its day.
      add(on, '00:00', { ...template, rule: { key: template.key, on } } as Omit<
        DemoTransaction,
        'occurredAt'
      >);
    }
    return {
      ...template,
      startOn,
      nextIndex: index,
      nextOn: addMonths(startOn, index),
    } as DemoRule;
  });

  for (const [n, month] of months.entries()) {
    const day = (d: number) => dayOf(month, Math.min(d, daysIn(month)));

    add(day(10), '09:12', {
      account: 'card',
      category: 'salary',
      amount: '50000.00',
      comment: 'Аванс',
    });
    add(day(25), '09:05', {
      account: 'card',
      category: 'salary',
      amount: '70000.00',
      comment: 'Зарплата',
    });
    if (n % 2 === 1) {
      add(day(18), '16:40', {
        account: 'card',
        category: 'freelance',
        amount: rng.amount(15000, 35000, 500),
        comment: 'Лендинг для клиента',
      });
    }
    add(day(1), '03:00', {
      account: 'card',
      category: 'cashback',
      amount: rng.amount(400, 1400),
      comment: 'Кэшбэк за прошлый месяц',
    });
    add(day(20), '19:30', {
      account: 'card',
      category: 'housing',
      amount: rng.receipt(4300, 6200),
      comment: 'ЖКУ',
    });
    add(day(22), '08:00', {
      account: 'card',
      category: 'subscriptions',
      amount: '149.00',
      comment: 'iCloud',
    });
    add(day(2), '18:20', {
      account: 'card',
      toAccount: 'cash',
      amount: '5000.00',
      comment: 'Снятие в банкомате',
    });

    for (let d = 1; d <= daysIn(month); d++) {
      const date = day(d);
      const workday = weekday(date) !== 0 && weekday(date) !== 6;
      if (rng.chance(0.45)) {
        add(date, rng.time(18, 22), {
          account: 'card',
          category: 'groceries',
          amount: rng.receipt(450, 3800),
          comment: rng.pick(['Пятёрочка', 'Перекрёсток', 'ВкусВилл', 'Лента']),
        });
      }
      if (rng.chance(0.12)) {
        add(date, rng.time(10, 14), {
          account: 'cash',
          category: 'groceries',
          amount: rng.amount(250, 900),
          comment: 'Рынок',
        });
      }
      if (rng.chance(workday ? 0.3 : 0.2)) {
        add(date, rng.time(12, 15), {
          account: 'card',
          category: 'cafe',
          amount: rng.amount(280, 1900),
          comment: rng.pick([
            'Обед',
            'Кофе с собой',
            'Шоколадница',
            'Суши с друзьями',
          ]),
        });
      }
      if (workday && rng.chance(0.75)) {
        add(date, rng.time(8, 10), {
          account: 'card',
          category: 'transport',
          amount: '66.00',
          comment: 'Метро',
        });
      }
      if (rng.chance(0.08)) {
        add(date, rng.time(20, 23), {
          account: 'card',
          category: 'transport',
          amount: rng.amount(350, 1200),
          comment: 'Яндекс Такси',
        });
      }
      if (rng.chance(0.04)) {
        add(date, rng.time(11, 20), {
          account: 'card',
          category: 'health',
          amount: rng.amount(400, 3500),
          comment: 'Аптека',
        });
      }
      if (!workday && rng.chance(0.35)) {
        add(date, rng.time(15, 21), {
          account: rng.chance(0.3) ? 'cash' : 'card',
          category: 'fun',
          amount: rng.amount(500, 3000),
          comment: rng.pick(['Кино', 'Боулинг', 'Концерт', 'Музей', 'Квиз']),
        });
      }
    }
  }

  transactions.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const thisMonth = months.at(-1) ?? '';
  return {
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    rules,
    transactions,
    budgets: [
      // Versions: groceries went up this month; earlier months keep 30 000.
      { category: 'groceries', amount: '30000.00', effectiveFrom: first },
      {
        category: 'groceries',
        amount: '35000.00',
        effectiveFrom: `${thisMonth}-01`,
      },
      { category: 'cafe', amount: '8000.00', effectiveFrom: first },
      {
        category: 'fun',
        amount: '6000.00',
        effectiveFrom: `${months.at(-2) ?? thisMonth}-01`,
      },
    ],
  };
}
