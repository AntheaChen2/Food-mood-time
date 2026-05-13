const currentUser = getMvpUser();

if (!currentUser) {
  window.location.href = "login.html";
} else {
  document.getElementById("userName").textContent = currentUser.name;
}

const state = {
  selectedDate: startOfDay(new Date()),
  weekOffset: 0,
  selectedMealEntryId: null,
  selectedMoodFilter: "body",
  entries: []
};

const mealTypes = [
  { type: "breakfast", label: "早餐", matchTypes: ["breakfast"] },
  { type: "lunch", label: "午餐", matchTypes: ["lunch"] },
  { type: "dinner", label: "晚餐", matchTypes: ["dinner"] },
  { type: "snacks", label: "零食/飲料", matchTypes: ["snacks", "drinks"] }
];

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getMonday(date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(copy, diff);
}

function formatDayName(date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

function formatTaiwanTime(timestamp) {
  return new Date(timestamp).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit"
  });
}


/* =========================
   WEATHER
========================= */

function getWeatherIcon(weatherCode) {
  // clear sky
  if (weatherCode === 0) return "☀️";

  // partly cloudy
  if ([1, 2].includes(weatherCode)) return "🌤️";

  // cloudy
  if (weatherCode === 3) return "☁️";

  // fog
  if ([45, 48].includes(weatherCode)) return "🌫️";

  // drizzle
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "🌦️";

  // rain
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return "🌧️";
  }

  // snow
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return "❄️";
  }

  // thunderstorm
  if ([95, 96, 99].includes(weatherCode)) {
    return "⛈️";
  }

  return "🌤️";
}

