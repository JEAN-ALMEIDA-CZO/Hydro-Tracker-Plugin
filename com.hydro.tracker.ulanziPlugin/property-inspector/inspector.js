// $UD is already created by ../libs/js/ulanzideckApi.js as a global UlanziStreamDeck instance.
// We just use it directly — no need to instantiate.

let ACTION_SETTING = {};
let form = null;

let KEY_LABELS = {
  notifyTitle: 'Hydro Tracker',
  msgDrinkWater: 'Time to drink water! Stay hydrated.',
  msgGoalReached: 'Daily hydration goal reached! Great job!',
  calcInfo: 'Goal: {0}ml ({1} glasses). Interval: {2}m.',
  labelIdle: 'HYDRATE',
  labelRunning: 'DRINK',
  labelAlert: 'DRINK!',
  labelDone: 'DONE'
};

const THEMES = {
  ocean:   { water: '#00B4D8', bg: '#08131c' },
  deepsea: { water: '#3D7BFF', bg: '#0a1030' },
  neon:    { water: '#00BFFF', bg: '#0a0a1a' },
  mint:    { water: '#19D3C5', bg: '#072420' },
  classic: { water: '#5FA8E0', bg: '#15202b' }
};

$UD.connect('com.hydro.tracker.deck.action');

$UD.onConnected(() => {
  form = document.querySelector('#property-inspector');
  document.querySelector('.udpi-wrapper').classList.remove('hidden');

  buildThemeSwatches();
  buildHourSelects();
  bindReset();

  const debouncedCollectAndSend = Utils.debounce(collectAndSend, 150);
  form.addEventListener('input', debouncedCollectAndSend);
  form.addEventListener('change', debouncedCollectAndSend);

  loadTranslations();
});

function buildThemeSwatches() {
  const wrap = document.getElementById('theme-swatches');
  wrap.innerHTML = '';
  Object.keys(THEMES).forEach(name => {
    const el = document.createElement('div');
    el.className = 'theme-swatch';
    el.dataset.theme = name;
    el.title = name;
    const left = document.createElement('i');
    left.style.background = THEMES[name].water;
    const right = document.createElement('i');
    right.style.background = THEMES[name].bg;
    el.appendChild(left);
    el.appendChild(right);
    el.addEventListener('click', () => selectTheme(name));
    wrap.appendChild(el);
  });
  highlightTheme(document.getElementById('theme').value || 'ocean');
}

function selectTheme(name) {
  document.getElementById('theme').value = name;
  highlightTheme(name);
  collectAndSend();
}

function highlightTheme(name) {
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === name);
  });
}

function buildHourSelects() {
  const fmt = h => String(h).padStart(2, '0') + ':00';
  ['quietStart', 'quietEnd'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option');
      o.value = h; o.textContent = fmt(h);
      sel.appendChild(o);
    }
  });
  document.getElementById('quietStart').value = 22;
  document.getElementById('quietEnd').value = 7;
}

function syncQuietRow() {
  const on = document.getElementById('quietEnabled').checked;
  document.getElementById('quiet-window-row').style.display = on ? '' : 'none';
}

function bindReset() {
  document.getElementById('btn-reset').addEventListener('click', () => {
    $UD.sendParamFromPlugin({ resetProgress: true });
  });
  document.getElementById('btn-tutorial').addEventListener('click', () => {
    const lang = $UD.language || 'en';
    $UD.openUrl('./property-inspector/tutorial.html#lang=' + lang, true);
  });
}

function updateCalculationDisplay() {
  if (!form) return;
  const ageGroup = document.getElementById('ageGroup').value || 'adult';
  const weight = parseFloat(document.getElementById('weight').value) || 70;
  const weightUnit = document.getElementById('weightUnit').value || 'kg';
  const containerSize = parseFloat(document.getElementById('containerSize').value) || 250;
  const containerUnit = document.getElementById('containerUnit').value || 'ml';

  const weightKg = weightUnit === 'lbs' ? weight / 2.20462 : weight;
  const mlPerKg = ageGroup === 'child' ? 50 : 35;
  let totalMl = weightKg * mlPerKg;
  if (document.getElementById('hotWeather') && document.getElementById('hotWeather').checked) totalMl *= 1.15;
  const containerMl = containerUnit === 'oz' ? containerSize * 29.5735
                    : containerUnit === 'l'  ? containerSize * 1000
                    : containerSize;

  const totalGlasses = Math.max(1, Math.ceil(totalMl / containerMl));
  const activeMinutes = 16 * 60;
  const intervalMinutes = Math.floor(activeMinutes / totalGlasses);

  const template = KEY_LABELS.calcInfo;
  const text = template
    .replace('{0}', Math.round(totalMl))
    .replace('{1}', totalGlasses)
    .replace('{2}', intervalMinutes);

  document.getElementById('calc-display').textContent = text;
}

