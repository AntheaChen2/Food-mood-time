const STORAGE_KEY = 'food_mood_entries';

const mealTypes = [
  ['breakfast', '早餐'],
  ['lunch', '午餐'],
  ['dinner', '晚餐'],
  ['snacks', '零食'],
  ['drinks', '飲料']
];

const tagOptions = {
  whyEat: ['肚子餓', '嘴饞', '社交', '美食', '時間到了', '壓力'],
  whoEatWith: ['自己', '朋友', '家人', '同學', '愛人'],
  whereEat: ['宿舍', '家裡', '餐廳', '教室', '咖啡廳'],
  activities: ['滑手機', '看影片', '看電視','用電腦', '聊天', '閱讀']
};

const iconSets = {
  body: [
    {icon: "emoji/Body1.png", label: '疲憊'},
    {icon: "emoji/Body2.png", label: ''},
    {icon: "emoji/Body3.png", label: ''},
    {icon: "emoji/Body4.png", label: ''},
    {icon: "emoji/Body5.png", label: '活力滿滿'}
  ],
  mood: [
    {icon: "emoji/Mood1.png", label: '很不開心'},
    {icon: "emoji/Mood2.png", label: ''},
    {icon: "emoji/Mood3.png", label: ''},
    {icon: "emoji/Mood4.png", label: ''},
    {icon: "emoji/Mood5.png", label: '很開心'}
  ],
  stress: [
    {icon: "emoji/stress1.png", label: '沒有壓力'},
    {icon: "emoji/stress2.png", label: ''},
    {icon: "emoji/stress3.png", label: ''},
    {icon: "emoji/stress4.png", label: ''},
    {icon: "emoji/stress5.png", label: '壓力很大'}
  ]
};

const requiredScaleFields = [
  'foodIntake',
  'hungerBefore', 'bodyBefore', 'moodBefore', 'stressBefore',
  'hungerAfter', 'bodyAfter', 'moodAfter', 'stressAfter'
];
const requiredTagFields = ['whyEat', 'whoEatWith', 'whereEat', 'activities'];

const state = {
  inputType: new URLSearchParams(location.search).get('type') || localStorage.getItem('record_input_type') || 'photo',
  mealType: new URLSearchParams(location.search).get('meal') || localStorage.getItem('default_meal_type') || inferMealType(new Date()),
  selected: {},
  multi: { whyEat: [], whoEatWith: [], whereEat: [], activities: [] },
  photoDataUrl: '',
  photoFile: null
};

function inferMealType(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 20) return 'dinner';
  return 'snacks';
}

function pad(value) { return String(value).padStart(2, '0'); }
function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function formatTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setMealDateTime(date = new Date()) {
  document.getElementById("mealDate").value = formatDate(date);
  document.getElementById("mealTime").value = formatTime(date);
}

async function convertImageToJpeg(file, quality = 0.9) {
  const fileName = file.name.toLowerCase();

  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif");

  const isJpeg =
    file.type === "image/jpeg" ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg");

  // JPG/JPEG 不要再轉，避免 canvas 轉黑
  if (isJpeg) {
    return new File(
      [file],
      file.name.replace(/\.[^.]+$/, ".jpg"),
      { type: "image/jpeg" }
    );
  }

  // HEIC 才用 heic2any
  if (isHeic) {
    const convertedBlob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality
    });

    return new File(
      [convertedBlob],
      file.name.replace(/\.[^.]+$/, ".jpg"),
      { type: "image/jpeg" }
    );
  }

  // PNG / WEBP 才用 canvas，且先鋪白底，避免透明變黑
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(objectUrl);

          if (!blob) {
            reject(new Error("Image conversion failed"));
            return;
          }

          resolve(
            new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".jpg"),
              { type: "image/jpeg" }
            )
          );
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed"));
    };

    img.src = objectUrl;
  });
}

function todayDate() { return formatDate(); }
function nowTime() { return formatTime(); }

function parseSleepDurationToMinutes(hoursValue) {
  const hours = Number(hoursValue);

  if (Number.isNaN(hours) || hours < 0) return null;

  return Math.round(hours * 60);
}

function getMealTimeCache() {
  try {
    return JSON.parse(localStorage.getItem('food_mood_meal_time_cache') || '{}');
  } catch {
    return {};
  }
}

