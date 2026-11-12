/**
 * Pure ROI math for the automation calculator.
 * No DOM access, so it runs in the browser and in Node tests.
 */
(function (root) {
  "use strict";

  var WEEKS_PER_YEAR = 48; // working weeks, after holidays and time off
  var MONTHS = 36;         // horizon for the cumulative chart

  /** Finite, non-negative number from user input (blank or bad -> 0). */
  function num(value) {
    var n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * inputs: {
   *   hoursPerWeek, people, hourlyCost, automationPct,
   *   monthlyErrorCost, setupCost, monthlyToolCost
   * }
   */
  function calculate(inputs) {
    var share = Math.min(num(inputs.automationPct), 100) / 100;
    var people = num(inputs.people);
    var hoursPerWeek = num(inputs.hoursPerWeek);
    var hourlyCost = num(inputs.hourlyCost);
    var setup = num(inputs.setupCost);
    var toolMonthly = num(inputs.monthlyToolCost);

    var hoursSavedYear = hoursPerWeek * people * WEEKS_PER_YEAR * share;
    var laborAnnual = hoursSavedYear * hourlyCost;
    var errorAnnual = num(inputs.monthlyErrorCost) * 12 * share;
    var grossAnnual = laborAnnual + errorAnnual;
    var toolAnnual = toolMonthly * 12;

    var monthlyNet = grossAnnual / 12 - toolMonthly;
    var netOngoing = grossAnnual - toolAnnual;
    var netYear1 = netOngoing - setup;
    var firstYearCost = setup + toolAnnual;

    var paybackMonths = null; // null = never pays back
    if (monthlyNet > 0) paybackMonths = setup / monthlyNet;

    var cumulative = [];
    for (var m = 0; m <= MONTHS; m++) cumulative.push(round2(-setup + monthlyNet * m));

    return {
      hoursSavedYear: round2(hoursSavedYear),
      laborAnnual: round2(laborAnnual),
      errorAnnual: round2(errorAnnual),
      grossAnnual: round2(grossAnnual),
      toolAnnual: round2(toolAnnual),
      setup: round2(setup),
      monthlyNet: round2(monthlyNet),
      netOngoing: round2(netOngoing),
      netYear1: round2(netYear1),
      threeYearNet: round2(netOngoing * 3 - setup),
      roiYear1: firstYearCost > 0 ? round2((netYear1 / firstYearCost) * 100) : null,
      paybackMonths: paybackMonths == null ? null : round2(paybackMonths),
      cumulative: cumulative,
    };
  }

  var api = { calculate: calculate, num: num, WEEKS_PER_YEAR: WEEKS_PER_YEAR, MONTHS: MONTHS };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ROI = api;
})(typeof self !== "undefined" ? self : this);
