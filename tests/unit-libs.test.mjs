import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { firstQuery, isUuid, clampInt, sanitizeText, isIsoDate } from '../api/_lib/validate.js';
import { madridYmd, madridStartOfDay, isInMadridToday } from '../api/_lib/madrid-day.js';
import {
  resolveTvSymbolToYahoo,
  yahooSymbolFallbacks,
  resolutionToYahooInterval,
} from '../api/_lib/yahoo-chart.js';
import { MARKETS_UNIVERSE } from '../api/_lib/markets-universe.js';

describe('validate.js', () => {
  test('firstQuery aplana arrays y nulos', () => {
    assert.equal(firstQuery(['a', 'b']), 'a');
    assert.equal(firstQuery([['x']]), 'x');
    assert.equal(firstQuery(undefined), '');
    assert.equal(firstQuery(42), '42');
  });

  test('isUuid acepta v4 y rechaza basura', () => {
    assert.ok(isUuid('3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'));
    assert.ok(isUuid('  3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d  '));
    assert.ok(!isUuid('3f2b1c4d-5e6f-7a7b-8c9d-0e1f2a3b4c5d'), 'versión 7 no admitida');
    assert.ok(!isUuid("1' OR '1'='1"));
    assert.ok(!isUuid(123));
  });

  test('clampInt limita y usa fallback', () => {
    assert.equal(clampInt('50', 1, 20, 10), 20);
    assert.equal(clampInt('-3', 1, 20, 10), 1);
    assert.equal(clampInt('abc', 1, 20, 10), 10);
    assert.equal(clampInt(undefined, 1, 20, 7), 7);
  });

  test('sanitizeText recorta y trunca', () => {
    assert.equal(sanitizeText('  hola  ', 10), 'hola');
    assert.equal(sanitizeText('abcdef', 3), 'abc');
    assert.equal(sanitizeText('   ', 3), '');
    assert.equal(sanitizeText(null, 3), undefined);
  });

  test('isIsoDate valida formato YYYY-MM-DD', () => {
    assert.ok(isIsoDate('2026-09-26'));
    assert.ok(!isIsoDate('26/09/2026'));
    assert.ok(!isIsoDate('2026-9-26'));
  });

  test('isIsoDate no valida fechas imposibles', { todo: 'acepta 2026-13-45; conviene validar rango' }, () => {
    assert.ok(!isIsoDate('2026-13-45'));
  });
});

describe('madrid-day.js', () => {
  test('madridYmd usa la fecha de Madrid, no la UTC', () => {
    assert.equal(madridYmd(new Date('2026-09-25T22:30:00Z')), '2026-09-26');
    assert.equal(madridYmd(new Date('2026-01-15T23:30:00Z')), '2026-01-16');
  });

  test('inicio del día en horario de verano (UTC+2)', () => {
    const start = madridStartOfDay(new Date('2026-09-26T10:00:00Z'));
    assert.equal(start.toISOString(), '2026-09-25T22:00:00.000Z');
  });

  test('inicio del día en horario de invierno (UTC+1)', () => {
    const start = madridStartOfDay(new Date('2026-01-15T10:00:00Z'));
    assert.equal(start.toISOString(), '2026-01-14T23:00:00.000Z');
  });

  test('días de cambio de hora', () => {
    assert.equal(madridStartOfDay(new Date('2026-03-29T12:00:00Z')).toISOString(), '2026-03-28T23:00:00.000Z');
    assert.equal(madridStartOfDay(new Date('2026-10-25T12:00:00Z')).toISOString(), '2026-10-24T22:00:00.000Z');
  });

  test('isInMadridToday', () => {
    const now = new Date('2026-09-26T10:00:00Z');
    assert.ok(isInMadridToday('2026-09-25T22:30:00Z', now));
    assert.ok(!isInMadridToday('2026-09-25T21:59:00Z', now));
    assert.ok(!isInMadridToday('2026-09-26T11:00:00Z', now), 'futuro');
    assert.ok(!isInMadridToday('no es fecha', now));
  });
});

describe('yahoo-chart.js', () => {
  test('mapea símbolos estilo TradingView', () => {
    assert.equal(resolveTvSymbolToYahoo('FX:EURUSD'), 'EURUSD=X');
    assert.equal(resolveTvSymbolToYahoo('IBEX:IBEX'), '^IBEX');
    assert.equal(resolveTvSymbolToYahoo('BINANCE:BTCUSDT'), 'BTC-USD');
    assert.equal(resolveTvSymbolToYahoo('BME:SAN'), 'SAN.MC');
    assert.equal(resolveTvSymbolToYahoo('NASDAQ:AAPL'), 'AAPL');
    assert.equal(resolveTvSymbolToYahoo(''), null);
  });

  test('intervalos', () => {
    assert.equal(resolutionToYahooInterval('15'), '15m');
    assert.equal(resolutionToYahooInterval('60'), '1h');
    assert.equal(resolutionToYahooInterval('D'), '1d');
    assert.equal(resolutionToYahooInterval('raro'), '1d');
  });

  test('fallback .MC para tickers cortos', () => {
    assert.deepEqual(yahooSymbolFallbacks('ITX'), ['ITX', 'ITX.MC']);
    assert.deepEqual(yahooSymbolFallbacks('SAN.MC'), ['SAN.MC']);
  });

  test(
    'acciones españolas del catálogo se grafican en la Bolsa de Madrid',
    { todo: 'la app pide "SAN"/"BBVA" (ADR en NYSE, en USD) en vez de SAN.MC/BBVA.MC' },
    () => {
      for (const m of MARKETS_UNIVERSE.filter((x) => x.description === 'BME')) {
        assert.equal(resolveTvSymbolToYahoo(m.symbol), `${m.symbol}.MC`, m.symbol);
      }
    },
  );
});

describe('markets-universe.js', () => {
  test('símbolos únicos y categorías conocidas', () => {
    const syms = MARKETS_UNIVERSE.map((m) => m.symbol);
    assert.equal(new Set(syms).size, syms.length);
    const cats = new Set(['indices', 'divisas', 'materias', 'cripto', 'acciones']);
    for (const m of MARKETS_UNIVERSE) assert.ok(cats.has(m.category), m.symbol);
  });

  test('cripto y divisas tienen su id de proveedor', () => {
    for (const m of MARKETS_UNIVERSE) {
      if (m.category === 'cripto') assert.ok(m.coingeckoId, m.symbol);
      if (m.category === 'divisas') assert.ok(m.frankfurterTo, m.symbol);
    }
  });
});
