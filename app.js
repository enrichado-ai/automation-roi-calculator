/* Automation ROI Calculator: UI. Depends on roi.js (window.ROI). */
(function () {
  "use strict";

  // ---------- Your settings ----------
  // Set ctaUrl to your booking page (Calendly, Cal.com, a contact form...)
  // and a "talk to us" box appears under the results. Leave it empty to hide it.
  var CONFIG = {
    ctaTitle: "Want help automating this?",
    ctaText: "Book a free 20-minute call and we'll map out what to automate first.",
    ctaButton: "Book a free call",
    ctaUrl: "",
    currency: "USD",
  };

  var DEFAULTS = {
    task: "",
    hoursPerWeek: 6,
    people: 2,
    hourlyCost: 35,
    automationPct: 70,
    monthlyErrorCost: 0,
    setupCost: 1500,
    monthlyToolCost: 50,
  };

  var PRESETS = [
    { label: "Invoice data entry", values: { task: "Invoice data entry", hoursPerWeek: 5, people: 1, hourlyCost: 30, automationPct: 80, monthlyErrorCost: 150, setupCost: 1200, monthlyToolCost: 40 } },
    { label: "Lead follow-up emails", values: { task: "Lead follow-up emails", hoursPerWeek: 4, people: 3, hourlyCost: 40, automationPct: 70, monthlyErrorCost: 0, setupCost: 2000, monthlyToolCost: 99 } },
    { label: "Weekly reports", values: { task: "Weekly reports", hoursPerWeek: 3, people: 2, hourlyCost: 45, automationPct: 90, monthlyErrorCost: 0, setupCost: 1500, monthlyToolCost: 30 } },
    { label: "Appointment scheduling", values: { task: "Appointment scheduling", hoursPerWeek: 8, people: 1, hourlyCost: 22, automationPct: 75, monthlyErrorCost: 200, setupCost: 500, monthlyToolCost: 25 } },
  ];

  var FIELDS = Object.keys(DEFAULTS);
  var form = document.getElementById("inputs");
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Formatting ----------

  function money(v, compact) {
    var opts = { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 };
    if (compact) { opts.notation = "compact"; opts.maximumFractionDigits = 1; }
    try { return new Intl.NumberFormat(undefined, opts).format(v); }
    catch (e) { return "$" + Math.round(v); }
  }
  function whole(v) { return new Intl.NumberFormat().format(Math.round(v)); }

  function paybackText(months) {
    if (months == null) return "Never";
    if (months === 0) return "Immediate";
    if (months < 1) return "< 1 month";
    if (months > 36) return (months / 12).toFixed(1) + " years";
    var m = Math.ceil(months);
    return m + (m === 1 ? " month" : " months");
  }

  // ---------- Inputs <-> URL ----------

  function readForm() {
    var values = {};
    FIELDS.forEach(function (f) { values[f] = form.elements[f].value; });
    return values;
  }

  function writeForm(values) {
    FIELDS.forEach(function (f) {
      var v = values[f];
      form.elements[f].value = v == null ? "" : v;
    });
  }

  function valuesFromUrl() {
    var params = new URLSearchParams(location.search);
    var values = Object.assign({}, DEFAULTS);
    var found = false;
    FIELDS.forEach(function (f) {
      if (params.has(f)) { values[f] = params.get(f); found = true; }
    });
    return found ? values : null;
  }

  function shareUrl() {
    var params = new URLSearchParams();
    var values = readForm();
    FIELDS.forEach(function (f) { if (String(values[f]).trim() !== "") params.set(f, values[f]); });
    return location.origin + location.pathname + "?" + params.toString();
  }

  // ---------- Render ----------

  function render() {
    var values = readForm();
    var r = ROI.calculate(values);
    var task = String(values.task || "").trim();

    // Hero
    var hero = $("heroNumber");
    var positive = r.netOngoing > 0;
    $("heroLabel").textContent = positive
      ? "Automating " + (task ? task.toLowerCase() : "this task") + " could save you"
      : "At these numbers, automating " + (task ? task.toLowerCase() : "this task") + " would cost";
    hero.textContent = money(Math.abs(r.netOngoing));
    hero.classList.toggle("is-negative", !positive && r.netOngoing !== 0);
    $("heroSub").textContent = positive
      ? "per year, after tool costs"
      : "more per year than it saves. Try a cheaper tool or a bigger task.";
    if (r.grossAnnual === 0 && r.toolAnnual === 0) {
      $("heroLabel").textContent = "Enter your numbers to see";
      hero.textContent = money(0);
      $("heroSub").textContent = "your yearly savings";
    }

    // Tiles
    $("tHours").textContent = whole(r.hoursSavedYear);
    $("tPayback").textContent = paybackText(r.paybackMonths);
    $("tRoi").textContent = r.roiYear1 == null ? "—" : whole(r.roiYear1) + "%";
    $("tThree").textContent = money(r.threeYearNet);

    renderChart(r);
    renderTable(r);
    syncPresets(values);
  }

  function renderTable(r) {
    var body = $("yearRows");
    body.textContent = "";
    for (var y = 1; y <= 3; y++) {
      var costs = r.toolAnnual + (y === 1 ? r.setup : 0);
      var cells = ["Year " + y, money(r.grossAnnual), money(costs), money(r.grossAnnual - costs), money(r.cumulative[y * 12])];
      var tr = body.insertRow();
      cells.forEach(function (c, i) {
        var td = tr.insertCell();
        td.textContent = c;
        if (i > 0) td.className = "num";
      });
    }
  }

  // ---------- Chart ----------

  var SVG_NS = "http://www.w3.org/2000/svg";
  var chartState = null;

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Round tick step to 1, 2 or 5 x 10^n. */
  function niceStep(range, count) {
    var raw = range / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  }

  function renderChart(r) {
    var svg = $("chart");
    var W = svg.clientWidth || 600;
    var H = svg.clientHeight || 280;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.textContent = "";

    var pad = { top: 16, right: 12, bottom: 26, left: 56 };
    var data = r.cumulative;
    var lo = Math.min(0, Math.min.apply(null, data));
    var hi = Math.max(0, Math.max.apply(null, data));
    if (hi === lo) hi = lo + 1000;
    var step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;

    var x = function (m) { return pad.left + (m / ROI.MONTHS) * (W - pad.left - pad.right); };
    var y = function (v) { return pad.top + (1 - (v - lo) / (hi - lo)) * (H - pad.top - pad.bottom); };

    // Grid + y labels
    for (var v = lo; v <= hi + step / 2; v += step) {
      el("line", { x1: pad.left, x2: W - pad.right, y1: y(v), y2: y(v), class: Math.abs(v) < step / 2 ? "zero" : "grid" }, svg);
      var t = el("text", { x: pad.left - 8, y: y(v) + 4, "text-anchor": "end", class: "axis-label" }, svg);
      t.textContent = money(v, true);
    }
    // X labels (years)
    [0, 12, 24, 36].forEach(function (m) {
      var t = el("text", { x: x(m), y: H - 6, "text-anchor": m === 0 ? "start" : m === 36 ? "end" : "middle", class: "axis-label" }, svg);
      t.textContent = m === 0 ? "Start" : "Year " + m / 12;
    });

    // Area to zero + line
    var pts = data.map(function (d, m) { return x(m).toFixed(1) + "," + y(d).toFixed(1); });
    el("path", { d: "M" + x(0) + "," + y(0) + " L" + pts.join(" L") + " L" + x(ROI.MONTHS) + "," + y(0) + " Z", class: "area" }, svg);
    el("polyline", { points: pts.join(" "), class: "line" }, svg);

    // Payback marker (only when it lands inside the chart and isn't at the start)
    if (r.paybackMonths != null && r.paybackMonths > 0 && r.paybackMonths <= ROI.MONTHS) {
      var px = x(r.paybackMonths), py = y(0);
      el("circle", { cx: px, cy: py, r: 5, class: "payback-dot" }, svg);
      var anchorEnd = px > W * 0.7;
      // After break-even the line is above $0, so the space just below it is free.
      var lbl = el("text", { x: px + (anchorEnd ? -10 : 10), y: py + 20, "text-anchor": anchorEnd ? "end" : "start", class: "payback-label" }, svg);
      lbl.textContent = "Breaks even: " + paybackText(r.paybackMonths);
    }

    // Hover layer
    var cross = el("line", { y1: pad.top, y2: H - pad.bottom, class: "crosshair", visibility: "hidden" }, svg);
    var dot = el("circle", { r: 4, class: "hover-dot", visibility: "hidden" }, svg);
    el("rect", { x: pad.left, y: 0, width: W - pad.left - pad.right, height: H, fill: "transparent", id: "hitArea" }, svg);

    chartState = { x: x, y: y, data: data, pad: pad, W: W, cross: cross, dot: dot };
  }

  function showTip(clientX) {
    if (!chartState) return;
    var s = chartState;
    var svg = $("chart");
    var rect = svg.getBoundingClientRect();
    var px = (clientX - rect.left) * (s.W / rect.width);
    var m = Math.round(((px - s.pad.left) / (s.W - s.pad.left - s.pad.right)) * ROI.MONTHS);
    m = Math.max(0, Math.min(ROI.MONTHS, m));
    var cx = s.x(m), cy = s.y(s.data[m]);
    s.cross.setAttribute("x1", cx); s.cross.setAttribute("x2", cx);
    s.cross.setAttribute("visibility", "visible");
    s.dot.setAttribute("cx", cx); s.dot.setAttribute("cy", cy);
    s.dot.setAttribute("visibility", "visible");

    var tip = $("tooltip");
    tip.textContent = "";
    var strong = document.createElement("strong");
    strong.textContent = money(s.data[m]);
    tip.appendChild(strong);
    tip.appendChild(document.createTextNode(m === 0 ? "At start (setup cost)" : "Running total, month " + m));
    tip.hidden = false;
    var scale = rect.width / s.W;
    var left = Math.max(70, Math.min(rect.width - 70, cx * scale));
    tip.style.left = left + "px";
    tip.style.top = cy * (rect.height / svg.viewBox.baseVal.height) + "px";
  }

  function hideTip() {
    if (!chartState) return;
    chartState.cross.setAttribute("visibility", "hidden");
    chartState.dot.setAttribute("visibility", "hidden");
    $("tooltip").hidden = true;
  }

  var chartEl = $("chart");
  chartEl.addEventListener("pointermove", function (e) { showTip(e.clientX); });
  chartEl.addEventListener("pointerdown", function (e) { showTip(e.clientX); });
  chartEl.addEventListener("pointerleave", hideTip);

  // Chart / table toggle
  document.querySelectorAll(".view-toggle button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var view = btn.dataset.view;
      document.querySelectorAll(".view-toggle button").forEach(function (b) {
        b.setAttribute("aria-selected", String(b === btn));
      });
      $("chartWrap").hidden = view !== "chart";
      $("tableWrap").hidden = view !== "table";
      if (view === "chart") render();
    });
  });

  // ---------- Presets ----------

  function syncPresets(values) {
    document.querySelectorAll(".preset").forEach(function (btn, i) {
      var p = PRESETS[i].values;
      var match = FIELDS.every(function (f) { return String(p[f]) === String(values[f]); });
      btn.setAttribute("aria-pressed", String(match));
    });
  }

  PRESETS.forEach(function (preset) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset";
    btn.textContent = preset.label;
    btn.addEventListener("click", function () {
      writeForm(preset.values);
      render();
    });
    $("presets").appendChild(btn);
  });

  // ---------- Share ----------

  $("shareBtn").addEventListener("click", function () {
    var url = shareUrl();
    var btn = $("shareBtn");
    var done = function (msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = "Copy share link"; }, 2000);
    };
    try { history.replaceState(null, "", url); } catch (e) { /* file:// may refuse */ }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done("Link copied!"); }, function () { prompt("Copy this link:", url); });
    } else {
      prompt("Copy this link:", url);
    }
  });

  // ---------- CTA ----------

  if (CONFIG.ctaUrl) {
    $("ctaTitle").textContent = CONFIG.ctaTitle;
    $("ctaText").textContent = CONFIG.ctaText;
    $("ctaLink").textContent = CONFIG.ctaButton;
    $("ctaLink").href = CONFIG.ctaUrl;
    $("cta").hidden = false;
  }

  // ---------- Start ----------

  form.addEventListener("input", render);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 100);
  });

  writeForm(valuesFromUrl() || DEFAULTS);
  render();
})();