function setMealTimeCache(date, time) {
  const cache = getMealTimeCache();
  cache[date] = time;
  localStorage.setItem('food_mood_meal_time_cache', JSON.stringify(cache));
}

function syncMealTimeFromCache(date) {
  const mealTime = document.getElementById('mealTime');
  if (!mealTime || !date) return;
  const cachedTime = getMealTimeCache()[date];
  if (cachedTime) {
    mealTime.value = cachedTime;
  }
}

async function loadSavedHealthData(date) {
  const currentUser = getMvpUser();
  if (!currentUser) return;

  const { data, error } = await db
    .from('daily_health_logs')
    .select('sleep_minutes, sleep_score, steps, stress_score, resilience')
    .eq('user_id', currentUser.id)
    .eq('log_date', date)
    .maybeSingle();

  if (error) {
    console.warn(error.message);
    return;
  }

  if (!data) return;

  const sleepDurationInput = document.getElementById('sleepDuration');
  const sleepScoreInput = document.getElementById('sleepScore');
  const stepCountInput = document.getElementById('stepCount');
  const stressScoreInput = document.getElementById('stressScore');

  if (data.sleep_minutes != null && sleepDurationInput) {
    const totalMinutes = Math.max(0, Number(data.sleep_minutes) || 0);
    const hours = totalMinutes / 60;
    sleepDurationInput.value = Number.isInteger(hours) ? hours.toString() : hours.toFixed(1);
  }

  if (data.sleep_score != null && sleepScoreInput) {
    sleepScoreInput.value = data.sleep_score;
  }

  if (data.steps != null && stepCountInput) {
    stepCountInput.value = data.steps;
  }

  if (data.stress_score != null && stressScoreInput) {
    stressScoreInput.value = data.stress_score;
  }

  const resilienceButtons = document.querySelectorAll('[data-resilience]');
  resilienceButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.resilience === data.resilience);
  });
}

async function upsertDailyHealthLog(userId, logDate, values) {
  const payload = {
    user_id: userId,
    log_date: logDate,
    sleep_minutes: values.sleep_minutes ?? null,
    sleep_score: values.sleep_score ?? null,
    steps: values.steps ?? null,
    stress_score: values.stress_score ?? null,
    resilience: values.resilience || null
  };

  const { data: existing, error: selectError } = await db
    .from('daily_health_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('log_date', logDate)
    .maybeSingle();

  if (selectError) {
    return selectError.message;
  }

  if (existing) {
    const { error } = await db
      .from('daily_health_logs')
      .update(payload)
      .eq('id', existing.id);
    return error?.message || null;
  }

  const { error } = await db
    .from('daily_health_logs')
    .insert(payload);
  return error?.message || null;
}

async function init() {
  const params = new URLSearchParams(location.search);
  const dateParam = params.get('date');

  if (dateParam) {
    document.getElementById('mealDate').value = dateParam;
    document.getElementById('mealTime').value = formatTime(new Date());
  } else {
    setMealDateTime(new Date());
  }

  syncMealTimeFromCache(document.getElementById('mealDate').value);
  await loadSavedHealthData(document.getElementById('mealDate').value);

  renderInputType();
  renderMealChoices();
  renderScales();
  renderEmojiScales();
  renderTags();
  renderResilienceChoices();
  bindEvents();
  updateProgress();
}

function renderResilienceChoices() {
  const container = document.getElementById('resilienceChoices');
  if (!container) return;

  const options = [
    { value: '低', label: '低' },
    { value: '平衡', label: '平衡' },
    { value: '理想', label: '理想' }
  ];

  container.innerHTML = options.map(option => `
    <button
      type="button"
      class="choice resilience-choice ${state.selected.resilience === option.value ? 'active' : ''}"
      data-resilience="${option.value}"
    >
      ${option.label}
    </button>
  `).join('');

  container.querySelectorAll('.resilience-choice').forEach(button => {
    button.addEventListener('click', () => {
      state.selected.resilience = button.dataset.resilience;
      renderResilienceChoices();
    });
  });
}

function bindEvents() {
  document.getElementById('backButton').addEventListener('click', () => location.href = 'index.html');

  document.getElementById('recordForm').addEventListener('submit', event => {
    event.preventDefault();
    saveRecord();
  });

  document.querySelectorAll('.switch-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.inputType = button.dataset.type;
      localStorage.setItem('record_input_type', state.inputType);
      renderInputType();
      clearErrors();
      updateProgress();
    });
  });

  document.getElementById('foodPhoto').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const photoDate = file.lastModified
      ? new Date(file.lastModified)
      : new Date();

    if (!Number.isNaN(photoDate.getTime())) {
      setMealDateTime(photoDate);
      syncMealTimeFromCache(document.getElementById('mealDate').value);
      hideError('dateError');
      hideError('timeError');
    }

    try {
      const jpegFile = await convertImageToJpeg(file, 0.9);

      state.photoFile = jpegFile;
      state.photoDataUrl = URL.createObjectURL(jpegFile);

      const preview = document.getElementById('photoPreview');
      preview.src = state.photoDataUrl;
      preview.classList.remove('hidden');

      document.getElementById('uploadPlaceholder').classList.add('hidden');

      hideError('photoError');
      updateProgress();
    } catch (error) {
      console.error(error);
      alert('照片讀取失敗，請改用 JPG 或重新選擇照片');
    }
  });

  document.getElementById('foodText').addEventListener('input', () => {
    hideError('textError');
    updateProgress();
  });

  document.getElementById('mealDate').addEventListener('change', async () => {
    hideError('dateError');
    updateProgress();
    const date = document.getElementById('mealDate').value;
    syncMealTimeFromCache(date);
    await loadSavedHealthData(date);
  });

  document.getElementById('mealTime').addEventListener('change', () => {
    const date = document.getElementById('mealDate').value;
    if (date) {
      setMealTimeCache(date, document.getElementById('mealTime').value);
    }
    hideError('timeError');
    updateProgress();
  });

  const clampInput = (id, min, max) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
      if (input.value === '') return;
      const num = Number(input.value);
      if (Number.isNaN(num)) {
        input.value = '';
        return;
      }
      if (min != null && num < min) input.value = min;
      if (max != null && num > max) input.value = max;
    });
  };

  clampInput('sleepDuration', 0, 24);
  clampInput('sleepScore', 0, 100);
  clampInput('stepCount', 0, null);
  clampInput('stressScore', 0, 100);
}

