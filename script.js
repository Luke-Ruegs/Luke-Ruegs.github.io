// Diagnostic + core logic for narrative visualization
console.log("script.js loaded");

function showError(msg) {
  d3.select("body")
    .insert("div", ":first-child")
    .style("background", "#fee2e2")
    .style("color", "#991b1b")
    .style("padding", "10px")
    .style("border", "1px solid #f87171")
    .style("margin", "10px")
    .style("font-family", "system-ui,-apple-system,BlinkMacSystemFont,sans-serif")
    .text("ERROR: " + msg);
}

function showInfo(msg) {
  d3.select("body")
    .insert("div", ":first-child")
    .style("background", "#ecfdf5")
    .style("color", "#065f46")
    .style("padding", "8px")
    .style("border", "1px solid #10b981")
    .style("margin", "10px")
    .style("font-family", "system-ui,-apple-system,BlinkMacSystemFont,sans-serif")
    .text("INFO: " + msg);
}

const parseDate = d3.timeParse("%Y-%m-%d");
const formatDate = d3.timeFormat("%b %d");
const monthlyIncome = 4500;
const initialCheckingBalance = 5000;
let savingsRate = 0.15;
let travelIncluded = true;
let splitTravel = false; // for the split travel scenario

const defaultState = {
  savingsRate: 0.15,
  travelIncluded: true,
  splitTravel: false
};

let rawData = [];
let checkingData = [];
let filteredCheckingNoTravel = [];
let actualSavingsSeries = [];
let projectionSavingsSeries = [];

// reusable annotation helper
function createAnnotation(svg, x, y, title, subtitle) {
  const padding = 6;
  const width = 160;
  const height = 44;
  const group = svg.append("g").attr("class", "annotation");
  group.append("rect")
    .attr("x", x)
    .attr("y", y)
    .attr("width", width)
    .attr("height", height)
    .attr("class", "annotation-box");
  group.append("text")
    .attr("x", x + padding)
    .attr("y", y + 16)
    .text(title)
    .attr("font-weight", "600")
    .attr("fill", "#92400e")
    .attr("font-size", "12px");
  group.append("text")
    .attr("x", x + padding)
    .attr("y", y + 30)
    .text(subtitle)
    .attr("font-size", "11px")
    .attr("fill", "#555");
  return group;
}

// core series computation helpers
function computeBalanceSeries(transactions, startBalance) {
  let balance = startBalance;
  const sorted = transactions.slice().sort((a, b) => d3.ascending(a.date, b.date));
  const series = [];
  for (const t of sorted) {
    balance += t.amount;
    series.push({ date: t.date, balance: +balance.toFixed(2) });
  }
  return series;
}

function computeCumulativeSavings(savingsEntries) {
  const sorted = savingsEntries.slice().sort((a, b) => d3.ascending(a.date, b.date));
  const series = [];
  let cumulative = 0;
  for (const e of sorted) {
    cumulative += e.amount;
    series.push({ date: e.date, savings: +cumulative.toFixed(2) });
  }
  return series;
}

function computeProjectedSavings(rate) {
  const savingsPerMonth = monthlyIncome * rate;
  const series = [];
  let cumulative = 0;
  for (let m = 1; m <= 12; m++) {
    const date = new Date(2024, m - 1, 2);
    cumulative += savingsPerMonth;
    series.push({ date: date, savings: +cumulative.toFixed(2) });
  }
  return series;
}

// special split-travel variant
function computeSplitTravelSeries(originalCheckingOnly, startBalance) {
  const modified = originalCheckingOnly.slice().map(d => ({ ...d })); // shallow copy
  const travelDateStr = "2024-04-15";
  const filtered = modified.filter(d => {
    if (d.category === "Travel" && d.date instanceof Date) {
      return !(d3.timeFormat("%Y-%m-%d")(d.date) === travelDateStr && d.amount === -1200);
    }
    return true;
  });
  const split1 = {
    date: d3.timeParse("%Y-%m-%d")("2024-04-15"),
    amount: -600,
    category: "Travel",
    type: "Expense",
    account: "Checking",
    description: "Split travel part 1"
  };
  const split2 = {
    date: d3.timeParse("%Y-%m-%d")("2024-05-15"),
    amount: -600,
    category: "Travel",
    type: "Expense",
    account: "Checking",
    description: "Split travel part 2"
  };
  filtered.push(split1, split2);
  return computeBalanceSeries(filtered, startBalance);
}

