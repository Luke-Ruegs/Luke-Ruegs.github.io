// Basic parameters
const parseDate = d3.timeParse("%Y-%m-%d");
const formatDate = d3.timeFormat("%b %d");
const monthlyIncome = 4500;
const initialCheckingBalance = 5000; // consistent with synthetic data
let savingsRate = 0.15;
let travelIncluded = true;

let rawData = [];
let checkingData = [];
let filteredCheckingNoTravel = [];
let actualSavingsSeries = [];
let projectionSavingsSeries = [];

function loadAndProcess() {
  d3.csv("personal_finance_transactions.csv", d3.autoType).then(raw => {
    raw.forEach(d => {
      d.date = parseDate(d.date);
    });
    raw.sort((a,b) => d3.ascending(a.date, b.date));
    rawData = raw;

    // derive checking account transactions
    const checkingOnly = raw.filter(d => d.account === "Checking");

    // compute actual checking balance from synthetic start to ensure consistency if needed
    checkingData = computeBalanceSeries(checkingOnly, initialCheckingBalance);

    // build version without travel expense
    const noTravel = checkingOnly.filter(d => !(d.category === "Travel" && d3.timeFormat('%Y-%m-%d')(d.date) === '2024-04-15'));
    filteredCheckingNoTravel = computeBalanceSeries(noTravel, initialCheckingBalance);

    // compute actual cumulative savings (from Savings Balance entries)
    const savingsEntries = raw.filter(d => d.category === "Savings Balance" && d.account === "Savings");
    actualSavingsSeries = computeCumulativeSavings(savingsEntries);

    // initial projection savings series with default savingsRate
    projectionSavingsSeries = computeProjectedSavings(savingsRate);

    drawAll();
    setupInteractions();
  });
}

// helper: compute running checking balance given transactions (assumes negative for expense, positive for inflows)
function computeBalanceSeries(transactions, startBalance) {
  let balance = startBalance;
  // Filter and sort
  const sorted = transactions.slice().sort((a,b) => d3.ascending(a.date, b.date));
  const series = [];
  for (const t of sorted) {
    balance += t.amount;
    series.push({ date: t.date, balance: +balance.toFixed(2) });
  }
  return series;
}

// helper: actual cumulative savings from recorded savings entries
function computeCumulativeSavings(savingsEntries) {
  // savingsEntries have positive amounts added into savings
  const sorted = savingsEntries.slice().sort((a,b) => d3.ascending(a.date, b.date));
  const series = [];
  let cumulative = 0;
  for (const e of sorted) {
    cumulative += e.amount;
    series.push({ date: e.date, savings: +cumulative.toFixed(2) });
  }
  return series;
}

