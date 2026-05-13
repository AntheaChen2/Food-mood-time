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
  activities: ['滑手機', '看影片', '看電視', '聊天', '閱讀']
};

const emojiSets = {
  body: ['😵', '😪', '🙂', '💪', '⚡'],
  mood: ['😭', '🙁', '😐', '😊', '😄'],
  stress: ['😫', '😟', '😐', '😌', '🧘']
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
  photoDataUrl: ''
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
function todayDate() { return formatDate(); }
function nowTime() { return formatTime(); }

function init() {
  document.getElementById('mealDate').value = todayDate();
  document.getElementById('mealTime').value = nowTime();
  renderInputType();
  renderMealChoices();
  renderScales();
  renderEmojiScales();
  renderTags();
  bindEvents();
  updateProgress();
}

function bindEvents() {
  document.getElementById('backButton').addEventListener('click', () => location.href = 'index.html');
  document.getElementById('saveTopButton').addEventListener('click', () => saveRecord());
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

  document.getElementById('foodPhoto').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileDate = file.lastModified ? new Date(file.lastModified) : null;
    if (fileDate && !Number.isNaN(fileDate.getTime())) {
      document.getElementById('mealDate').value = formatDate(fileDate);
      document.getElementById('mealTime').value = formatTime(fileDate);
      hideError('dateError');
      hideError('timeError');
    }

    const reader = new FileReader();
    reader.onload = () => {
      state.photoDataUrl = reader.result;
      const preview = document.getElementById('photoPreview');
      preview.src = state.photoDataUrl;
      preview.classList.remove('hidden');
      document.getElementById('uploadPlaceholder').classList.add('hidden');
      hideError('photoError');
      updateProgress();
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('foodText').addEventListener('input', () => {
    hideError('textError');
    updateProgress();
  });
  document.getElementById('mealDate').addEventListener('change', () => {
    hideError('dateError');
    updateProgress();
  });
  document.getElementById('mealTime').addEventListener('change', () => {
    hideError('timeError');
    updateProgress();
  });
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
    container.innerHTML = emojiSets[kind].map((emoji, index) => `
      <button type="button" aria-label="${kind} ${index + 1}" data-value="${index + 1}">${emoji}</button>
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
  .from("app_users")
  .select("id")
  .eq("id", currentUser.id)
  .maybeSingle();

if (userCheckError) {
  alert(userCheckError.message);
  return;
}

if (!existingUser) {
  alert("找不到使用者資料，請重新登入");
  localStorage.removeItem("foodMoodUser");
  window.location.href = "login.html";
  return;
}

  const foodText = document.getElementById("foodText").value.trim();
  const date = document.getElementById("mealDate").value;
  const time = document.getElementById("mealTime").value;
  const notes = document.getElementById("notes").value.trim();

  let imagePath = null;
  let imageUrl = null;
  let mimeType = null;

  if (state.inputType === "photo") {
      const file = document.getElementById("foodPhoto").files[0];

      mimeType = file.type || "image/jpeg";

      const fileExt = file.name.split(".").pop();

      imagePath = `${currentUser.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from("food-images")
        .upload(imagePath, file, {
          contentType: mimeType
        });

      if (uploadError) {
        alert(uploadError.message);
        return;
      }

      const { data: publicUrlData } = db.storage
        .from("food-images")
        .getPublicUrl(imagePath);

      imageUrl = publicUrlData.publicUrl;
  }

  const { data: foodLog, error: foodLogError } = await db
    .from("food_logs")
    .insert({
      user_id: currentUser.id,
      meal_type: state.mealType,
      input_type: state.inputType,

      image_path: imagePath,
      image_url: state.inputType === "photo" ? imageUrl : null,
      mime_type: state.inputType === "photo" ? mimeType : null,
      ai_status: "pending",

      food_description:
        state.inputType === "text"
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

  const { error: moodError } = await db.from("mood_entries").insert([
    {
      food_log_id: foodLog.id,
      user_id: currentUser.id,
      timing: "before_meal",
      hunger_level: state.selected.hungerBefore,
      body_status: state.selected.bodyBefore,
      mood_level: state.selected.moodBefore,
      stress_level: state.selected.stressBefore
    },
    {
      food_log_id: foodLog.id,
      user_id: currentUser.id,
      timing: "after_meal",
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

  const { error: contextError } = await db.from("meal_contexts").insert({
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

  alert("儲存成功");
  location.href = "index.html";
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 1300);
}

init();
