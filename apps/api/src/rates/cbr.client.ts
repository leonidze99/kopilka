import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';

/** A rate as the Bank of Russia sets it: roubles for one unit, from a day. */
export interface CbrRate {
  /** ISO 4217, e.g. "USD". */
  currency: string;
  /** "2026-10-10": in effect from this day until the next rate. */
  onDate: string;
  /** Roubles for one unit (the published value over its nominal). */
  rate: Prisma.Decimal;
}

/** The daily list also names each currency's id, which ranges ask by. */
export interface CbrDaily {
  rates: CbrRate[];
  /** "USD" -> "R01235". */
  ids: Map<string, string>;
}

const TIMEOUT_MS = 10_000;

/** "10.10.2026" -> "2026-10-10". */
const isoDate = (date: string) => date.split('.').reverse().join('-');

/** "2026-10-10" -> "10/10/2026", as the query strings want it. */
const cbrDate = (date: string) => date.split('-').reverse().join('/');

/** "83,5588" over a nominal of 100 -> 0.835588. */
const perUnit = (value: string, nominal: string) =>
  new Prisma.Decimal(value.replace(',', '.')).dividedBy(nominal);

const field = (xml: string, name: string) =>
  new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

/**
 * The Bank of Russia's public XML service: no key, no limits published.
 * Only what the app uses is read; the documents are windows-1251, but
 * every field read is ASCII, so latin1 decodes them well enough.
 */
@Injectable()
export class CbrClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('CBR_URL', { infer: true });
  }

  /** The latest rates set: today's, or tomorrow's once published. */
  async daily(): Promise<CbrDaily> {
    const xml = await this.get('XML_daily.asp');
    const onDate = isoDate(/<ValCurs Date="([\d.]+)"/.exec(xml)?.[1] ?? '');
    const rates: CbrRate[] = [];
    const ids = new Map<string, string>();
    for (const [, id, body] of xml.matchAll(
      /<Valute ID="([^"]+)">([\s\S]*?)<\/Valute>/g,
    )) {
      const currency = field(body!, 'CharCode');
      const nominal = field(body!, 'Nominal');
      const value = field(body!, 'Value');
      if (!currency || !nominal || !value) continue;
      ids.set(currency, id!);
      rates.push({ currency, onDate, rate: perUnit(value, nominal) });
    }
    if (!onDate || rates.length === 0) {
      throw new Error('Bank of Russia daily rates: unexpected document');
    }
    return { rates, ids };
  }

  /** Every rate of one currency set within [from, to]. */
  async range(
    currency: string,
    id: string,
    from: string,
    to: string,
  ): Promise<CbrRate[]> {
    const xml = await this.get(
      `XML_dynamic.asp?date_req1=${cbrDate(from)}&date_req2=${cbrDate(to)}&VAL_NM_RQ=${id}`,
    );
    const rates: CbrRate[] = [];
    for (const [, date, body] of xml.matchAll(
      /<Record Date="([\d.]+)"[^>]*>([\s\S]*?)<\/Record>/g,
    )) {
      const nominal = field(body!, 'Nominal');
      const value = field(body!, 'Value');
      if (!nominal || !value) continue;
      rates.push({
        currency,
        onDate: isoDate(date!),
        rate: perUnit(value, nominal),
      });
    }
    return rates;
  }

  private async get(path: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Bank of Russia: HTTP ${response.status} for ${path}`);
    }
    return Buffer.from(await response.arrayBuffer()).toString('latin1');
  }
}