// helper: projection savings if savingsRate had been used from Jan 1, 2024
function computeProjectedSavings(rate) {
  // monthly savings = monthlyIncome * rate
  const savingsPerMonth = monthlyIncome * rate;
  const series = [];
  let cumulative = 0;
  for (let m = 1; m <= 12; m++) {
    // Assume saved on 2nd of each month
    const date = new Date(2024, m - 1, 2);
    cumulative += savingsPerMonth;
    series.push({ date: date, savings: +cumulative.toFixed(2) });
  }
  return series;
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

  const svg = container
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // X scale based on full year
  const x = d3.scaleTime()
    .domain(d3.extent(checkingData, d => d.date))
    .range([0, width]);

  // Y scale for balances
  const maxBal = d3.max([d3.max(checkingData, d=>d.balance), d3.max(filteredCheckingNoTravel, d=>d.balance)]);
  const y = d3.scaleLinear()
    .domain([0, maxBal * 1.1])
    .nice()
    .range([height, 0]);

  // axes
  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b")));

  svg.append("g")
    .call(d3.axisLeft(y).tickFormat(d => "$" + d));

  // line generators
  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.balance))
    .curve(d3.curveMonotoneX);

  // actual
  svg.append("path")
    .datum(checkingData)
    .attr("fill", "none")
    .attr("stroke", "#1f78b4")
    .attr("stroke-width", 2)
    .attr("d", line)
    .attr("class", "actual-line");

  // no travel variant (if toggled)
  if (!travelIncluded) {
    svg.append("path")
      .datum(filteredCheckingNoTravel)
      .attr("fill", "none")
      .attr("stroke", "#a6cee3")
      .attr("stroke-width", 2)
      .attr("d", line)
      .attr("class", "no-travel-line");
  }

  // annotation: travel expense dip (only when included)
  if (travelIncluded) {
    const travelDate = d3.timeParse("%Y-%m-%d")("2024-04-15");
    const point = checkingData.find(d => d.date.getTime() === travelDate.getTime());
    if (point) {
      // draw circle
      svg.append("circle")
        .attr("cx", x(point.date))
        .attr("cy", y(point.balance))
        .attr("r", 6)
        .attr("fill", "#d97706");

      // annotation box
      const annoX = x(point.date) + 10;
      const annoY = y(point.balance) - 40;
      const group = svg.append("g").attr("class", "annotation");
      group.append("rect")
        .attr("x", annoX)
        .attr("y", annoY)
        .attr("width", 160)
        .attr("height", 50)
        .attr("class", "annotation-box");
      group.append("text")
        .attr("x", annoX + 8)
        .attr("y", annoY + 18)
        .text("Travel expense caused dip")
        .attr("font-weight", "600")
        .attr("fill", "#92400e");
      group.append("text")
        .attr("x", annoX + 8)
        .attr("y", annoY + 34)
        .text("Apr 15 -$1,200")
        .attr("font-size", "11px")
        .attr("fill", "#555");
      // line from box to point
      group.append("path")
        .attr("d", `M${annoX},${annoY+50} L${x(point.date)},${y(point.balance)}`)
        .attr("stroke", "#d97706")
        .attr("stroke-width", 1.5)
        .attr("fill", "none");
    }
  } else {
    // when travel excluded, add annotation that travel was removed
    svg.append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Travel expense removed; balance improves in April")
      .attr("fill", "#065f46")
      .attr("font-weight", "600");
  }

  // labels
  svg.append("text")
    .attr("x", 0)
    .attr("y", -5)
    .text("Checking Account Balance Over Time")
    .attr("font-size", "14px")
    .attr("font-weight", "700");

  // tooltip on hover for actual line
  const focus = svg.append("g").style("display", "none");
  focus.append("circle").attr("r", 5).attr("fill", "#1f78b4");
  focus.append("rect")
    .attr("class", "tooltip")
    .attr("width", 140)
    .attr("height", 60)
    .attr("x", 10)
    .attr("y", -30)
    .attr("rx", 5)
    .attr("fill", "#ffffff")
    .attr("stroke", "#9ca3af")
    .attr("stroke-width", 1);
  const tooltipText = focus.append("text").attr("x", 15).attr("y", -10).attr("font-size", "12px");

  // overlay for mouse tracking
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseover", () => focus.style("display", null))
    .on("mouseout", () => focus.style("display", "none"))
    .on("mousemove", (event) => {
      const [mx] = d3.pointer(event);
      const x0 = x.invert(mx);
      // find closest actual point
      const bisect = d3.bisector(d => d.date).left;
      const i = bisect(checkingData, x0);
      const d0 = checkingData[i-1];
      const d1 = checkingData[i];
      let dClose = d0;
      if (d1 && x0 - d0.date > d1.date - x0) dClose = d1;
      if (!dClose) return;
      focus.attr("transform", `translate(${x(dClose.date)},${y(dClose.balance)})`);
      tooltipText.text(`${formatDate(dClose.date)}   $${dClose.balance.toFixed(2)}`);
    });

  // Legend markers (inline)
  // Done outside for brevity
}

function drawSavingsChart() {
  const container = d3.select("#savings-chart");
  container.selectAll("*").remove();
  const width = container.node().clientWidth - 60;
  const height = container.node().clientHeight - 60;
  const margin = { top: 20, right: 60, bottom: 40, left: 60 };

  const svg = container
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

  // combine actual savings and projection
  const allDates = projectionSavingsSeries.map(d=>d.date).concat(actualSavingsSeries.map(d=>d.date));
  const x = d3.scaleTime()
    .domain(d3.extent(allDates))
    .range([0, width]);
  const maxSavings = d3.max([
    d3.max(projectionSavingsSeries, d=>d.savings),
    d3.max(actualSavingsSeries, d=>d.savings || 0)
  ]);
  const y = d3.scaleLinear()
    .domain([0, maxSavings * 1.1])
    .nice()
    .range([height, 0]);

  svg.append("g").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(2)).tickFormat(d3.timeFormat("%b")));
  svg.append("g")
    .call(d3.axisLeft(y).tickFormat(d => "$" + d));

  const line = d3.line()
    .x(d=>x(d.date))
    .y(d=>y(d.savings))
    .curve(d3.curveMonotoneX);

  // projection line
  svg.append("path")
    .datum(projectionSavingsSeries)
    .attr("fill", "none")
    .attr("stroke", "#33a02c")
    .attr("stroke-width", 2)
    .attr("d", line);

  // actual savings (might have fewer points)
  svg.append("path")
    .datum(actualSavingsSeries)
    .attr("fill", "none")
    .attr("stroke", "#b2df8a")
    .attr("stroke-width", 2)
    .attr("d", line);

  svg.append("text")
    .attr("x", 0)
    .attr("y", -5)
    .text("Cumulative Savings: Actual vs Projected")
    .attr("font-size", "14px")
    .attr("font-weight", "700");
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
    drawBalanceChart();
  });
}

// Initial load
loadAndProcess();