async function loadTranslations() {
  try {
    let data;
    try {
      data = await Utils.readJson(`${Utils.getPluginPath()}/${$UD.language}.json?t=${Date.now()}`);
    } catch (err) {
      console.warn(`[Hydro] Failed to load language ${$UD.language}, falling back...`);
      if ($UD.language.startsWith('pt')) {
        data = await Utils.readJson(`${Utils.getPluginPath()}/pt_BR.json?t=${Date.now()}`);
      } else {
        data = await Utils.readJson(`${Utils.getPluginPath()}/en.json?t=${Date.now()}`);
      }
    }
    const loc  = data?.Localization || {};

    KEY_LABELS = {
      notifyTitle:    data?.Name           || KEY_LABELS.notifyTitle,
      msgDrinkWater:  loc['msgDrinkWater'] || KEY_LABELS.msgDrinkWater,
      msgGoalReached: loc['msgGoalReached']|| KEY_LABELS.msgGoalReached,
      calcInfo:       loc['calcInfo']      || KEY_LABELS.calcInfo,
      labelIdle:      loc['labelIdle']     || KEY_LABELS.labelIdle,
      labelRunning:   loc['labelRunning']  || KEY_LABELS.labelRunning,
      labelAlert:     loc['labelAlert']    || KEY_LABELS.labelAlert,
      labelDone:      loc['labelDone']     || KEY_LABELS.labelDone
    };

    updateCalculationDisplay();
    collectAndSend();
  } catch (e) {
    console.warn('[Hydro] No translations for', $UD.language, e);
  }
}

function collectAndSend() {
  if (!form) return;
  const values = Utils.getFormValue(form);
  ACTION_SETTING = { ...ACTION_SETTING, ...values };
  ACTION_SETTING.notify = !!document.getElementById('notify').checked;
  ACTION_SETTING.hotWeather = !!document.getElementById('hotWeather').checked;
  ACTION_SETTING.quietEnabled = !!document.getElementById('quietEnabled').checked;
  syncQuietRow();

  updateCalculationDisplay();

  $UD.sendParamFromPlugin({ ...ACTION_SETTING, ...KEY_LABELS });
}

function applySettings(params) {
  if (!params) return;
  ACTION_SETTING = { ...ACTION_SETTING, ...params };
  if (!form) return;

  Utils.setFormValue(ACTION_SETTING, form);
  document.getElementById('notify').checked =
    ACTION_SETTING.notify === true || ACTION_SETTING.notify === 'true' || ACTION_SETTING.notify === 'on';

  const theme = ACTION_SETTING.theme || 'ocean';
  document.getElementById('theme').value = theme;
  highlightTheme(theme);

  document.getElementById('font').value = ACTION_SETTING.font || 'sans';
  document.getElementById('dropAnim').value = ACTION_SETTING.dropAnim || 'ripples';
  document.getElementById('ringAnim').value = ACTION_SETTING.ringAnim || 'clean';

  const boolOn = v => v === true || v === 'true' || v === 'on';
  document.getElementById('hotWeather').checked = boolOn(ACTION_SETTING.hotWeather);
  document.getElementById('quietEnabled').checked = boolOn(ACTION_SETTING.quietEnabled);
  if (ACTION_SETTING.quietStart !== undefined) document.getElementById('quietStart').value = ACTION_SETTING.quietStart;
  if (ACTION_SETTING.quietEnd !== undefined) document.getElementById('quietEnd').value = ACTION_SETTING.quietEnd;
  syncQuietRow();

  updateCalculationDisplay();
}

$UD.onAdd((jsn)             => { if (jsn.param) applySettings(jsn.param); updateCalculationDisplay(); });
$UD.onParamFromApp((jsn)   => { if (jsn.param) applySettings(jsn.param); });
$UD.onParamFromPlugin((jsn) => {
  if (jsn.param && !jsn.param.resetProgress) applySettings(jsn.param);
});
