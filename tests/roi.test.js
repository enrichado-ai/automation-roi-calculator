// Run with: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculate } = require("../roi.js");

const base = {
  hoursPerWeek: 10,
  people: 2,
  hourlyCost: 30,
  automationPct: 80,
  monthlyErrorCost: 0,
  setupCost: 2000,
  monthlyToolCost: 100,
};

test("labor savings use 48 working weeks and the automated share", () => {
  const r = calculate(base);
  // 10 h * 2 people * 48 wk * 0.8 = 768 h
  assert.equal(r.hoursSavedYear, 768);
  assert.equal(r.laborAnnual, 23040);
});

test("net savings, ROI and payback", () => {
  const r = calculate(base);
  assert.equal(r.toolAnnual, 1200);
  assert.equal(r.netOngoing, 21840);
  assert.equal(r.netYear1, 19840);
  assert.equal(r.threeYearNet, 63520);
  // 19840 / (2000 + 1200)
  assert.equal(r.roiYear1, 620);
  // 2000 / (1920 - 100)
  assert.equal(r.paybackMonths, 1.1);
});

test("error savings are scaled by the automated share", () => {
  const r = calculate({ ...base, monthlyErrorCost: 500 });
  assert.equal(r.errorAnnual, 4800);
  assert.equal(r.grossAnnual, 27840);
});

test("never pays back when the tool costs more than it saves", () => {
  const r = calculate({ ...base, hoursPerWeek: 0.1, monthlyToolCost: 500 });
  assert.equal(r.paybackMonths, null);
  assert.ok(r.netYear1 < 0);
});

test("no setup cost pays back immediately", () => {
  assert.equal(calculate({ ...base, setupCost: 0 }).paybackMonths, 0);
});

test("ROI is null when there is no cost at all", () => {
  assert.equal(calculate({ ...base, setupCost: 0, monthlyToolCost: 0 }).roiYear1, null);
});

test("cumulative series starts at minus setup and has 37 points", () => {
  const r = calculate(base);
  assert.equal(r.cumulative.length, 37);
  assert.equal(r.cumulative[0], -2000);
  assert.equal(r.cumulative[12], r.netYear1);
});

test("bad and negative input is treated as zero; share capped at 100%", () => {
  const r = calculate({ hoursPerWeek: "abc", people: -3, automationPct: 250 });
  assert.equal(r.grossAnnual, 0);
  const capped = calculate({ ...base, automationPct: 250 });
  assert.equal(capped.hoursSavedYear, 960);
});
