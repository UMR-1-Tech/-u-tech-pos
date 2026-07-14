/* ================================================
   U-Tech-POS — Core business logic
   NAWAB BAKERS AND MOBILE

   Pure, DOM-independent helpers shared by index.html
   (loaded as a classic <script>) and the unit test
   suite (required as a CommonJS module in Node).

   Keep this file free of any `document`, `window`,
   `localStorage` or global-state (CUR / DB) access so
   every export stays unit-testable in isolation.
   ================================================ */
'use strict';

/* ── Formatting / small helpers ── */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = n => '₨ ' + Math.round(+n || 0).toLocaleString();

const today = () => new Date().toISOString().slice(0, 10);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ── Record normalisers ── */
const normP = p => ({
  ...p,
  qty: +p.qty || 0,
  purchasePrice: +(p.purchasePrice || p['purchasePrice']) || 0,
  sellingPrice: +(p.sellingPrice || p['sellingPrice']) || 0,
  lowStockAlert: +(p.lowStockAlert || p['lowStockAlert']) || 0
});

function normB(b) {
  let items = b.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  if (!Array.isArray(items)) items = [];
  return {
    ...b, items,
    totalAmount: +b.totalAmount || 0,
    payableAmount: +b.payableAmount || 0,
    amountPaid: +b.amountPaid || 0
  };
}

/* ── Badges / snippets ── */
function sBadge(s) {
  return {
    paid: '<span class="badge b-green">Paid</span>',
    unpaid: '<span class="badge b-red">Unpaid</span>',
    partial: '<span class="badge b-amber">Partial</span>'
  }[s] || s;
}
function shBadge(s) {
  return s === 'Bakery'
    ? '<span class="badge b-blue">Bakery</span>'
    : '<span class="badge b-purple">Mobile</span>';
}
function muted(s) { return `<span class="muted sm">${s}</span>`; }
function emptyEl(ic, tx, p = '32px') {
  return `<div class="empty" style="padding:${p}"><div class="empty-ic">${ic}</div><div class="empty-tx">${tx}</div></div>`;
}

/* ── Billing calculations ── */
// Sum of price × qty for every cart line.
function cartTotal(cart) {
  return (cart || []).reduce((s, i) => s + (+i.price || 0) * (+i.qty || 0), 0);
}

// Amount actually paid given the selected payment status.
// `partial` is only consulted for the 'partial' status.
function computePaid(status, payable, partial) {
  payable = +payable || 0;
  if (status === 'unpaid') return 0;
  if (status === 'partial') return +partial || 0;
  return payable;
}

// Apply a customer's advance credit against an outstanding due.
// Returns how much was applied plus the remaining due & advance.
function applyAdvance(due, advance) {
  due = +due || 0;
  advance = +advance || 0;
  let applying = 0;
  if (advance > 0 && due > 0) applying = Math.min(advance, due);
  return { applying, effectiveDue: due - applying, newAdvance: advance - applying };
}

/* ── Returns / exchange ── */
// Positive diff => refund to customer, negative => extra charge.
function returnDiff(returnedPrice, returnedQty, exchangePrice, exchangeQty) {
  const r = (+returnedPrice || 0) * (+returnedQty || 0);
  const x = (+exchangePrice || 0) * (+exchangeQty || 0);
  return r - x;
}

// Recompute a bill's paid amount / status after a return-driven status change.
function applyBillStatusChange(bill, newStatus, partialPaid) {
  const payable = +bill.payableAmount || 0;
  const oldPaid = +bill.amountPaid || 0;
  let newPaid = oldPaid;
  let finalStatus = newStatus;
  if (newStatus === 'paid') { newPaid = payable; finalStatus = 'paid'; }
  else if (newStatus === 'partial') {
    newPaid = Math.min(+partialPaid || 0, payable);
    finalStatus = newPaid >= payable ? 'paid' : 'partial';
  } else if (newStatus === 'unpaid') { newPaid = 0; finalStatus = 'unpaid'; }
  const oldDue = payable - oldPaid;
  const newDue = payable - newPaid;
  return { newPaid, finalStatus, dueDiff: oldDue - newDue };
}

/* ── Reports ── */
// Resolve the {from,to} date window for a report period.
function rptDateRange(period, custom, todayStr) {
  const td = todayStr || today();
  if (period === 'daily') return { from: td, to: td };
  if (period === 'weekly') {
    const d = new Date(td + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: td };
  }
  if (period === 'monthly') return { from: td.slice(0, 7) + '-01', to: td };
  custom = custom || {};
  return { from: custom.from || td, to: custom.to || td };
}

function salesTotals(bills) {
  bills = bills || [];
  const billed = bills.reduce((s, b) => s + (+b.payableAmount || 0), 0);
  const collected = bills.reduce((s, b) => s + (+b.amountPaid || 0), 0);
  return { billed, collected, pending: billed - collected, count: bills.length };
}

function stockTotals(products) {
  products = products || [];
  const low = products.filter(p => p.lowStockAlert > 0 && p.qty <= p.lowStockAlert);
  const out = products.filter(p => p.qty === 0);
  const stockValue = products.reduce((s, p) => s + (+p.qty || 0) * (+p.purchasePrice || 0), 0);
  return { count: products.length, low: low.length, out: out.length, stockValue };
}

function expenseByCategory(expenses) {
  expenses = expenses || [];
  const total = expenses.reduce((s, e) => s + (+e.amount || 0), 0);
  const byCat = {};
  expenses.forEach(e => { const c = e.category || 'General'; byCat[c] = (byCat[c] || 0) + (+e.amount || 0); });
  return { total, byCat };
}

function profitTotals(bills, expenses, vendorPayments) {
  bills = bills || [];
  const revenue = bills.reduce((s, b) => s + (+b.amountPaid || +b.payableAmount || 0), 0);
  const expTotal = (expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
  const vendorPaid = (vendorPayments || []).reduce((s, p) => s + (+p.amount || 0), 0);
  return { revenue, expTotal, vendorPaid, net: revenue - vendorPaid - expTotal };
}

/* ── WhatsApp ── */
// Normalise a Pakistani phone number to international (92…) form.
function whatsAppNumber(phone) {
  let c = String(phone || '').replace(/[^0-9]/g, '');
  if (c.startsWith('0')) c = '92' + c.slice(1);
  return c;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    esc, fmt, today, uid, normP, normB,
    sBadge, shBadge, muted, emptyEl,
    cartTotal, computePaid, applyAdvance,
    returnDiff, applyBillStatusChange,
    rptDateRange, salesTotals, stockTotals, expenseByCategory, profitTotals,
    whatsAppNumber
  };
}