// robust travel point finder with logging
function getTravelPoint(checkingOnly) {
  let balance = initialCheckingBalance;
  const sorted = checkingOnly.slice().sort((a, b) => d3.ascending(a.date, b.date));
  for (const t of sorted) {
    balance += t.amount;
    if (
      t.category === "Travel" &&
      d3.timeFormat("%Y-%m-%d")(t.date) === "2024-04-15"
    ) {
      console.log("Found travel transaction:", t, "Balance after travel:", balance);
      return { date: t.date, balance: +balance.toFixed(2) };
    }
  }
  console.warn("Travel transaction not found via strict match; will fallback to nearest date.");
  return null;
}

// fallback to nearest point if travelPoint null
function approximateTravelPoint(series, targetDateStr) {
  const target = d3.timeParse("%Y-%m-%d")(targetDateStr);
  if (!target) return null;
  let closest = null;
  let minDiff = Infinity;
  series.forEach(d => {
    const diff = Math.abs(d.date - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = d;
    }
  });
  if (closest) {
    console.log("Fallback approximate travel point used:", closest);
  }
  return closest;
}

function drawAll() {
  drawBalanceChart();
  drawSavingsChart();
}

function drawBalanceChart() {
  const container = d3.select("#balance-chart");
  container.selectAll("*").remove();
  const width = container.node().clientWidth - 60;
  const height = container.node().clientHeight - 60;
  const margin = { top: 20, right: 60, bottom: 40, left: 60 };

  const svgWrapper = container
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);
  const svg = svgWrapper
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (!checkingData || checkingData.length === 0) {
    showError("No checking account data to draw balance chart.");
    return;
  }

  // choose the correct series according to state
  let seriesWithTravel;
  if (splitTravel) {
    const checkingOnly = rawData.filter(d => d.account === "Checking");
    seriesWithTravel = computeSplitTravelSeries(checkingOnly, initialCheckingBalance);
  } else {
    seriesWithTravel = checkingData;
  }

  const x = d3
    .scaleTime()
    .domain(d3.extent(seriesWithTravel, (d) => d.date))
    .range([0, width]);

  const maxBal = d3.max([
    d3.max(seriesWithTravel, (d) => d.balance),
    d3.max(filteredCheckingNoTravel, (d) => d.balance),
  ]);
  const y = d3
    .scaleLinear()
    .domain([0, (maxBal || 0) * 1.1])
    .nice()
    .range([height, 0]);

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(d3.timeMonth.every(1))
        .tickFormat(d3.timeFormat("%b"))
    );
  svg.append("g").call(d3.axisLeft(y).tickFormat((d) => "$" + d));

  const line = d3
    .line()
    .x((d) => x(d.date))
    .y((d) => y(d.balance))
    .curve(d3.curveMonotoneX);

  // actual/baseline series (with current travel/splitTravel state)
  svg
    .append("path")
    .datum(seriesWithTravel)
    .attr("fill", "none")
    .attr("stroke", "#1f78b4")
    .attr("stroke-width", 2)
    .attr("d", line)
    .attr("class", "actual-line");

  // no-travel variant if travelIncluded is false
  if (!travelIncluded) {
    svg
      .append("path")
      .datum(filteredCheckingNoTravel)
      .attr("fill", "none")
      .attr("stroke", "#a6cee3")
      .attr("stroke-width", 2)
      .attr("d", line)
      .attr("class", "no-travel-line");
  }

  // annotation logic using robust travel point finder, with fallback
  if (travelIncluded && !splitTravel) {
    const checkingOnly = rawData.filter(d => d.account === "Checking");
    let travelPoint = getTravelPoint(checkingOnly);
    let usedApprox = false;
    if (!travelPoint) {
      travelPoint = approximateTravelPoint(seriesWithTravel, "2024-04-15");
      usedApprox = true;
    }
    if (travelPoint) {
      svg
        .append("circle")
        .attr("cx", x(travelPoint.date))
        .attr("cy", y(travelPoint.balance))
        .attr("r", 6)
        .attr("fill", "#d97706");

      if (usedApprox) {
        createAnnotation(
          svg,
          x(travelPoint.date) + 10,
          y(travelPoint.balance) - 40,
          "Travel-like dip (approx)",
          "approximate Apr 15"
        );
      } else {
        createAnnotation(
          svg,
          x(travelPoint.date) + 10,
          y(travelPoint.balance) - 40,
          "Travel expense caused dip",
          "Apr 15 -$1,200"
        );
      }
      svg
        .append("path")
        .attr(
          "d",
          `M${x(travelPoint.date) + 10},${y(travelPoint.balance) - 40 + 50} L${x(
            travelPoint.date
          )},${y(travelPoint.balance)}`
        )
        .attr("stroke", "#d97706")
        .attr("stroke-width", 1.5)
        .attr("fill", "none");
    } else {
      svg
        .append("text")
        .attr("x", 10)
        .attr("y", 20)
        .text(
          "Expected travel expense point not found in balance series; check data parsing."
        )
        .attr("fill", "#b91c1c")
        .attr("font-weight", "600");
    }
  } else if (splitTravel) {
    svg
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Travel expense split across Apr & May; dip is smoothed.")
      .attr("fill", "#065f46")
      .attr("font-weight", "600");
  } else if (!travelIncluded) {
    svg
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Travel expense removed; balance improves in April")
      .attr("fill", "#065f46")
      .attr("font-weight", "600");
  }

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", -5)
    .text("Checking Account Balance Over Time")
    .attr("font-size", "14px")
    .attr("font-weight", "700");

  // tooltip
  const focus = svg.append("g").style("display", "none");
  focus.append("circle").attr("r", 5).attr("fill", "#1f78b4");
  focus
    .append("rect")
    .attr("class", "tooltip")
    .attr("width", 160)
    .attr("height", 50)
    .attr("x", 10)
    .attr("y", -45)
    .attr("rx", 5)
    .attr("fill", "#ffffff")
    .attr("stroke", "#9ca3af")
    .attr("stroke-width", 1);
  const tooltipText = focus
    .append("text")
    .attr("x", 15)
    .attr("y", -20)
    .attr("font-size", "12px");

  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseover", () => focus.style("display", null))
    .on("mouseout", () => focus.style("display", "none"))
    .on("mousemove", (event) => {
      const [mx] = d3.pointer(event);
      const x0 = x.invert(mx);
      const bisect = d3.bisector((d) => d.date).left;
      const i = bisect(seriesWithTravel, x0);
      const d0 = seriesWithTravel[i - 1];
      const d1 = seriesWithTravel[i];
      let dClose = d0;
      if (d1 && Math.abs(x0 - d0.date) > Math.abs(d1.date - x0)) dClose = d1;
      if (!dClose) return;
      focus.attr(
        "transform",
        `translate(${x(dClose.date)},${y(dClose.balance)})`
      );
      tooltipText.text(
        `${formatDate(dClose.date)}  $${dClose.balance.toFixed(2)}`
      );
    });
}