function renderInputType() {
  document.querySelectorAll('.switch-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.type === state.inputType);
  });
  document.getElementById('photoPanel').classList.toggle('hidden', state.inputType !== 'photo');
  document.getElementById('textPanel').classList.toggle('hidden', state.inputType !== 'text');
}

function renderMealChoices() {
  const container = document.getElementById('mealTypeChoices');
  container.innerHTML = mealTypes.map(([value, label]) => `
    <button type="button" class="choice ${state.mealType === value ? 'active' : ''}" data-meal="${value}">${label}</button>
  `).join('');
  container.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      state.mealType = button.dataset.meal;
      localStorage.setItem('default_meal_type', state.mealType);
      renderMealChoices();
      updateProgress();
    });
  });
}

function renderScales() {
  document.querySelectorAll('.scale').forEach(container => {
    const name = container.dataset.name;
    container.innerHTML = [1,2,3,4,5].map(value => `<button type="button" data-value="${value}" aria-label="${name} ${value}">${value}</button>`).join('');
    container.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        state.selected[name] = Number(button.dataset.value);
        renderScale(container, name);
        hideNamedError(name);
        updateProgress();
      });
    });
    renderScale(container, name);
  });
}

function renderScale(container, name) {
  container.querySelectorAll('button').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.value) === state.selected[name]);
  });
}

function renderEmojiScales() {
  document.querySelectorAll('.emoji-scale').forEach(container => {
    const name = container.dataset.name;
    const kind = container.dataset.kind;
    container.innerHTML = iconSets[kind].map((item, index) => `
      <div class="emoji-option">
        <button
          type="button"
          aria-label="${kind} ${index + 1}"
          data-value="${index + 1}"
        >
          <img
            src="${item.icon}"
            alt="${kind} ${index + 1}"
            class="scale-icon"
          />
        </button>

        <span class="emoji-label">${item.label}</span>
      </div>
    `).join('');
    container.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        state.selected[name] = Number(button.dataset.value);
        renderEmojiScale(container, name);
        hideNamedError(name);
        updateProgress();
      });
    });
  });
}

function renderEmojiScale(container, name) {
  container.querySelectorAll('button').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.value) === state.selected[name]);
  });
}

