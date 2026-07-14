import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import core from '../pos-core.js';

const {
  esc, fmt, today, uid, normP, normB,
  sBadge, shBadge, muted, emptyEl,
  cartTotal, computePaid, applyAdvance,
  returnDiff, applyBillStatusChange,
  rptDateRange, salesTotals, stockTotals, expenseByCategory, profitTotals,
  whatsAppNumber
} = core;

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<a href="x">Tom & Jerry</a>'))
      .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');
  });
  it('escapes & before other entities (no double-escaping)', () => {
    expect(esc('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
  it('returns empty string for null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
  it('stringifies non-strings', () => {
    expect(esc(42)).toBe('42');
    expect(esc(0)).toBe('0');
  });
});

describe('fmt', () => {
  it('prefixes the rupee symbol and rounds', () => {
    expect(fmt(1234.6)).toBe('₨ 1,235');
    expect(fmt(1000)).toBe('₨ 1,000');
  });
  it('coerces strings and defaults invalid input to 0', () => {
    expect(fmt('2500')).toBe('₨ 2,500');
    expect(fmt('abc')).toBe('₨ 0');
    expect(fmt(null)).toBe('₨ 0');
    expect(fmt(undefined)).toBe('₨ 0');
  });
});

describe('today', () => {
  it('returns an ISO YYYY-MM-DD date string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('reflects a mocked clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:20:30Z'));
    expect(today()).toBe('2024-03-15');
    vi.useRealTimers();
  });
});

describe('uid', () => {
  it('produces unique-ish base36 ids each call', () => {
    const a = uid();
    const b = uid();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(4);
    expect(a).not.toBe(b);
  });
});

describe('normP (product normaliser)', () => {
  it('coerces numeric fields and keeps other props', () => {
    const p = normP({ name: 'Bread', qty: '5', purchasePrice: '10.5', sellingPrice: '20', lowStockAlert: '2', shop: 'Bakery' });
    expect(p).toMatchObject({ name: 'Bread', qty: 5, purchasePrice: 10.5, sellingPrice: 20, lowStockAlert: 2, shop: 'Bakery' });
  });
  it('defaults missing/invalid numbers to 0', () => {
    const p = normP({ name: 'X' });
    expect(p.qty).toBe(0);
    expect(p.purchasePrice).toBe(0);
    expect(p.sellingPrice).toBe(0);
    expect(p.lowStockAlert).toBe(0);
  });
});

describe('normB (bill normaliser)', () => {
  it('parses a JSON string items array', () => {
    const b = normB({ items: '[{"name":"A","qty":1}]', totalAmount: '100', payableAmount: '90', amountPaid: '50' });
    expect(b.items).toEqual([{ name: 'A', qty: 1 }]);
    expect(b).toMatchObject({ totalAmount: 100, payableAmount: 90, amountPaid: 50 });
  });
  it('keeps an array items value untouched', () => {
    const items = [{ name: 'A' }];
    expect(normB({ items }).items).toEqual(items);
  });
  it('falls back to [] for invalid JSON or non-array', () => {
    expect(normB({ items: 'not-json' }).items).toEqual([]);
    expect(normB({ items: 123 }).items).toEqual([]);
    expect(normB({}).items).toEqual([]);
  });
  it('defaults numeric fields to 0', () => {
    const b = normB({ items: [] });
    expect(b).toMatchObject({ totalAmount: 0, payableAmount: 0, amountPaid: 0 });
  });
});

describe('badge helpers', () => {
  it('sBadge maps known statuses and passes through unknown', () => {
    expect(sBadge('paid')).toContain('Paid');
    expect(sBadge('unpaid')).toContain('Unpaid');
    expect(sBadge('partial')).toContain('Partial');
    expect(sBadge('mystery')).toBe('mystery');
  });
  it('shBadge distinguishes Bakery from everything else', () => {
    expect(shBadge('Bakery')).toContain('Bakery');
    expect(shBadge('Mobile')).toContain('Mobile');
    expect(shBadge('anything')).toContain('Mobile');
  });
  it('muted / emptyEl produce expected markup', () => {
    expect(muted('hi')).toBe('<span class="muted sm">hi</span>');
    expect(emptyEl('🛒', 'Empty')).toContain('padding:32px');
    expect(emptyEl('🛒', 'Empty', '10px')).toContain('padding:10px');
    expect(emptyEl('🛒', 'Empty')).toContain('Empty');
  });
});

describe('cartTotal', () => {
  it('sums price × qty across lines', () => {
    expect(cartTotal([{ price: 60, qty: 2 }, { price: 120, qty: 1 }])).toBe(240);
  });
  it('handles empty / missing input', () => {
    expect(cartTotal([])).toBe(0);
    expect(cartTotal()).toBe(0);
  });
  it('coerces string numbers and ignores invalid ones', () => {
    expect(cartTotal([{ price: '10', qty: '3' }, { price: 'x', qty: 2 }])).toBe(30);
  });
});

describe('computePaid', () => {
  it('paid status returns full payable', () => {
    expect(computePaid('paid', 500, 0)).toBe(500);
  });
  it('unpaid status returns 0', () => {
    expect(computePaid('unpaid', 500, 300)).toBe(0);
  });
  it('partial status returns the partial amount', () => {
    expect(computePaid('partial', 500, 200)).toBe(200);
    expect(computePaid('partial', 500, '150')).toBe(150);
    expect(computePaid('partial', 500, undefined)).toBe(0);
  });
});

describe('applyAdvance', () => {
  it('applies the lesser of advance and due', () => {
    expect(applyAdvance(300, 500)).toEqual({ applying: 300, effectiveDue: 0, newAdvance: 200 });
    expect(applyAdvance(500, 300)).toEqual({ applying: 300, effectiveDue: 200, newAdvance: 0 });
  });
  it('does nothing when there is no due or no advance', () => {
    expect(applyAdvance(0, 500)).toEqual({ applying: 0, effectiveDue: 0, newAdvance: 500 });
    expect(applyAdvance(400, 0)).toEqual({ applying: 0, effectiveDue: 400, newAdvance: 0 });
  });
});

describe('returnDiff', () => {
  it('positive when returned value exceeds exchanged (refund)', () => {
    expect(returnDiff(100, 2, 50, 1)).toBe(150);
  });
  it('negative when exchanged value exceeds returned (charge)', () => {
    expect(returnDiff(50, 1, 100, 1)).toBe(-50);
  });
  it('treats missing prices as 0', () => {
    expect(returnDiff(0, 1, 100, 1)).toBe(-100);
    expect(returnDiff(100, 1, 0, 1)).toBe(100);
  });
});

describe('applyBillStatusChange', () => {
  const bill = { payableAmount: 1000, amountPaid: 400 };
  it('paid marks full amount and refunds outstanding due', () => {
    expect(applyBillStatusChange(bill, 'paid')).toEqual({ newPaid: 1000, finalStatus: 'paid', dueDiff: 600 });
  });
  it('unpaid zeroes paid and increases due', () => {
    expect(applyBillStatusChange(bill, 'unpaid')).toEqual({ newPaid: 0, finalStatus: 'unpaid', dueDiff: -400 });
  });
  it('partial caps at payable and upgrades to paid when fully covered', () => {
    expect(applyBillStatusChange(bill, 'partial', 700)).toEqual({ newPaid: 700, finalStatus: 'partial', dueDiff: 300 });
    expect(applyBillStatusChange(bill, 'partial', 1200)).toEqual({ newPaid: 1000, finalStatus: 'paid', dueDiff: 600 });
    expect(applyBillStatusChange(bill, 'partial').newPaid).toBe(0);
  });
  it('unknown status leaves the bill unchanged', () => {
    expect(applyBillStatusChange(bill, 'weird')).toEqual({ newPaid: 400, finalStatus: 'weird', dueDiff: 0 });
  });
  it('defaults missing bill amounts to 0', () => {
    expect(applyBillStatusChange({}, 'paid')).toEqual({ newPaid: 0, finalStatus: 'paid', dueDiff: 0 });
  });
});

describe('rptDateRange', () => {
  const td = '2024-06-15';
  it('daily is a single day', () => {
    expect(rptDateRange('daily', {}, td)).toEqual({ from: td, to: td });
  });
  it('weekly spans the trailing 7 days', () => {
    expect(rptDateRange('weekly', {}, td)).toEqual({ from: '2024-06-09', to: td });
  });
  it('monthly starts on the 1st of the month', () => {
    expect(rptDateRange('monthly', {}, td)).toEqual({ from: '2024-06-01', to: td });
  });
  it('custom uses provided range, falling back to today', () => {
    expect(rptDateRange('custom', { from: '2024-01-01', to: '2024-01-31' }, td))
      .toEqual({ from: '2024-01-01', to: '2024-01-31' });
    expect(rptDateRange('custom', {}, td)).toEqual({ from: td, to: td });
  });
  it('defaults today when not supplied', () => {
    expect(rptDateRange('daily').from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('custom with no range object at all falls back to today', () => {
    expect(rptDateRange('custom', undefined, td)).toEqual({ from: td, to: td });
  });
});

describe('salesTotals', () => {
  it('aggregates billed, collected and pending', () => {
    const bills = [
      { payableAmount: 1000, amountPaid: 1000 },
      { payableAmount: 500, amountPaid: 200 }
    ];
    expect(salesTotals(bills)).toEqual({ billed: 1500, collected: 1200, pending: 300, count: 2 });
  });
  it('handles empty input', () => {
    expect(salesTotals([])).toEqual({ billed: 0, collected: 0, pending: 0, count: 0 });
    expect(salesTotals()).toEqual({ billed: 0, collected: 0, pending: 0, count: 0 });
  });
  it('treats missing amountPaid as 0', () => {
    expect(salesTotals([{ payableAmount: 100 }])).toEqual({ billed: 100, collected: 0, pending: 100, count: 1 });
  });
});

describe('stockTotals', () => {
  it('counts low stock, out of stock and stock value', () => {
    const products = [
      { qty: 0, purchasePrice: 10, lowStockAlert: 5 },
      { qty: 3, purchasePrice: 20, lowStockAlert: 5 },
      { qty: 50, purchasePrice: 2, lowStockAlert: 5 },
      { qty: 10, purchasePrice: 1, lowStockAlert: 0 }
    ];
    expect(stockTotals(products)).toEqual({ count: 4, low: 2, out: 1, stockValue: 170 });
  });
  it('ignores lowStockAlert of 0 for low count', () => {
    expect(stockTotals([{ qty: 1, purchasePrice: 0, lowStockAlert: 0 }]).low).toBe(0);
  });
  it('handles empty input', () => {
    expect(stockTotals()).toEqual({ count: 0, low: 0, out: 0, stockValue: 0 });
  });
});

describe('expenseByCategory', () => {
  it('totals and buckets by category with General default', () => {
    const exps = [
      { amount: 100, category: 'Rent' },
      { amount: 50, category: 'Rent' },
      { amount: 30 }
    ];
    expect(expenseByCategory(exps)).toEqual({ total: 180, byCat: { Rent: 150, General: 30 } });
  });
  it('handles empty input', () => {
    expect(expenseByCategory([])).toEqual({ total: 0, byCat: {} });
  });
});

describe('profitTotals', () => {
  it('computes revenue, costs and net', () => {
    const bills = [{ amountPaid: 800, payableAmount: 1000 }, { amountPaid: 0, payableAmount: 500 }];
    const exps = [{ amount: 100 }];
    const vp = [{ amount: 200 }];
    // revenue = 800 + 500 (falls back to payable) = 1300
    expect(profitTotals(bills, exps, vp)).toEqual({ revenue: 1300, expTotal: 100, vendorPaid: 200, net: 1000 });
  });
  it('produces a negative net (loss)', () => {
    const res = profitTotals([{ amountPaid: 100, payableAmount: 100 }], [{ amount: 300 }], []);
    expect(res.net).toBe(-200);
  });
  it('handles empty/missing inputs', () => {
    expect(profitTotals()).toEqual({ revenue: 0, expTotal: 0, vendorPaid: 0, net: 0 });
    expect(profitTotals([])).toEqual({ revenue: 0, expTotal: 0, vendorPaid: 0, net: 0 });
  });
  it('a bill with neither amountPaid nor payable contributes 0 revenue', () => {
    expect(profitTotals([{}], [], []).revenue).toBe(0);
  });
});

describe('whatsAppNumber', () => {
  it('converts a leading 0 to the 92 country code', () => {
    expect(whatsAppNumber('0300-1234567')).toBe('923001234567');
  });
  it('strips non-digits and keeps an existing country code', () => {
    expect(whatsAppNumber('+92 300 1234567')).toBe('923001234567');
  });
  it('handles empty / nullish input', () => {
    expect(whatsAppNumber('')).toBe('');
    expect(whatsAppNumber(null)).toBe('');
  });
});