function drawSavingsChart() {
  const container = d3.select("#savings-chart");
  container.selectAll("*").remove();
  const width = container.node().clientWidth - 60;
  const height = container.node().clientHeight - 60;
  const margin = { top: 20, right: 60, bottom: 40, left: 60 };

  const svgWrapper = container
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);
  const svg = svgWrapper
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (!projectionSavingsSeries || projectionSavingsSeries.length === 0) {
    showError("No projection savings to draw.");
    return;
  }

  const allDates = projectionSavingsSeries
    .map((d) => d.date)
    .concat(actualSavingsSeries.map((d) => d.date));
  const x = d3
    .scaleTime()
    .domain(d3.extent(allDates))
    .range([0, width]);

  const maxSavings = d3.max([
    d3.max(projectionSavingsSeries, (d) => d.savings),
    d3.max(actualSavingsSeries, (d) => d.savings || 0),
  ]);
  const y = d3
    .scaleLinear()
    .domain([0, (maxSavings || 0) * 1.1])
    .nice()
    .range([height, 0]);

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(d3.timeMonth.every(2))
        .tickFormat(d3.timeFormat("%b"))
    );
  svg.append("g").call(d3.axisLeft(y).tickFormat((d) => "$" + d));

  const line = d3
    .line()
    .x((d) => x(d.date))
    .y((d) => y(d.savings))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(projectionSavingsSeries)
    .attr("fill", "none")
    .attr("stroke", "#33a02c")
    .attr("stroke-width", 2)
    .attr("d", line);

  svg
    .append("path")
    .datum(actualSavingsSeries)
    .attr("fill", "none")
    .attr("stroke", "#b2df8a")
    .attr("stroke-width", 2)
    .attr("d", line);

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", -5)
    .text("Cumulative Savings: Actual vs Projected")
    .attr("font-size", "14px")
    .attr("font-weight", "700");
}