function renderTags() {
  Object.entries(tagOptions).forEach(([name, options]) => {
    const container = document.querySelector(`.tags[data-name="${name}"]`);
    
    // Get custom options that aren't in predefined options
    const customOptions = state.multi[name].filter(opt => !options.includes(opt));
    
    // Render predefined options + custom options + 其他 button
    const allOptions = [...options, ...customOptions];
    const hasCustom = customOptions.length > 0;
    const lastCustom = customOptions[customOptions.length - 1];
    
    container.innerHTML = allOptions.map(option => {
      const isActive = state.multi[name].includes(option);
      const isCustom = customOptions.includes(option);
      return `<button type="button" class="tag${isActive ? ' active' : ''}${isCustom ? ' custom-tag' : ''}" data-option="${option}">${option}</button>`;
    }).join('') + (hasCustom ? '' : '<button type="button" class="tag other-btn" data-option="其他">其他</button>');
    
    container.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        if (button.classList.contains('other-btn')) {
          const custom = prompt('請輸入：');
          if (custom && custom.trim()) {
            const option = custom.trim();
            if (!state.multi[name].includes(option)) {
              state.multi[name].push(option);
              renderTags();
              updateProgress();
            }
          }
        } else {
          const option = button.dataset.option;
          const list = state.multi[name];
          state.multi[name] = list.includes(option) ? list.filter(item => item !== option) : [...list, option];
          renderTags();
          hideNamedError(name);
          updateProgress();
        }
      });
    });
  });
}

function requiredItems() {
  return [
    { key: 'foodInput', ok: state.inputType === 'photo' ? Boolean(state.photoDataUrl) : Boolean(document.getElementById('foodText').value.trim()) },
    { key: 'date', ok: Boolean(document.getElementById('mealDate').value) },
    { key: 'time', ok: Boolean(document.getElementById('mealTime').value) },
    { key: 'mealType', ok: Boolean(state.mealType) },
    ...requiredScaleFields.map(key => ({ key, ok: Boolean(state.selected[key]) })),
    ...requiredTagFields.map(key => ({ key, ok: state.multi[key].length > 0 }))
  ];
}

function updateProgress() {
  const items = requiredItems();
  const completed = items.filter(item => item.ok).length;
  document.getElementById('completedCount').textContent = completed;
  document.getElementById('totalRequiredCount').textContent = items.length;
  document.getElementById('progressFill').style.width = `${Math.round((completed / items.length) * 100)}%`;
}