async function loadLocalWeather() {
  const weatherIcon = document.getElementById("weatherIcon");

  if (!weatherIcon) return;

  // browser doesn't support geolocation
  if (!navigator.geolocation) {
    weatherIcon.textContent = "☀️";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async position => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code`
        );

        const data = await response.json();

        const weatherCode = data.current.weather_code;

        weatherIcon.textContent = getWeatherIcon(weatherCode);

      } catch (error) {
        console.error("Weather API error:", error);

        weatherIcon.textContent = "☀️";
      }
    },

    error => {
      console.error("Location error:", error);

      weatherIcon.textContent = "☀️";
    },

    {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 1000 * 60 * 30
    }
  );
}

function valueToChartY(value) {
  const baselineY = 60;
  const step = 18;
  const safeValue = Number(value || 3);

  return baselineY - (safeValue - 3) * step;
}

const moodEmojis = ["😭", "🙁", "😐", "😊", "😄"];

function getMoodEmoji(value) {
  return moodEmojis[Math.max(1, Math.min(5, value || 3)) - 1];
}

function getMealCardSummary(entry) {
  const hungerBefore = entry.hungerBefore ?? 3;
  const hungerAfter = entry.hungerAfter ?? 3;
  const moodBefore = entry.mood?.moodBefore ?? 3;
  const moodAfter = entry.mood?.moodAfter ?? 3;

return `
    <div class="meal-change-panel">
      <div class="change-pill">
        <span class="change-label">飢餓</span>
        <strong>${hungerBefore}</strong>
        <span class="arrow">→</span>
        <strong>${hungerAfter}</strong>
      </div>
      <div class="change-pill">
        <span class="change-label">心情</span>
        <span style="font-size: 14px;">${getMoodEmoji(moodBefore)}</span>
        <span class="arrow">→</span>
        <span style="font-size: 14px;">${getMoodEmoji(moodAfter)}</span>
      </div>
    </div>
  `;
}

function getPublicImageUrl(path) {
  if (!path) return "";

  const { data } = db.storage
    .from("food-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function loadSupabaseEntries() {
  if (!currentUser) return [];

  const { data, error } = await db
    .from("food_logs")
    .select(`
      *,
      mood_entries(*),
      meal_contexts(*),
      food_log_items(*)
    `)
    .eq("user_id", currentUser.id)
    .order("eaten_at", { ascending: false });

  if (error) {
    alert(error.message);
    return [];
  }

  console.log('Loaded data from Supabase:', data.length, 'entries');

  return data.map(row => {
    const before = row.mood_entries?.find(m => m.timing === "before_meal");
    const after = row.mood_entries?.find(m => m.timing === "after_meal");
    const context = row.meal_contexts?.[0];

    console.log('Entry', row.id, 'eaten_at:', row.eaten_at, 'date:', new Date(row.eaten_at));

    return {
      id: row.id,
      date: new Date(row.eaten_at),
      mealType: row.meal_type,
      type: row.input_type,
      foodIntake: row.food_intake || 3,
      content:
        row.input_type === "photo"
          ? getPublicImageUrl(row.image_path)
          : row.food_description,
      calories: Math.round(Number(row.calories || 0)),
      carbs: Math.round(Number(row.carbs_g || 0)),
      protein: Math.round(Number(row.protein_g || 0)),
      fat: Math.round(Number(row.fat_g || 0)),
      fiber: Math.round(Number(row.fiber_g || 0)),

      greenRatio: Number(row.green_ratio || 0),
      yellowRatio: Number(row.yellow_ratio || 0),
      orangeRatio: Number(row.orange_ratio || 0),

      items: row.food_log_items || [],
      notes: context?.note || "",
      context: {
        who: context?.who_tags || [],
        where: context?.where_tags || [],
        why: context?.why_tags || [],
        activity: context?.activity_tags || []
      },
      mood: {
        bodyBefore: before?.body_status ?? null,
        bodyAfter: after?.body_status ?? null,
        moodBefore: before?.mood_level ?? null,
        moodAfter: after?.mood_level ?? null,
        stressBefore: before?.stress_level ?? null,
        stressAfter: after?.stress_level ?? null
      },
      hungerBefore: before?.hunger_level ?? null,
      hungerAfter: after?.hunger_level ?? null
    };
  });
}

function getVisibleEntries() {
  const todayEntries = state.entries.filter(entry =>
    isSameDay(entry.date, state.selectedDate)
  );

  if (!state.selectedMealEntryId) return todayEntries;

  return todayEntries.filter(entry => entry.id === state.selectedMealEntryId);
}

function getGroupedMealEntry(matchTypes) {
  return state.entries.find(
    entry =>
      matchTypes.includes(entry.mealType) &&
      isSameDay(entry.date, state.selectedDate)
  );
}

function renderWeek() {
  const weekDays = document.getElementById("weekDays");
  weekDays.innerHTML = "";

  const baseMonday = getMonday(new Date());
  const weekStart = addDays(baseMonday, state.weekOffset * 7);

  for (let i = 0; i < 7; i += 1) {
    const day = addDays(weekStart, i);
    const button = document.createElement("button");

    button.className = `day-button ${
      isSameDay(day, state.selectedDate) ? "active" : ""
    }`;

    button.innerHTML = `
      <small>${formatDayName(day)}</small>
      <strong>${day.getDate()}</strong>
    `;

    button.addEventListener("click", () => {
      state.selectedDate = startOfDay(day);
      state.selectedMealEntryId = null;
      renderAll();
    });

    weekDays.appendChild(button);
  }
}

function renderMealCards() {
  const container = document.getElementById("mealCards");
  container.innerHTML = "";

  mealTypes.forEach(({ type, label, matchTypes }) => {
    const mealEntry = getGroupedMealEntry(matchTypes);
    console.log('Meal', type, 'entry:', mealEntry ? mealEntry.id : null);
    const button = document.createElement("button");

    if (!mealEntry) {
      button.className = "meal-card empty";
      button.innerHTML = `
        <span class="meal-label">${label}</span>
        <span class="meal-add">新增</span>
      `;
      button.addEventListener("click", () => openRecordingPage(type));
    } else if (mealEntry.type === "photo") {
      button.className = `meal-card photo ${
        state.selectedMealEntryId === mealEntry.id ? "selected" : ""
      }`;
      button.innerHTML = `
        <img src="${mealEntry.content}" alt="${label}" />
        <div class="meal-overlay">
          ${getMealCardSummary(mealEntry)}
        </div>
      `;
      button.addEventListener("click", () => toggleMealFilter(mealEntry.id));
    } else {
      button.className = `meal-card text ${
        state.selectedMealEntryId === mealEntry.id ? "selected" : ""
      }`;
      button.innerHTML = `
        <div class="meal-text-content">
          <p>${mealEntry.content || "文字記錄"}</p>
          ${getMealCardSummary(mealEntry)}
        </div>
      `;

      button.addEventListener("click", () => toggleMealFilter(mealEntry.id));
    }

    container.appendChild(button);
  });
}

function toggleMealFilter(entryId) {
  state.selectedMealEntryId =
    state.selectedMealEntryId === entryId ? null : entryId;

  renderAll();
}

function renderNutrition() {
  const entries = getVisibleEntries();

  const calories = entries.reduce((sum, entry) => sum + (entry.calories || 0), 0);
  const carbs = entries.reduce((sum, entry) => sum + (entry.carbs || 0), 0);
  const protein = entries.reduce((sum, entry) => sum + (entry.protein || 0), 0);
  const fiber = entries.reduce((sum, entry) => sum + (entry.fiber || 0), 0);
  const fat = entries.reduce((sum, entry) => sum + (entry.fat || 0), 0);

  document.getElementById("totalCalories").textContent = calories;
  document.getElementById("totalCarbs").textContent = `${carbs}g`;
  document.getElementById("totalProtein").textContent = `${protein}g`;
  document.getElementById("totalFiber").textContent = `${fiber}g`;
  document.getElementById("totalFat").textContent = `${fat}g`;

  let intakeStatus = "尚未記錄";

  if (entries.length > 0) {
    const avgIntake =
      entries.reduce(
        (sum, entry) => sum + (entry.foodIntake || 3),
        0
      ) / entries.length;

    if (avgIntake <= 2) {
      intakeStatus = "比平常少";
    } else if (avgIntake >= 4) {
      intakeStatus = "比平常多";
    } else {
      intakeStatus = "正常";
    }
  }

  document.getElementById("intakeStatus").textContent =
    intakeStatus;
  renderNutritionDonut({ carbs, protein, fat, fiber });

  renderFoodGroups(entries);
}
function renderNutritionDonut({ carbs, protein, fat, fiber }) {
  const segments = [
    { id: "carbsArc", value: carbs * 4 },
    { id: "proteinArc", value: protein * 4 },
    { id: "fatArc", value: fat * 9 },
    { id: "fiberArc", value: fiber * 2 }
  ];

  const circumference = 2 * Math.PI * 55;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  let accumulated = 0;

  segments.forEach(segment => {
    const element = document.getElementById(segment.id);
    if (!element) return;

    if (total <= 0 || segment.value <= 0) {
      element.style.strokeDasharray = `0 ${circumference}`;
      element.style.strokeDashoffset = "0";
      return;
    }

    const length = (segment.value / total) * circumference;

    element.style.strokeDasharray = `${length} ${circumference}`;
    element.style.strokeDashoffset = `${-accumulated}`;

    accumulated += length;
  });
}

function renderFoodGroups(entries) {
  const foodGroups = document.getElementById("foodGroups");
  const items = entries.flatMap(entry => entry.items || []);

  if (!items.length) {
    foodGroups.innerHTML = `<div>尚無食物資料</div>`;
    return;
  }

  const totalCalories = items.reduce(
    (sum, item) => sum + Number(item.calories || 0),
    0
  );

  const colorOrder = [
    { key: "green", label: "多吃" },
    { key: "yellow", label: "適量" },
    { key: "orange", label: "偶爾吃" }
  ];

  foodGroups.innerHTML = `
    <div class="food-legend">
      <span><i class="dot green"></i>多吃</span>
      <span><i class="dot yellow"></i>適量</span>
      <span><i class="dot orange"></i>偶爾吃</span>
    </div>

    ${colorOrder
      .map(({ key, label }) => {
        const colorItems = items.filter(
          item => item.color_category === key
        );

        const colorCalories = colorItems.reduce(
          (sum, item) => sum + Number(item.calories || 0),
          0
        );

        const ratio = totalCalories
          ? (colorCalories / totalCalories) * 100
          : 0;

        const barHeight = Math.max((ratio / 100) * 44, 8);

        const names = colorItems
          .map(
            item =>
              item.original_food ||
              item.matched_name ||
              item.search_name
          )
          .filter(Boolean)
          .join("、");

        return `
          <div class="food-color-row">

            <div class="food-color-bar-track">
              <div
                class="food-color-bar ${key}"
                style="height:${barHeight}px"
              ></div>
            </div>

            <div class="food-color-text">
              <strong>${names || label}</strong>
            </div>

          </div>
        `;
      })
      .join("")}
  `;
}

function renderMoodTrend() {
  updateTrendColors();
  document.querySelectorAll(".mood-tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.mood === state.selectedMoodFilter
    );
  });

  let entriesByMeal;

  if (state.selectedMealEntryId) {
    const selectedEntry = state.entries.find(
      entry => entry.id === state.selectedMealEntryId
    );

    entriesByMeal = mealTypes.map(({ matchTypes }) =>
      selectedEntry && matchTypes.includes(selectedEntry.mealType)
        ? selectedEntry
        : null
    );
  } else {
    entriesByMeal = mealTypes.map(
      ({ matchTypes }) => getGroupedMealEntry(matchTypes) || null
    );
  }

  const keyMap = {
    body: ["bodyBefore", "bodyAfter"],
    mood: ["moodBefore", "moodAfter"],
    stress: ["stressBefore", "stressAfter"]
  };

const [beforeKey, afterKey] = keyMap[state.selectedMoodFilter];
const recordedMealCount = entriesByMeal.filter(Boolean).length;

if (state.selectedMealEntryId || recordedMealCount === 1) {
  renderSelectedMealDots(entriesByMeal, beforeKey, afterKey);
} else {
  document.getElementById("beforeDot").setAttribute("r", "0");
  document.getElementById("afterDot").setAttribute("r", "0");

  document
    .getElementById("beforeTrend")
    .setAttribute("points", buildSingleTrendLine(entriesByMeal, beforeKey));

  document
    .getElementById("afterTrend")
    .setAttribute("points", buildSingleTrendLine(entriesByMeal, afterKey));
}

updateMoodTabEmojis(entriesByMeal);
}

function renderSelectedMealDots(entries, beforeKey, afterKey) {
  const xs = [35, 95, 155, 215];

  const selectedIndex = entries.findIndex(entry => entry);

  if (selectedIndex === -1) {
    document.getElementById("beforeDot").setAttribute("r", "0");
    document.getElementById("afterDot").setAttribute("r", "0");
    return;
  }

  const entry = entries[selectedIndex];

  const beforeValue = entry?.mood?.[beforeKey] ?? 3;
  const afterValue = entry?.mood?.[afterKey] ?? 3;

  const x = xs[selectedIndex];
  const beforeY = valueToChartY(beforeValue);
  const afterY = valueToChartY(afterValue);

  document.getElementById("beforeTrend").setAttribute("points", "");
  document.getElementById("afterTrend").setAttribute("points", "");

  const beforeDot = document.getElementById("beforeDot");
  const afterDot = document.getElementById("afterDot");

  beforeDot.setAttribute("cx", x - 8);
  beforeDot.setAttribute("cy", beforeY);
  beforeDot.setAttribute("r", "5");

  afterDot.setAttribute("cx", x + 8);
  afterDot.setAttribute("cy", afterY);
  afterDot.setAttribute("r", "5");
}

function buildSingleTrendLine(entries, key) {
  const xs = [35, 95, 155, 215];

  return entries
    .map((entry, index) => {
      const value = entry?.mood?.[key];
      if (value == null) return "";
      const y = valueToChartY(value);
      return `${xs[index]},${y}`;
    })
    .filter(Boolean)
    .join(" ");
}



function updateMoodTabEmojis(entriesByMeal) {
  const visibleEntries = entriesByMeal.filter(Boolean);
  const latestEntry = visibleEntries[visibleEntries.length - 1];

  if (!latestEntry) {
    document.querySelector('[data-mood="body"] > span:not(.mood-color)').textContent = "😊";
    document.querySelector('[data-mood="mood"] > span:not(.mood-color)').textContent = "😄";
    document.querySelector('[data-mood="stress"] > span:not(.mood-color)').textContent = "😰";
    return;
  }

  const bodyAfter = latestEntry.mood?.bodyAfter ?? 3;
  const moodAfter = latestEntry.mood?.moodAfter ?? 3;
  const stressAfter = latestEntry.mood?.stressAfter ?? 3;

  const bodyEmoji = ["😵", "😪", "🙂", "💪", "⚡"][bodyAfter - 1];
  const moodEmoji = ["😭", "🙁", "😐", "😊", "😄"][moodAfter - 1];
  const stressEmoji = ["😫", "😟", "😐", "😌", "🧘"][stressAfter - 1];

  document.querySelector('[data-mood="body"] > span:not(.mood-color)').textContent = bodyEmoji;
  document.querySelector('[data-mood="mood"] > span:not(.mood-color)').textContent = moodEmoji;
  document.querySelector('[data-mood="stress"] > span:not(.mood-color)').textContent = stressEmoji;
}

function updateTrendColors() {
  const root = document.documentElement;

  const colorMap = {
    body: {
      before: "#A7E8C9",
      after: "#1ABD79"
    },
    mood: {
      before: "#FFD78A",
      after: "#F5A000"
    },
    stress: {
      before: "#B9EDF1",
      after: "#56C6CE"
    }
  };

  const selected = colorMap[state.selectedMoodFilter];

  root.style.setProperty("--trend-before", selected.before);
  root.style.setProperty("--trend-after", selected.after);
}


function renderContextAndNote() {
  const contextTags = document.getElementById("contextTags");
  const note = document.getElementById("selectedNote");

  const visibleEntries = getVisibleEntries();

  if (visibleEntries.length === 0) {
    contextTags.innerHTML = "<span>尚無飲食情境</span>";
    note.textContent = "無筆記";
    return;
  }

  const orderedGroups = mealTypes
    .map(({ label, matchTypes }) => {
      const entry = visibleEntries.find(entry =>
        matchTypes.includes(entry.mealType)
      );

      if (!entry) return null;

      const tags = [
        ...(entry.context?.who || []),
        ...(entry.context?.where || []),
        ...(entry.context?.why || []),
        ...(entry.context?.activity || [])
      ];

      return {
        id: entry.id,
        label,
        tags,
        note: entry.notes || ""
      };
    })
    .filter(Boolean);

  contextTags.innerHTML = orderedGroups
    .map(group => `
      <div class="context-meal-row">
        <strong>${group.label}</strong>
        <div class="context-tags-line">
          ${
            group.tags.length
              ? group.tags.map(tag => `<span>${tag}</span>`).join("")
              : "<span>無情境</span>"
          }
        </div>
      </div>
    `)
    .join("");

    note.innerHTML = orderedGroups
      .map(group => `
        <div class="note-meal-row" data-food-log-id="${group.id}">
          <strong>${group.label}</strong>
          <span class="note-text">${group.note || "無筆記"}</span>
        </div>
      `)
      .join("");
}

function openRecordingPage(defaultMealType, inputType = "photo") {
  const validMealTypes = ["breakfast", "lunch", "dinner", "snacks", "drinks"];
  const params = new URLSearchParams();

  if (validMealTypes.includes(defaultMealType)) {
    localStorage.setItem("default_meal_type", defaultMealType);
    params.set("meal", defaultMealType);
  }

  if (["photo", "text"].includes(defaultMealType)) {
    inputType = defaultMealType;
  }

  localStorage.setItem("record_input_type", inputType);
  params.set("type", inputType);

  location.href = `record.html?${params.toString()}`;
}

function renderAll() {
  console.log('Rendering with', state.entries.length, 'entries for date', state.selectedDate);
  renderWeek();
  renderMealCards();
  renderNutrition();
  renderMoodTrend();
  renderContextAndNote();
  loadDailyHealthLog();
}

document.getElementById("prevWeek").addEventListener("click", () => {
  state.weekOffset -= 1;
  renderWeek();
});

document.getElementById("nextWeek").addEventListener("click", () => {
  state.weekOffset += 1;
  renderWeek();
});

document.getElementById("addButton").addEventListener("click", () => {
  location.href = "record.html";
});

document.getElementById("insightsButton").addEventListener("click", () => {
  window.location.href = "insights.html";
});

document.querySelectorAll(".mood-tab").forEach(button => {
  button.addEventListener("click", () => {
    state.selectedMoodFilter = button.dataset.mood;
    renderMoodTrend();
  });
});

document
  .getElementById("editNoteButton")
  .addEventListener("click", editCurrentNote);

async function initHome() {
  loadLocalWeather();
  renderAll();
  state.entries = await loadSupabaseEntries();
  // Always set selectedDate to today
  state.selectedDate = startOfDay(new Date());
  // Adjust weekOffset to show the current week
  const currentMonday = getMonday(new Date());
  const selectedMonday = getMonday(state.selectedDate);
  const diffDays = (selectedMonday.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000);
  state.weekOffset = Math.round(diffDays);
  renderAll();
}

initHome();

function getWeatherIcon(weatherCode) {
  if (weatherCode === 0) return "☀️";
  if ([1, 2].includes(weatherCode)) return "🌤️";
  if (weatherCode === 3) return "☁️";
  if ([45, 48].includes(weatherCode)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "❄️";
  if ([95, 96, 99].includes(weatherCode)) return "⛈️";

  return "🌡️";
}

async function loadLocalWeather() {
  const weatherIcon = document.getElementById("weatherIcon");

  if (!weatherIcon) return;

  if (!navigator.geolocation) {
    weatherIcon.textContent = "☀️";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async position => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      console.log("Latitude:", latitude);
      console.log("Longitude:", longitude);

      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code`
        );

        const data = await response.json();

        console.log("Weather API response:", data);

        weatherIcon.textContent = getWeatherIcon(data.current.weather_code);
      } catch (error) {
        console.error("Weather API error:", error);
        weatherIcon.textContent = "☀️";
      }
    },
    error => {
      console.error("Location error:", error);
      weatherIcon.textContent = "☀️";
    }
  );
}