function populateMonthSelector() {
  const monthSet = new Set();
  checkingData.forEach((d) => {
    const m = d3.timeFormat("%Y-%m")(d.date);
    monthSet.add(m);
  });
  let months = Array.from(monthSet).sort();

  // filter out months with no negative checking spending
  months = months.filter((m) => {
    const [year, month] = m.split("-");
    return rawData.some(
      (d) =>
        d.account === "Checking" &&
        d.amount < 0 &&
        d.date instanceof Date &&
        d.date.getFullYear() === +year &&
        d.date.getMonth() + 1 === +month
    );
  });

  const select = d3.select("#month-select");
  select.selectAll("option").remove();
  if (months.length === 0) {
    select.append("option").text("No months with spending").attr("disabled", true);
    return;
  }

  months.forEach((m) => {
    const dateObj = d3.timeParse("%Y-%m")(m);
    select
      .append("option")
      .attr("value", m)
      .text(d3.timeFormat("%B %Y")(dateObj));
  });
  drawMonthlyBreakdown(months[0]);
  select.on("change", (e) => drawMonthlyBreakdown(e.target.value));
}

function drawMonthlyBreakdown(monthStr) {
  const [year, month] = monthStr.split("-");
  const filtered = rawData.filter((d) => {
    if (d.account !== "Checking") return false;
    if (!(d.date instanceof Date)) return false;
    return (
      d.date.getFullYear() === +year &&
      d.date.getMonth() + 1 === +month &&
      d.amount < 0
    );
  });

  const byCat = d3
    .rollups(
      filtered,
      (v) => d3.sum(v, (d) => -d.amount),
      (d) => d.category
    )
    .map(([category, amt]) => ({ category, amount: amt }))
    .sort((a, b) => b.amount - a.amount);

  const container = d3.select("#breakdown-chart");
  container.selectAll("*").remove();
  const width = container.node().clientWidth - 80;
  const height = container.node().clientHeight - 60;
  const margin = { top: 20, right: 20, bottom: 40, left: 100 };

  // create SVG group wrapper dimensions
  container.attr("width", width + margin.left + margin.right);
  container.attr("height", height + margin.top + margin.bottom);
  const svg = container
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const displayName = d3.timeFormat("%B %Y")(d3.timeParse("%Y-%m")(monthStr));

  if (byCat.length === 0) {
    // placeholder message in SVG
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("fill", "#555")
      .text(`No spending breakdown data for ${displayName}.`);
    return;
  }

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(byCat, (d) => d.amount) || 0])
    .range([0, width]);
  const y = d3
    .scaleBand()
    .domain(byCat.map((d) => d.category))
    .range([0, height])
    .padding(0.2);

  svg.append("g").call(d3.axisLeft(y));
  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(5)
        .tickFormat((d) => "$" + Math.round(d))
    );

  svg
    .selectAll(".bar")
    .data(byCat)
    .join("rect")
    .attr("class", "bar")
    .attr("y", (d) => y(d.category))
    .attr("height", y.bandwidth())
    .attr("x", 0)
    .attr("width", (d) => x(d.amount))
    .attr("fill", "#2563eb");

  svg
    .append("text")
    .attr("x", 0)
    .attr("y", -5)
    .text(`Spending Breakdown for ${displayName}`)
    .attr("font-weight", "700");
}