function validateForm({ scrollToError = true } = {}) {
  clearErrors();
  const missing = [];
  const foodText = document.getElementById('foodText').value.trim();

  if (state.inputType === 'photo' && !state.photoDataUrl) {
    showError('photoError');
    missing.push(document.querySelector('[data-section="foodInput"]'));
  }
  if (state.inputType === 'text' && !foodText) {
    showError('textError');
    missing.push(document.querySelector('[data-section="foodInput"]'));
  }
  if (!document.getElementById('mealDate').value) {
    showError('dateError');
    missing.push(document.querySelector('[data-section="datetime"]'));
  }
  if (!document.getElementById('mealTime').value) {
    showError('timeError');
    missing.push(document.querySelector('[data-section="datetime"]'));
  }

  requiredScaleFields.forEach(key => {
    if (!state.selected[key]) {
      showNamedError(key);
      const section = document.querySelector(`[data-name="${key}"]`)?.closest('.card, .field-card, .two-column');
      if (section) missing.push(section);
    }
  });

  requiredTagFields.forEach(key => {
    if (state.multi[key].length === 0) {
      showNamedError(key);
      const section = document.querySelector(`[data-name="${key}"]`)?.closest('.card, .field-card, .two-column');
      if (section) missing.push(section);
    }
  });

  [...new Set(missing)].forEach(section => section.classList.add('invalid-card'));
  updateProgress();

  if (missing.length && scrollToError) {
    missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return missing.length === 0;
}

function showError(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideError(id) { document.getElementById(id)?.classList.add('hidden'); }
function showNamedError(name) { document.querySelector(`[data-error-for="${name}"]`)?.classList.remove('hidden'); }
function hideNamedError(name) { document.querySelector(`[data-error-for="${name}"]`)?.classList.add('hidden'); }

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.invalid-card').forEach(el => el.classList.remove('invalid-card'));
}

async function saveRecord() {
  if (!validateForm()) return;

  const currentUser = getMvpUser();
  if (!currentUser) return;

  const { data: existingUser, error: userCheckError } = await db
    .from('app_users')
    .select('id')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (userCheckError) {
    alert(userCheckError.message);
    return;
  }

  if (!existingUser) {
    alert('找不到使用者資料，請重新登入');
    localStorage.removeItem('foodMoodUser');
    window.location.href = 'login.html';
    return;
  }

  const foodText = document.getElementById('foodText').value.trim();
  const date = document.getElementById('mealDate').value;
  const time = document.getElementById('mealTime').value;
  const notes = document.getElementById('notes').value.trim();
  const sleepDurationValue = document.getElementById('sleepDuration').value.trim();
  const sleepScoreValue = document.getElementById('sleepScore').value.trim();
  const stepCountValue = document.getElementById('stepCount').value.trim();
  const stressScoreValue = document.getElementById('stressScore').value.trim();
  const resilienceValue = state.selected.resilience || '';

  setMealTimeCache(date, time);

  let imagePath = null;
  let imageUrl = null;
  let mimeType = null;

  if (state.inputType === 'photo') {
    const file = state.photoFile;

    if (!file) {
      alert('請上傳照片');
      return;
    }

    mimeType = 'image/jpeg';

    imagePath = `${currentUser.id}/${Date.now()}.jpg`;

    const { error: uploadError } = await db.storage
      .from('food-images')
      .upload(imagePath, file, {
        contentType: mimeType
      });

    if (uploadError) {
      alert(uploadError.message);
      return;
    }

    const { data: publicUrlData } = db.storage
      .from('food-images')
      .getPublicUrl(imagePath);

    imageUrl = publicUrlData.publicUrl;
  }

  const { data: foodLog, error: foodLogError } = await db
    .from('food_logs')
    .insert({
      user_id: currentUser.id,
      meal_type: state.mealType,
      input_type: state.inputType,

      image_path: imagePath,
      image_url: state.inputType === 'photo' ? imageUrl : null,
      mime_type: state.inputType === 'photo' ? mimeType : null,
      ai_status: 'pending',

      food_description:
        state.inputType === 'text'
          ? foodText
          : null,

      eaten_at: new Date(`${date}T${time}`).toISOString(),
      food_intake: state.selected.foodIntake
    })
    .select()
    .single();

  if (foodLogError) {
    alert(foodLogError.message);
    return;
  }

  const { error: moodError } = await db.from('mood_entries').insert([
    {
      food_log_id: foodLog.id,
      user_id: currentUser.id,
      timing: 'before_meal',
      hunger_level: state.selected.hungerBefore,
      body_status: state.selected.bodyBefore,
      mood_level: state.selected.moodBefore,
      stress_level: state.selected.stressBefore
    },
    {
      food_log_id: foodLog.id,
      user_id: currentUser.id,
      timing: 'after_meal',
      hunger_level: state.selected.hungerAfter,
      body_status: state.selected.bodyAfter,
      mood_level: state.selected.moodAfter,
      stress_level: state.selected.stressAfter
    }
  ]);

  if (moodError) {
    alert(moodError.message);
    return;
  }

  const { error: contextError } = await db.from('meal_contexts').insert({
    food_log_id: foodLog.id,
    user_id: currentUser.id,
    why_tags: state.multi.whyEat,
    who_tags: state.multi.whoEatWith,
    where_tags: state.multi.whereEat,
    activity_tags: state.multi.activities,
    note: notes || null
  });

  if (contextError) {
    alert(contextError.message);
    return;
  }

  const sleepMinutes = sleepDurationValue
    ? parseSleepDurationToMinutes(sleepDurationValue)
    : null;

  if (
    sleepMinutes != null ||
    sleepScoreValue ||
    stepCountValue ||
    stressScoreValue ||
    resilienceValue
  ) {
    const healthError = await upsertDailyHealthLog(currentUser.id, date, {
      sleep_minutes: sleepMinutes,
      sleep_score: sleepScoreValue ? Number(sleepScoreValue) : null,
      steps: stepCountValue ? Number(stepCountValue) : null,
      stress_score: stressScoreValue ? Number(stressScoreValue) : null,
      resilience: resilienceValue || null
    });

    if (healthError) {
      alert(healthError);
      return;
    }
  }

  alert('儲存成功');
  location.href = 'index.html';
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 1300);
}

init();
