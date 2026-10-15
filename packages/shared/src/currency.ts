import { z } from 'zod';

/**
 * The currencies an account may be kept in: the rouble and every currency
 * the Bank of Russia publishes a daily rate for (its rates convert them;
 * the SDR is left out — nobody holds an account in it). ISO 4217 codes,
 * with the name for a picker.
 */
export const CURRENCIES = [
  { code: 'RUB', name: 'Российский рубль' },
  { code: 'USD', name: 'Доллар США' },
  { code: 'EUR', name: 'Евро' },
  { code: 'CNY', name: 'Китайский юань' },
  { code: 'KZT', name: 'Казахстанский тенге' },
  { code: 'BYN', name: 'Белорусский рубль' },
  { code: 'TRY', name: 'Турецкая лира' },
  { code: 'AED', name: 'Дирхам ОАЭ' },
  { code: 'GEL', name: 'Грузинский лари' },
  { code: 'AMD', name: 'Армянский драм' },
  { code: 'AZN', name: 'Азербайджанский манат' },
  { code: 'UZS', name: 'Узбекский сум' },
  { code: 'KGS', name: 'Киргизский сом' },
  { code: 'TJS', name: 'Таджикский сомони' },
  { code: 'TMT', name: 'Туркменский манат' },
  { code: 'MDL', name: 'Молдавский лей' },
  { code: 'UAH', name: 'Украинская гривна' },
  { code: 'GBP', name: 'Фунт стерлингов' },
  { code: 'CHF', name: 'Швейцарский франк' },
  { code: 'JPY', name: 'Японская иена' },
  { code: 'KRW', name: 'Южнокорейская вона' },
  { code: 'HKD', name: 'Гонконгский доллар' },
  { code: 'SGD', name: 'Сингапурский доллар' },
  { code: 'THB', name: 'Тайский бат' },
  { code: 'VND', name: 'Вьетнамский донг' },
  { code: 'IDR', name: 'Индонезийская рупия' },
  { code: 'INR', name: 'Индийская рупия' },
  { code: 'BDT', name: 'Бангладешская така' },
  { code: 'MMK', name: 'Мьянманский кьят' },
  { code: 'MNT', name: 'Монгольский тугрик' },
  { code: 'IRR', name: 'Иранский риал' },
  { code: 'QAR', name: 'Катарский риал' },
  { code: 'SAR', name: 'Саудовский риял' },
  { code: 'OMR', name: 'Оманский риал' },
  { code: 'BHD', name: 'Бахрейнский динар' },
  { code: 'EGP', name: 'Египетский фунт' },
  { code: 'DZD', name: 'Алжирский динар' },
  { code: 'ETB', name: 'Эфиопский быр' },
  { code: 'NGN', name: 'Нигерийская найра' },
  { code: 'ZAR', name: 'Южноафриканский рэнд' },
  { code: 'CAD', name: 'Канадский доллар' },
  { code: 'AUD', name: 'Австралийский доллар' },
  { code: 'NZD', name: 'Новозеландский доллар' },
  { code: 'BRL', name: 'Бразильский реал' },
  { code: 'BOB', name: 'Боливийский боливиано' },
  { code: 'CUP', name: 'Кубинское песо' },
  { code: 'PLN', name: 'Польский злотый' },
  { code: 'CZK', name: 'Чешская крона' },
  { code: 'HUF', name: 'Венгерский форинт' },
  { code: 'RON', name: 'Румынский лей' },
  { code: 'RSD', name: 'Сербский динар' },
  { code: 'DKK', name: 'Датская крона' },
  { code: 'NOK', name: 'Норвежская крона' },
  { code: 'SEK', name: 'Шведская крона' },
] as const;

export type Currency = (typeof CURRENCIES)[number]['code'];

const codes = CURRENCIES.map((currency) => currency.code) as [
  Currency,
  ...Currency[],
];

export const currencySchema = z
  .enum(codes, 'Выберите валюту')
  .meta({ id: 'Currency', example: 'RUB' });

/** What totals, budgets and analytics are counted in. */
export const baseCurrencySettingsSchema = z
  .object({ baseCurrency: currencySchema })
  .meta({ id: 'BaseCurrencySettings' });

export type BaseCurrencySettingsDto = z.infer<
  typeof baseCurrencySettingsSchema
>;
