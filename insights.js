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
    .gte("eaten_at", `${getSevenDaysAgoDate()}T00:00:00+08:00`)
    .lte("eaten_at", `${getTodayDate()}T23:59:59+08:00`)
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

  renderInsightGroups(meals);
await renderTrendChart(meals);
  setupChartFilters();
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