function applyPreset(preset) {
  splitTravel = false;
  switch (preset) {
    case "aggressive":
      savingsRate = 0.25;
      travelIncluded = true;
      break;
    case "conservative":
      savingsRate = 0.1;
      travelIncluded = true;
      break;
    case "remove-travel":
      savingsRate = defaultState.savingsRate;
      travelIncluded = false;
      break;
    case "split-travel":
      savingsRate = defaultState.savingsRate;
      travelIncluded = true;
      splitTravel = true;
      break;
    default:
      savingsRate = defaultState.savingsRate;
      travelIncluded = defaultState.travelIncluded;
      splitTravel = defaultState.splitTravel;
  }

  d3.select("#savings-slider").property("value", Math.round(savingsRate * 100));
  d3.select("#savings-display").text(`${Math.round(savingsRate * 100)}%`);

  projectionSavingsSeries = computeProjectedSavings(savingsRate);
  drawAll();

  const annotationDiv = d3.select("#scenario-annotation");
  let msg = "";
  if (preset === "aggressive") {
    msg =
      "Aggressive saver: raising the savings rate to 25% would significantly widen the gap between projected and actual savings, accelerating long-term accumulation.";
  } else if (preset === "conservative") {
    msg =
      "Conservative saver: lowering to 10% slows projected savings growth, making balance vulnerability more pronounced.";
  } else if (preset === "remove-travel") {
    msg =
      "Removing the travel expense eliminates the large April dip, preserving more of the checking balance early in the year.";
  } else if (preset === "split-travel") {
    msg =
      "Splitting the travel expense across two months smooths the April dip and spreads the impact.";
  } else {
    msg = "Reset to story defaults.";
  }
  annotationDiv.html(`<p><strong>Scenario:</strong> ${msg}</p>`);
}

function resetToDefaults() {
  savingsRate = defaultState.savingsRate;
  travelIncluded = defaultState.travelIncluded;
  splitTravel = defaultState.splitTravel;
  d3.select("#savings-slider").property("value", Math.round(savingsRate * 100));
  d3.select("#savings-display").text(`${Math.round(savingsRate * 100)}%`);
  projectionSavingsSeries = computeProjectedSavings(savingsRate);
  drawAll();
  d3.select("#scenario-annotation").html(
    "<p><strong>Scenario:</strong> Back to the original narrative defaults.</p>"
  );
}

function setupInteractions() {
  d3.select("#savings-slider").on("input", function () {
    const val = +this.value;
    savingsRate = val / 100;
    d3.select("#savings-display").text(val + "%");
    projectionSavingsSeries = computeProjectedSavings(savingsRate);
    drawSavingsChart();
  });

  d3.select("#toggle-travel").on("click", () => {
    travelIncluded = !travelIncluded;
    splitTravel = false;
    drawBalanceChart();
  });
}

function main() {
  d3.csv("personal_finance_transactions.csv", d3.autoType)
    .then((raw) => {
      if (!raw || raw.length === 0) {
        showError("CSV loaded but contains no rows.");
        return;
      }
      console.log("CSV loaded, rows:", raw.length);

      raw.forEach((d) => {
        if (!(d.date instanceof Date)) {
          d.date = parseDate(d.date);
        }
      });
      raw.sort((a, b) => d3.ascending(a.date, b.date));
      rawData = raw;

      const checkingOnly = raw.filter((d) => d.account === "Checking");
      checkingData = computeBalanceSeries(checkingOnly, initialCheckingBalance);

      const noTravel = checkingOnly.filter((d) => {
        return !(
          d.category === "Travel" &&
          d.date &&
          d3.timeFormat("%Y-%m-%d")(d.date) === "2024-04-15"
        );
      });
      filteredCheckingNoTravel = computeBalanceSeries(noTravel, initialCheckingBalance);

      const savingsEntries = raw.filter(
        (d) => d.category === "Savings Balance" && d.account === "Savings"
      );
      actualSavingsSeries = computeCumulativeSavings(savingsEntries);

      projectionSavingsSeries = computeProjectedSavings(savingsRate);

      drawAll();
      setupInteractions();

      // Scene 2 setup
      populateMonthSelector();

      // Scene 3 buttons
      d3.selectAll(".scenario-buttons button").on("click", function () {
        const preset = d3.select(this).attr("data-preset");
        applyPreset(preset);
      });

      // Reset
      d3.select("#reset-btn").on("click", () => {
        resetToDefaults();
      });

      // Martini glass unlock
      d3.select("#unlock-btn").on("click", () => {
        d3.select("#intro-overlay").style("display", "none");
      });
    })
    .catch((err) => {
      console.error("CSV load failed:", err);
      showError(
        "Failed to load personal_finance_transactions.csv. Confirm the file exists at the root and is named exactly that. See console for details."
      );
    });
}

// Kick off
main();
