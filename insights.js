let insightStartDate = getSevenDaysAgoDate();
let insightEndDate = getTodayDate();

const currentUser = getMvpUser();

if (!currentUser) {
  window.location.href = "login.html";
}

function getTaiwanDateString(date) {
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei"
  });
}

function getSevenDaysAgoDate() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return getTaiwanDateString(date);
}

function getTodayDate() {
  return getTaiwanDateString(new Date());
}

function getPublicImageUrl(path) {
  if (!path) return "";

  const { data } = db.storage
    .from("food-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

function getContextTags(context) {
  if (!context) return [];

  return [
    ...(context.who_tags || []),
    ...(context.where_tags || []),
    ...(context.why_tags || []),
    ...(context.activity_tags || [])
  ];
}

async function loadWeeklyFoodLogs() {
  const { data, error } = await db
    .from("food_logs")
    .select(`
      *,
      mood_entries(*),
      meal_contexts(*)
    `)
    .eq("user_id", currentUser.id)
    .gte("eaten_at", `${insightStartDate}T00:00:00+08:00`)
    .lte("eaten_at", `${insightEndDate}T23:59:59+08:00`)
    .order("eaten_at", { ascending: true });

  if (error) {
    alert(error.message);
    return [];
  }

  return data.map(row => {
    const before = row.mood_entries?.find(m => m.timing === "before_meal");
    const after = row.mood_entries?.find(m => m.timing === "after_meal");
    const context = row.meal_contexts?.[0];

    return {
      id: row.id,
      mealType: row.meal_type,
      inputType: row.input_type,
      imageUrl: row.image_path ? getPublicImageUrl(row.image_path) : "",
      foodText: row.food_description || "文字記錄",
      foodIntake: row.food_intake || 3,
      contextTags: getContextTags(context),

      bodyBefore: before?.body_status || 3,
      bodyAfter: after?.body_status || 3,
      moodBefore: before?.mood_level || 3,
      moodAfter: after?.mood_level || 3,
      stressBefore: before?.stress_level || 3,
      stressAfter: after?.stress_level || 3,

      date: new Date(row.eaten_at)
    };
  });
}

function renderMealCards(containerId, meals) {
  const container = document.getElementById(containerId);

  if (!meals.length) {
    container.innerHTML = `<p class="empty-insight">過去七天尚無符合條件的餐點</p>`;
    return;
  }

  container.innerHTML = meals.slice(0, 6).map(meal => `
    <div class="insight-meal-card">
     ${
  meal.inputType === "photo" && meal.imageUrl
    ? `
      <img
        class="insight-photo"
        src="${meal.imageUrl}"
        alt="meal photo"
      />
    `
    : `
      <div class="insight-meal-preview text-only">
        <span>${meal.foodText}</span>
      </div>
    `
}

      <div class="insight-context">
        ${
          meal.contextTags.length
            ? meal.contextTags.slice(0, 4).map(tag => `<span>${tag}</span>`).join("")
            : "<span>無情境</span>"
        }
      </div>
    </div>
  `).join("");
}

function renderInsightGroups(meals) {
  const energyMeals = meals.filter(meal =>
    [4, 5].includes(Number(meal.bodyAfter))
  );

  const happyMeals = meals.filter(meal =>
    [4, 5].includes(Number(meal.moodAfter))
  );

  const lowMoodOrStressMeals = meals.filter(meal =>
    [1, 2].includes(Number(meal.moodBefore)) ||
    [1, 2].includes(Number(meal.stressBefore))
  );

  renderMealCards("energyMeals", energyMeals);
  renderMealCards("happyMeals", happyMeals);
  renderMealCards("stressMeals", lowMoodOrStressMeals);

}

function summarizeTags(meals) {
  const counts = {};

  meals.forEach(meal => {
    meal.contextTags.forEach(tag => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });

  const topTags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return topTags.length ? topTags.join("、") : "尚無明顯情境";
}

function buildTrendPoints(values) {
    const width = 330;
    const startX = -45;
    const baselineY = 200;
    const maxY = 10;

  if (!values.length) return "";

  return values.map((value, index) => {
    const x = startX + (width / Math.max(values.length - 1, 1)) * index;
    const normalized = Math.max(1, Math.min(5, value || 3));
    const y = baselineY - ((normalized - 1) / 4) * (baselineY - maxY);

    return `${x},${y}`;
  }).join(" ");
}

async function renderTrendChart(meals) {
  const daily = {};

  meals.forEach(meal => {
    const dateKey = getTaiwanDateString(meal.date);

    if (!daily[dateKey]) {
      daily[dateKey] = {
        intake: [],
        mood: [],
        stress: [],
        sleep: [],
        steps: []
      };
    }

    daily[dateKey].intake.push(meal.foodIntake);
    daily[dateKey].mood.push(meal.moodAfter);
    daily[dateKey].stress.push(meal.stressAfter);
  });

  /* load health log */
  const { data: healthLogs, error } = await db
    .from("daily_health_logs")
    .select("*")
    .eq("user_id", currentUser.id)
    .gte("log_date", getSevenDaysAgoDate())
    .lte("log_date", getTodayDate());

  if (!error && healthLogs) {
    healthLogs.forEach(log => {
      const dateKey = log.log_date;

      if (!daily[dateKey]) {
        daily[dateKey] = {
          intake: [],
          mood: [],
          stress: [],
          sleep: [],
          steps: []
        };
      }

      /*
        normalize values to 1~5
      */

      const sleepScore =
        log.sleep_score
          ? Math.max(
              1,
              Math.min(5, log.sleep_score / 20)
            )
          : 3;

      const stepsScore =
        log.steps
          ? Math.max(
              1,
              Math.min(5, log.steps / 2000)
            )
          : 3;

      daily[dateKey].sleep.push(sleepScore);
      daily[dateKey].steps.push(stepsScore);
    });
  }

  const dates = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    dates.push(getTaiwanDateString(d));
  }

   renderXAxisLabels(dates);

  const avg = arr =>
    arr.length
      ? arr.reduce((sum, value) => sum + value, 0) / arr.length
      : 3;

  const intakeValues = dates.map(date =>
    avg(daily[date]?.intake || [])
  );

  const moodValues = dates.map(date =>
    avg(daily[date]?.mood || [])
  );

  const stressValues = dates.map(date =>
    avg(daily[date]?.stress || [])
  );

  const sleepValues = dates.map(date =>
    avg(daily[date]?.sleep || [])
  );

  const stepsValues = dates.map(date =>
    avg(daily[date]?.steps || [])
  );

  document
    .getElementById("intakeLine")
    .setAttribute(
      "points",
      buildTrendPoints(intakeValues)
    );

  document
    .getElementById("moodLine")
    .setAttribute(
      "points",
      buildTrendPoints(moodValues)
    );

  document
    .getElementById("stressLine")
    .setAttribute(
      "points",
      buildTrendPoints(stressValues)
    );

  document
    .getElementById("sleepLine")
    .setAttribute(
      "points",
      buildTrendPoints(sleepValues)
    );

  document
    .getElementById("stepsLine")
    .setAttribute(
      "points",
      buildTrendPoints(stepsValues)
    );
}
function setupDualChart() {
  const left = document.getElementById("chartSelectLeft");
  const right = document.getElementById("chartSelectRight");

  if (left.value === right.value) {
    right.value = "moodBefore";
  }

  renderDualChart();
  updateDisabledDropdownOptions();

  left.addEventListener("change", () => {
    preventSameDropdownSelection("left");
    renderDualChart();
    updateDisabledDropdownOptions();
  });

  right.addEventListener("change", () => {
    preventSameDropdownSelection("right");
    renderDualChart();
    updateDisabledDropdownOptions();
  });
}

function setupChartFilters() {
  document.querySelectorAll(".trend-filter").forEach(button => {
    const line = document.getElementById(
      button.dataset.line
    );

    line.style.display = button.classList.contains("active")
      ? "block"
      : "none";

    button.addEventListener("click", () => {
      button.classList.toggle("active");

      const isActive =
        button.classList.contains("active");

      line.style.display = isActive
        ? "block"
        : "none";
    });
  });
}

async function initInsights() {
  const meals = await loadWeeklyFoodLogs();
  const healthLogs = await loadWeeklyHealthLogs();

  weeklyMealsCache = meals;
  weeklyHealthCache = healthLogs;

  // initialize date range controls (defaults to last 7 days)
  setupDateRangeControls();

  await setupDualChart();

  renderInsightGroups(meals);
}

initInsights();

function renderXAxisLabels(dates) {
  const labelsGroup = document.getElementById("xAxisLabels");
  if (!labelsGroup) return;

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const xs = [-45, 10, 65, 120, 175, 230, 285];

  labelsGroup.innerHTML = dates.map((dateString, index) => {
    const date = new Date(`${dateString}T00:00:00+08:00`);

    return `
      <text x="${xs[index]}" y="215" class="axis-label">
        ${weekDays[date.getDay()]}
      </text>
    `;
  }).join("");
}

let weeklyMealsCache = [];
let weeklyHealthCache = [];

// optional override for visible x-axis date keys (YYYY-MM-DD strings)
let selectedDateKeys = null;


const metricConfig = {
  intake: {
    label: "飲食份量感受",
    color: "#00166c",
    min: 1,
    max: 5,
    topLabel: "比平常多",
    midLabel: "正常",
    bottomLabel: "比平常少",
    getValue: day => avg(day.intake)
  },

  moodBefore: {
    label: "飯前心情",
    color: "#FFD78A",
    min: 1,
    max: 5,
    topLabel: "很開心",
    midLabel: "普通",
    bottomLabel: "很不開心",
    getValue: day => avg(day.moodBefore)
  },

  moodAfter: {
    label: "飯後心情",
    color: "#F5A000",
    min: 1,
    max: 5,
    topLabel: "很開心",
    midLabel: "普通",
    bottomLabel: "很不開心",
    getValue: day => avg(day.moodAfter)
  },

  stressScore: {
    label: "壓力分數",
    color: "#56C6CE",
    min: 0,
    max: 100,
    topLabel: "100",
    midLabel: "50",
    bottomLabel: "0",
    getValue: day => avg(day.stressScore)
  },

  bodyBefore: {
    label: "飯前身體狀態",
    color: "#a7e8c9",
    min: 1,
    max: 5,
    topLabel: "活力滿滿",
    midLabel: "普通",
    bottomLabel: "疲憊",
    getValue: day => avg(day.bodyBefore)
  },

  bodyAfter: {
    label: "飯後身體狀態",
     color: "#1ABD79",
    min: 1,
    max: 5,
    topLabel: "活力滿滿",
    midLabel: "普通",
    bottomLabel: "疲憊",
    getValue: day => avg(day.bodyAfter)
  },

  sleepMinutes: {
    label: "睡眠時長",
    color: "#A78BFA",
    min: 0,
    max: 600,
    topLabel: "10 小時",
    midLabel: "5 小時",
    bottomLabel: "0 小時",
    getValue: day => avg(day.sleepMinutes)
  },

  steps: {
    label: "步數",
    color: "#6B7280",
    min: 0,
    max: 12000,
    topLabel: "12k",
    midLabel: "6k",
    bottomLabel: "0",
    getValue: day => avg(day.steps)
  }
};

function avg(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function getLastSevenDateKeys() {
  // if the UI provided a custom date range, use it
  if (selectedDateKeys && Array.isArray(selectedDateKeys) && selectedDateKeys.length) {
    return selectedDateKeys;
  }

  const dates = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(getTaiwanDateString(d));
  }

  return dates;
}

function buildDailyInsightData(meals, healthLogs) {
  const dates = getLastSevenDateKeys();

  const daily = {};

  dates.forEach(dateKey => {
    daily[dateKey] = {
      intake: [],
      moodBefore: [],
      moodAfter: [],
      stressScore: [],
      bodyBefore: [],
      bodyAfter: [],
      sleepMinutes: [],
      steps: []
    };
  });

  meals.forEach(meal => {
    const dateKey = getTaiwanDateString(meal.date);
    if (!daily[dateKey]) return;

    daily[dateKey].intake.push(meal.foodIntake);
    daily[dateKey].moodBefore.push(meal.moodBefore);
    daily[dateKey].moodAfter.push(meal.moodAfter);
    daily[dateKey].stressScore.push(meal.stressScore);
    daily[dateKey].bodyBefore.push(meal.bodyBefore);
    daily[dateKey].bodyAfter.push(meal.bodyAfter);
  });

  healthLogs.forEach(log => {
    const dateKey = log.log_date;
    if (!daily[dateKey]) return;

    if (log.sleep_minutes != null) {
      daily[dateKey].sleepMinutes.push(Number(log.sleep_minutes));
    }

    if (log.steps != null) {
      daily[dateKey].steps.push(Number(log.steps));
    }
    if (log.stress_score != null) {
      daily[dateKey].stressScore.push(Number(log.stress_score));
    }
  });

  return {
    dates,
    daily
  };
}

async function loadWeeklyHealthLogs() {
  const { data, error } = await db
    .from("daily_health_logs")
    .select("*")
    .eq("user_id", currentUser.id)
    .gte("log_date", getSevenDaysAgoDate())
    .lte("log_date", getTodayDate());

  if (error) {
    console.warn(error.message);
    return [];
  }

  return data || [];
}

function valueToMiniChartY(value, config) {
  const topY = 28;
  const bottomY = 145;

  const safeValue = Math.max(
    config.min,
    Math.min(config.max, Number(value))
  );

  const ratio = (safeValue - config.min) / (config.max - config.min);

  return bottomY - ratio * (bottomY - topY);
}

function renderMiniChart(slot, metricKey) {
  const config = metricConfig[metricKey];
  const select = document.getElementById(
  slot === "A" ? "chartSelectA" : "chartSelectB"
);

if (select) {
  select.style.backgroundColor = config.color;
}

  const { dates, daily } = buildDailyInsightData(
    weeklyMealsCache,
    weeklyHealthCache
  );

  const xPositions = [58, 105, 152, 199, 246, 293, 340];

  const values = dates.map(dateKey => {
    const value = config.getValue(daily[dateKey]);
    return value == null ? null : value;
  });

  const points = values
    .map((value, index) => {
      if (value == null) return "";
      return `${xPositions[index]},${valueToMiniChartY(value, config)}`;
    })
    .filter(Boolean)
    .join(" ");

  document.getElementById(`chartLine${slot}`).setAttribute("points", points);
  document.getElementById(`chartLine${slot}`).style.stroke = config.color;

  document.getElementById(`chartDots${slot}`).innerHTML = values
    .map((value, index) => {
      if (value == null) return "";

      const x = xPositions[index];
      const y = valueToMiniChartY(value, config);

      return `
        <circle
          cx="${x}"
          cy="${y}"
          r="4.8"
          class="mini-chart-dot"
          style="fill:${config.color}"
        />
      `;
    })
    .join("");

  document.getElementById(`yLabels${slot}`).innerHTML = `
    <text x="4" y="30" class="mini-y-label">${config.topLabel}</text>
    <text x="4" y="88" class="mini-y-label muted">${config.midLabel}</text>
    <text x="4" y="145" class="mini-y-label">${config.bottomLabel}</text>
  `;

  renderMiniXAxisLabels(slot, dates);
}

function renderMiniXAxisLabels(slot, dates) {
  const group = document.getElementById(`xLabels${slot}`);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const xPositions = [58, 105, 152, 199, 246, 293, 340];

  group.innerHTML = dates
    .map((dateString, index) => {
      const date = new Date(`${dateString}T00:00:00+08:00`);
      const day = date.getDate();
      const weekday = weekDays[date.getDay()];

      return `
        <text
          x="${xPositions[index]}"
          y="166"
          text-anchor="middle"
          class="mini-x-label"
        >
          ${weekday}
        </text>

        <text
          x="${xPositions[index]}"
          y="181"
          text-anchor="middle"
          class="mini-date-label"
        >
          ${day}
        </text>
      `;
    })
    .join("");
}

function setupMiniChartDropdowns() {
  const selectA = document.getElementById("chartSelectA");
  const selectB = document.getElementById("chartSelectB");

  if (!selectA || !selectB) return;

  renderMiniChart("A", selectA.value);
  renderMiniChart("B", selectB.value);

  selectA.addEventListener("change", () => {
    renderMiniChart("A", selectA.value);
  });

  selectB.addEventListener("change", () => {
    renderMiniChart("B", selectB.value);
  });
}

function renderDualChart() {

  const leftKey =
    document.getElementById("chartSelectLeft").value;

  const rightKey =
    document.getElementById("chartSelectRight").value;

  const leftConfig = metricConfig[leftKey];
  const rightConfig = metricConfig[rightKey];
  const hasRightMetric = !!rightKey;

  const { dates, daily } = buildDailyInsightData(
    weeklyMealsCache,
    weeklyHealthCache
  );

  const xPositions = [58, 102, 146, 190, 234, 278, 322];

  const leftValues = dates.map(dateKey => {
    return leftConfig.getValue(daily[dateKey]);
  });

const rightValues = hasRightMetric
  ? dates.map(dateKey => {
      return rightConfig.getValue(daily[dateKey]);
    })
  : [];

  renderDualLine(
    "left",
    leftValues,
    leftConfig,
    xPositions
  );

 if (hasRightMetric) {
  renderDualLine(
    "right",
    rightValues,
    rightConfig,
    xPositions
  );
} else {

  document.getElementById(
    "rightChartLine"
  ).setAttribute("points", "");

  document.getElementById(
    "rightChartDots"
  ).innerHTML = "";

  document.getElementById(
    "rightYLabels"
  ).innerHTML = "";
}

 renderDualYLabels(
  leftConfig,
  hasRightMetric ? rightConfig : null
);

  renderDualXAxisLabels(dates, xPositions);

  updateDropdownColors();
  updateDisabledDropdownOptions();
}

function renderDualYLabels(
  leftConfig,
  rightConfig
) {

  // LEFT LABELS
  document.getElementById(
    "leftYLabels"
  ).innerHTML = `
    <text x="52" y="28" text-anchor="end" class="dual-y-label">
      ${leftConfig.topLabel}
    </text>

    <text x="52" y="108" text-anchor="end" class="dual-y-label">
      ${leftConfig.midLabel}
    </text>

    <text x="52" y="170" text-anchor="end" class="dual-y-label">
      ${leftConfig.bottomLabel}
    </text>
  `;

  // 沒選右邊 metric
  if (!rightConfig) {

    document.getElementById(
      "rightYLabels"
    ).innerHTML = "";

    return;
  }

  // RIGHT LABELS
  document.getElementById(
    "rightYLabels"
  ).innerHTML = `
   <text x="352" y="28" text-anchor="start" class="dual-y-label">
      ${rightConfig.topLabel}
    </text>

    <text x="352" y="108" text-anchor="start" class="dual-y-label">
      ${rightConfig.midLabel}
    </text>

    <text x="352" y="170" text-anchor="start" class="dual-y-label">
      ${rightConfig.bottomLabel}
    </text>
  `;
}

function updateDropdownColors() {
  const leftSelect = document.getElementById("chartSelectLeft");
  const rightSelect = document.getElementById("chartSelectRight");

  const leftConfig = metricConfig[leftSelect.value];
  const rightConfig = metricConfig[rightSelect.value];

  if (leftConfig) {
    leftSelect.style.backgroundColor = leftConfig.color;
  }

  if (rightConfig) {
    rightSelect.style.backgroundColor = rightConfig.color;
  } else {
    rightSelect.style.backgroundColor = "#9CA3AF"; // 請選擇時的灰色
  }
}

function renderDualLine(side, values, config, xPositions) {
  const line = document.getElementById(
    side === "left" ? "leftChartLine" : "rightChartLine"
  );

  const dots = document.getElementById(
    side === "left" ? "leftChartDots" : "rightChartDots"
  );

  const points = values
    .map((value, index) => {
      if (value == null) return "";

      const x = xPositions[index];
      const y = valueToMiniChartY(value, config);

      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  line.setAttribute("points", points);
  line.style.stroke = config.color;

  dots.innerHTML = values
    .map((value, index) => {
      if (value == null) return "";

      const x = xPositions[index];
      const y = valueToMiniChartY(value, config);

      return `
        <circle
          cx="${x}"
          cy="${y}"
          r="4.8"
          class="dual-dot"
          style="fill:${config.color}"
        />
      `;
    })
    .join("");
}

function renderDualXAxisLabels(dates, xPositions) {
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  document.getElementById("dualXLabels").innerHTML = dates
    .map((dateString, index) => {
      const date = new Date(`${dateString}T00:00:00+08:00`);

      return `
        <text
          x="${xPositions[index]}"
          y="198"
          text-anchor="middle"
          class="dual-x-label"
        >
          ${weekDays[date.getDay()]}
        </text>

        <text
          x="${xPositions[index]}"
          y="214"
          text-anchor="middle"
          class="dual-date-label"
        >
          ${date.getDate()}
        </text>
      `;
    })
    .join("");
}


function preventSameDropdownSelection(changedSide) {
  const left = document.getElementById("chartSelectLeft");
  const right = document.getElementById("chartSelectRight");

  if (left.value !== right.value) return;

  const fallback = [...right.options].find(
    option => option.value !== left.value
  )?.value;

  if (changedSide === "left") {
    right.value = fallback;
  } else {
    left.value = fallback;
  }
}

function updateDisabledDropdownOptions() {
  const left = document.getElementById("chartSelectLeft");
  const right = document.getElementById("chartSelectRight");

  [...left.options].forEach(option => {
    option.disabled =
    option.value !== "" &&
    option.value === left.value;
  });

  [...right.options].forEach(option => {
    option.disabled = option.value === left.value;
  });
}

function computeDateKeysBetween(startIso, endIso) {
  // startIso and endIso are strings in YYYY-MM-DD
  const start = new Date(`${startIso}T00:00:00+08:00`);
  const end = new Date(`${endIso}T00:00:00+08:00`);
  if (isNaN(start) || isNaN(end) || start > end) return null;

  const keys = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    keys.push(getTaiwanDateString(new Date(d)));
    // prevent runaway ranges
    if (keys.length > 31) break;
  }

  return keys;
}

async function setupDateRangeControls() {
  const startInput = document.getElementById("startDateInput");
  if (!startInput) return;

  startInput.value = getSevenDaysAgoDate();

  await updateDateRangeFromStartDate();

  startInput.addEventListener("change", async () => {
    await updateDateRangeFromStartDate();
  });
}

async function updateDateRangeFromStartDate() {
  const startInput = document.getElementById("startDateInput");
  if (!startInput || !startInput.value) return;

  insightStartDate = startInput.value;

  const start = new Date(`${insightStartDate}T00:00:00+08:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  insightEndDate = getTaiwanDateString(end);

  selectedDateKeys = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    selectedDateKeys.push(getTaiwanDateString(d));
  }

  const meals = await loadWeeklyFoodLogs();
  const healthLogs = await loadWeeklyHealthLogs();

  weeklyMealsCache = meals;
  weeklyHealthCache = healthLogs;

  renderDualChart();
  renderInsightGroups(meals);
}