let isEditingNotes = false;

function editCurrentNote() {
  const noteRows = document.querySelectorAll(".note-meal-row");

  if (!isEditingNotes) {
    noteRows.forEach(row => {
      const text = row.querySelector(".note-text");
      const value = text.textContent === "無筆記" ? "" : text.textContent;

      text.outerHTML = `
        <textarea class="note-edit-input">${value}</textarea>
      `;
    });

    document.getElementById("editNoteButton").textContent = "✓";
    isEditingNotes = true;
    return;
  }

  saveEditedNotes();
}

async function saveEditedNotes() {
  const rows = document.querySelectorAll(".note-meal-row");

  for (const row of rows) {
    const foodLogId = row.dataset.foodLogId;
    const input = row.querySelector(".note-edit-input");
    const newNote = input.value.trim();

    const { error } = await db
      .from("meal_contexts")
      .update({ note: newNote || null })
      .eq("food_log_id", foodLogId)
      .eq("user_id", currentUser.id);

    if (error) {
      alert(error.message);
      return;
    }

    const entry = state.entries.find(e => e.id === foodLogId);
    if (entry) entry.notes = newNote;
  }

  document.getElementById("editNoteButton").textContent = "✎";
  isEditingNotes = false;
  renderContextAndNote();
}

function formatSleep(minutes) {
  if (!minutes && minutes !== 0) return "尚無資料";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hours} hr ${mins} 分鐘`;
}

function formatDateForSupabase(date) {
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei"
  });
}

async function loadDailyHealthLog() {
  if (!currentUser) return;

  const selectedDateString =
    formatDateForSupabase(state.selectedDate);

  console.log(selectedDateString);

  const { data, error } = await db
    .from("daily_health_logs")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("log_date", selectedDateString)
    .maybeSingle();

  if (error) {
    console.warn(error.message);
    return;
  }

  document.getElementById("sleepDuration").textContent =
    data ? formatSleep(data.sleep_minutes) : "--";

  document.getElementById("sleepScore").textContent =
    data?.sleep_score ?? "--";

  document.getElementById("stepCount").textContent =
    data?.steps ?? "--";

  document.getElementById("stressScore").textContent =
    data?.stress_score ?? "--";
}