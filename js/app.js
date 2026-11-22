/**
 * EtherTest Main Application Controller
 * - Сохранение темы в localStorage
 * - Поддержка темы "кастом" с выезжающей кнопкой шестерёнки [ ⚙ ]
 * - Экспорт / импорт темы в чистую строку вида `ETHERTHEME#...#END` (без спецсимволов)
 * - Полноценное Dev-меню для подмены значений на лету (UA, GPU, IP, скорость, фаза)
 * - Связка UI, тем, одометра/барабана цифр, спидометра и сетевого движка
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Инициализация иконок интерфейса
  injectPixelIcon('logo-icon', PixelIcons.speedometer);
  injectPixelIcon('icon-network', PixelIcons.network);
  injectPixelIcon('icon-info', PixelIcons.info);
  injectPixelIcon('icon-github', PixelIcons.github);
  injectPixelIcon('icon-theme', PixelIcons.theme);
  injectPixelIcon('icon-gear', PixelIcons.gear);
  injectPixelIcon('icon-terminal', PixelIcons.terminal);
  injectPixelIcon('icon-start', PixelIcons.start);

  // 2. Инициализация компонентов
  const engine = new EtherTestEngine();
  const gauge = new PixelGauge('gauge-canvas');
  const sysInfo = new SystemInfoCollector();

  // Запуск сбора IP и системной информации
  sysInfo.fetchIPs().then(() => {
    sysInfo.renderToDOM('info-grid');
  });
  sysInfo.renderToDOM('info-grid');

  // Таймер обновления времени на вкладке Инфо
  setInterval(() => {
    const timeEl = document.getElementById('info-val-time');
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }, 1000);

  // 3. УПРАВЛЕНИЕ ТЕМАМИ (pure-oled, dark, night, day, hacker, cyber, custom)
  const themes = ['pure-oled', 'dark', 'night', 'day', 'hacker', 'cyber', 'custom'];
  const themeLabels = {
    'pure-oled': 'pure oled',
    'dark': 'dark',
    'night': 'night',
    'day': 'day',
    'hacker': 'хацкер',
    'cyber': 'киберпанк',
    'custom': 'кастом'
  };

  const themeBtn = document.getElementById('theme-btn');
  const currentThemeName = document.getElementById('current-theme-name');
  const gearBtn = document.getElementById('custom-theme-gear-btn');

  // Дефолтный бирюзовый кибер-пресет (встаёт прямо перед кастомом и по дефолту в кастом)
  const defaultCyberPreset = {
    bg: '#050505',
    active: '#00ffcc',
    inactive: '#447766',
    bracket: '#00ffcc',
    gaugeBg: '#112220',
    dlPulse: '#66ffea',
    ulPulse: '#ff88ee',
    needle: '#00ffcc'
  };

  // Значения кастомной темы по умолчанию (в точности совпадают с киберпанк, поэтому при переходе ничего не моргает)
  let customThemeConfig = Object.assign({}, defaultCyberPreset);

  // Загрузка кастомной темы из хранилища
  try {
    const savedCustom = localStorage.getItem('ethertest_custom_theme');
    if (savedCustom) {
      customThemeConfig = Object.assign(customThemeConfig, JSON.parse(savedCustom));
    }
  } catch {}

  function applyCustomThemeToCSS(cfg) {
    const root = document.documentElement;
    root.style.setProperty('--bg-color', cfg.bg);
    root.style.setProperty('--bg-surface', cfg.bg);
    root.style.setProperty('--text-active', cfg.active);
    root.style.setProperty('--text-inactive', cfg.inactive);
    root.style.setProperty('--text-hover', cfg.active);
    root.style.setProperty('--bracket-color', cfg.bracket);
    root.style.setProperty('--bracket-inactive', cfg.inactive);
    root.style.setProperty('--border-color', cfg.inactive);
    root.style.setProperty('--gauge-bg-pixel', cfg.gaugeBg);
    root.style.setProperty('--needle-color', cfg.needle);

    gauge.setTheme('custom', cfg);
  }

  function clearCustomThemeFromCSS() {
    const root = document.documentElement;
    root.style.removeProperty('--bg-color');
    root.style.removeProperty('--bg-surface');
    root.style.removeProperty('--text-active');
    root.style.removeProperty('--text-inactive');
    root.style.removeProperty('--text-hover');
    root.style.removeProperty('--bracket-color');
    root.style.removeProperty('--bracket-inactive');
    root.style.removeProperty('--border-color');
    root.style.removeProperty('--gauge-bg-pixel');
    root.style.removeProperty('--needle-color');
  }

  // Применение темы
  function applyTheme(themeName, save = true) {
    document.documentElement.setAttribute('data-theme', themeName);
    currentThemeName.textContent = themeLabels[themeName] || themeName;

    if (themeName === 'custom') {
      if (gearBtn.classList.contains('hidden')) {
        // Устанавливаем положение сверху и прозрачность перед запуском перехода
        gearBtn.classList.add('entering');
        gearBtn.classList.remove('hidden');
        // Форсируем reflow для срабатывания перехода
        void gearBtn.offsetWidth;
        // Плавно спускаем вниз и делаем непрозрачным
        gearBtn.classList.remove('entering');
      }
      applyCustomThemeToCSS(customThemeConfig);
    } else {
      gearBtn.classList.remove('entering');
      gearBtn.classList.add('hidden');
      clearCustomThemeFromCSS();
      gauge.setTheme(themeName, null);
    }

    if (save) {
      try {
        localStorage.setItem('ethertest_theme', themeName);
      } catch {}
    }
  }

  // Инициализация сохраненной темы
  let currentThemeIdx = 0;
  try {
    const savedTheme = localStorage.getItem('ethertest_theme');
    if (savedTheme && themes.includes(savedTheme)) {
      currentThemeIdx = themes.indexOf(savedTheme);
    }
  } catch {}
  applyTheme(themes[currentThemeIdx], false);

  // Клик по кнопке смены темы
  themeBtn.addEventListener('click', () => {
    currentThemeIdx = (currentThemeIdx + 1) % themes.length;
    applyTheme(themes[currentThemeIdx], true);
  });

  // 4. МОДАЛЬНОЕ ОКНО: НАСТРОЙКИ КАСТОМНОЙ ТЕМЫ И СЛОТЫ
  const customModal = document.getElementById('custom-theme-modal');
  const customModalClose = document.getElementById('custom-modal-close');
  const exportThemeBtn = document.getElementById('export-theme-btn');
  const importThemeBtn = document.getElementById('import-theme-btn');
  const themeIoStatus = document.getElementById('theme-io-status');

  const slotsListEl = document.getElementById('theme-slots-list');
  const slotsPrevBtn = document.getElementById('slots-prev-btn');
  const slotsNextBtn = document.getElementById('slots-next-btn');
  const slotsPageInfo = document.getElementById('slots-page-info');

  const pickers = {
    bg: document.getElementById('picker-bg'),
    active: document.getElementById('picker-active'),
    inactive: document.getElementById('picker-inactive'),
    bracket: document.getElementById('picker-bracket'),
    gaugeBg: document.getElementById('picker-gauge-bg'),
    dlPulse: document.getElementById('picker-dl-pulse'),
    ulPulse: document.getElementById('picker-ul-pulse'),
    needle: document.getElementById('picker-needle')
  };

  // --- ЛОКАЛЬНЫЕ СЛОТЫ ТЕМ ---
  let themeSlots = [];
  try {
    const savedSlots = localStorage.getItem('ethertest_theme_slots');
    if (savedSlots) {
      themeSlots = JSON.parse(savedSlots);
    }
  } catch {}

  let slotsCurrentPage = 1;
  const SLOTS_PER_PAGE = 5;

  function saveThemeSlots() {
    try {
      localStorage.setItem('ethertest_theme_slots', JSON.stringify(themeSlots));
    } catch {}
  }

  function encodeThemeToString(cfg) {
    const rawData = [
      (cfg.bg || '#050505').replace('#', ''),
      (cfg.active || '#ffffff').replace('#', ''),
      (cfg.inactive || '#777777').replace('#', ''),
      (cfg.bracket || '#ffffff').replace('#', ''),
      (cfg.gaugeBg || '#2a2a2a').replace('#', ''),
      (cfg.dlPulse || '#cceeff').replace('#', ''),
      (cfg.ulPulse || '#f6c6f6').replace('#', ''),
      (cfg.needle || '#ffffff').replace('#', '')
    ].join('-');
    return `[ETHERTHEME:${rawData}:ENDTHEME]`;
  }

  function renderSlots() {
    if (!slotsListEl) return;
    
    // Вычисляем страницы
    // Если слотов 0: 1 страница (1 слот "+ создать новую", 4 "пустой слот")
    // Если все слоты заполнены на текущих страницах, следующая страница становится доступной
    const totalSlots = themeSlots.length;
    // Количество страниц: минимум 1, либо пока есть слоты + если ровно кратно 5, то еще страница для следующей свободной
    const totalPages = Math.max(1, Math.ceil((totalSlots + 1) / SLOTS_PER_PAGE));
    if (slotsCurrentPage > totalPages) slotsCurrentPage = totalPages;
    if (slotsCurrentPage < 1) slotsCurrentPage = 1;

    slotsPageInfo.textContent = `${slotsCurrentPage}/${totalPages}`;
    slotsPrevBtn.disabled = (slotsCurrentPage <= 1);
    slotsNextBtn.disabled = (slotsCurrentPage >= totalPages);

    slotsListEl.innerHTML = '';
    const startIdx = (slotsCurrentPage - 1) * SLOTS_PER_PAGE;

    for (let i = 0; i < SLOTS_PER_PAGE; i++) {
      const slotIndex = startIdx + i;
      const slotItem = document.createElement('div');
      slotItem.className = 'theme-slot-item';

      if (slotIndex < totalSlots) {
        // Заполненный слот
        const slotData = themeSlots[slotIndex];
        slotItem.innerHTML = `
          <div class="slot-left">
            <span class="slot-color-preview" style="background-color: ${slotData.config.bg}; border-color: ${slotData.config.active}"></span>
            <span class="slot-name">${slotData.name || `слот #${slotIndex + 1}`}</span>
          </div>
          <div class="slot-actions">
            <button class="slot-action-btn btn-apply" title="Применить тему">
              <span class="pixel-icon">${PixelIcons.check}</span>
            </button>
            <button class="slot-action-btn btn-copy" title="Скопировать в буфер обмена">
              <span class="pixel-icon">${PixelIcons.copy}</span>
            </button>
            <button class="slot-action-btn btn-delete" title="Удалить тему">
              <span class="pixel-icon">${PixelIcons.trash}</span>
            </button>
          </div>
        `;

        // Кнопка Применить
        slotItem.querySelector('.btn-apply').addEventListener('click', (e) => {
          e.stopPropagation();
          customThemeConfig = Object.assign({}, slotData.config);
          updatePickersFromConfig();
          applyCustomThemeToCSS(customThemeConfig);
          try {
            localStorage.setItem('ethertest_custom_theme', JSON.stringify(customThemeConfig));
          } catch {}
          applyTheme('custom', true);
          currentThemeIdx = themes.indexOf('custom');
          themeIoStatus.textContent = `тема "${slotData.name || `#${slotIndex + 1}`}" применена!`;
          setTimeout(() => { themeIoStatus.textContent = ''; }, 2500);
        });

        // Кнопка Скопировать код темы в буфер
        slotItem.querySelector('.btn-copy').addEventListener('click', (e) => {
          e.stopPropagation();
          const str = encodeThemeToString(slotData.config);
          navigator.clipboard.writeText(str).then(() => {
            themeIoStatus.textContent = `код слота #${slotIndex + 1} скопирован в буфер!`;
            setTimeout(() => { themeIoStatus.textContent = ''; }, 2500);
          }).catch(() => {
            themeIoStatus.textContent = str;
          });
        });

        // Кнопка Удалить слот
        slotItem.querySelector('.btn-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          themeSlots.splice(slotIndex, 1);
          saveThemeSlots();
          renderSlots();
          themeIoStatus.textContent = `слот #${slotIndex + 1} удален`;
          setTimeout(() => { themeIoStatus.textContent = ''; }, 2000);
        });

      } else if (slotIndex === totalSlots) {
        // Следующий свободный слот: "+ создать новую"
        slotItem.classList.add('is-create');
        slotItem.innerHTML = `
          <div class="slot-left">
            <span class="slot-name">+ создать новую</span>
          </div>
        `;
        slotItem.addEventListener('click', () => {
          const newSlotName = `тема #${totalSlots + 1}`;
          themeSlots.push({
            name: newSlotName,
            config: Object.assign({}, customThemeConfig)
          });
          saveThemeSlots();
          renderSlots();
          themeIoStatus.textContent = `создан ${newSlotName} с текущими цветами!`;
          setTimeout(() => { themeIoStatus.textContent = ''; }, 2500);
        });

      } else {
        // Остальные свободные слоты: "пустой слот"
        slotItem.classList.add('is-empty');
        slotItem.innerHTML = `
          <div class="slot-left">
            <span class="slot-name">пустой слот</span>
          </div>
        `;
      }

      slotsListEl.appendChild(slotItem);
    }
  }

  slotsPrevBtn.addEventListener('click', () => {
    if (slotsCurrentPage > 1) {
      slotsCurrentPage--;
      renderSlots();
    }
  });

  slotsNextBtn.addEventListener('click', () => {
    const totalSlots = themeSlots.length;
    const totalPages = Math.max(1, Math.ceil((totalSlots + 1) / SLOTS_PER_PAGE));
    if (slotsCurrentPage < totalPages) {
      slotsCurrentPage++;
      renderSlots();
    }
  });

  function updatePickersFromConfig() {
    for (const key in pickers) {
      if (customThemeConfig[key]) {
        pickers[key].value = customThemeConfig[key];
      }
    }
  }

  gearBtn.addEventListener('click', () => {
    updatePickersFromConfig();
    renderSlots();
    customModal.classList.remove('hidden');
    themeIoStatus.textContent = '';
  });

  customModalClose.addEventListener('click', () => {
    customModal.classList.add('hidden');
  });

  // Отслеживание изменений в колорпикерах
  for (const key in pickers) {
    pickers[key].addEventListener('input', (e) => {
      customThemeConfig[key] = e.target.value;
      applyCustomThemeToCSS(customThemeConfig);
      try {
        localStorage.setItem('ethertest_custom_theme', JSON.stringify(customThemeConfig));
      } catch {}
    });
  }

  // ЭКСПОРТ ТЕКУЩЕЙ ТЕМЫ В ЧИСТУЮ СТРОКУ С ЯСНЫМИ ГРАНИЦАМИ
  exportThemeBtn.addEventListener('click', () => {
    const themeString = encodeThemeToString(customThemeConfig);
    navigator.clipboard.writeText(themeString).then(() => {
      themeIoStatus.textContent = 'скопировано в буфер обмена!';
      setTimeout(() => { themeIoStatus.textContent = ''; }, 3000);
    }).catch(() => {
      themeIoStatus.textContent = themeString;
    });
  });

  // ИМПОРТ В ТЕКУЩУЮ ТЕМУ ИЗ БУФЕРА
  importThemeBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.trim().match(/\[ETHERTHEME:([a-fA-F0-9-]+):ENDTHEME\]/);
      if (!match) {
        themeIoStatus.textContent = 'ошибка: некорректная строка темы';
        return;
      }

      const parts = match[1].split('-');
      if (parts.length < 8) {
        themeIoStatus.textContent = 'ошибка: неполные параметры темы';
        return;
      }

      customThemeConfig = {
        bg: '#' + parts[0],
        active: '#' + parts[1],
        inactive: '#' + parts[2],
        bracket: '#' + parts[3],
        gaugeBg: '#' + parts[4],
        dlPulse: '#' + parts[5],
        ulPulse: '#' + parts[6],
        needle: '#' + parts[7]
      };

      updatePickersFromConfig();
      applyCustomThemeToCSS(customThemeConfig);
      localStorage.setItem('ethertest_custom_theme', JSON.stringify(customThemeConfig));
      applyTheme('custom', true);
      currentThemeIdx = themes.indexOf('custom');

      themeIoStatus.textContent = 'тема успешно импортирована!';
      setTimeout(() => { themeIoStatus.textContent = ''; }, 3000);
    } catch (err) {
      themeIoStatus.textContent = 'разрешите доступ к буферу обмена для вставки';
    }
  });

  // 5. ДЕВ-МЕНЮ (ПОДМЕНА ЗНАЧЕНИЙ НА ЛЕТУ)
  const devBtn = document.getElementById('dev-menu-btn');
  const devModal = document.getElementById('dev-menu-modal');
  const devModalClose = document.getElementById('dev-modal-close');
  const devApplyBtn = document.getElementById('dev-apply-btn');
  const devResetBtn = document.getElementById('dev-reset-btn');
  const devFeedback = document.getElementById('dev-feedback');

  const devInputUa = document.getElementById('dev-input-ua');
  const devSelectGpuVendor = document.getElementById('dev-select-gpu-vendor');
  const devInputGpuRenderer = document.getElementById('dev-input-gpu-renderer');
  const devInputIpv4 = document.getElementById('dev-input-ipv4');
  const devInputIpv6 = document.getElementById('dev-input-ipv6');
  const devInputSpeed = document.getElementById('dev-input-speed');
  const devSelectPhase = document.getElementById('dev-select-phase');

  // Быстрые теги UA
  document.querySelectorAll('.dev-quick-tags .tag-btn').forEach(tag => {
    tag.addEventListener('click', () => {
      devInputUa.value = tag.getAttribute('data-ua');
    });
  });

  // СЕКРЕТНЫЙ ХОТКЕЙ: Ctrl + Shift + Alt + l + o + x
  // Отслеживаем зажатые клавиши
  const pressedKeys = new Set();

  window.addEventListener('keydown', (e) => {
    pressedKeys.add(e.key.toLowerCase());

    const hasModifiers = e.ctrlKey && e.shiftKey && e.altKey;
    const hasLetters = pressedKeys.has('l') && pressedKeys.has('o') && pressedKeys.has('x');

    if (hasModifiers && hasLetters) {
      e.preventDefault();
      devModal.classList.toggle('hidden');
      devFeedback.textContent = '';
    }
  });

  window.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.key.toLowerCase());
  });

  if (devBtn) {
    devBtn.addEventListener('click', () => {
      devModal.classList.remove('hidden');
      devFeedback.textContent = '';
    });
  }

  devModalClose.addEventListener('click', () => {
    devModal.classList.add('hidden');
  });

  // Применить подмену
  devApplyBtn.addEventListener('click', () => {
    if (devInputUa.value.trim()) {
      sysInfo.setDevOverride('ua', devInputUa.value.trim());
    }
    if (devSelectGpuVendor.value) {
      sysInfo.setDevOverride('gpuVendor', devSelectGpuVendor.value);
    }
    if (devInputGpuRenderer.value.trim()) {
      sysInfo.setDevOverride('gpuRenderer', devInputGpuRenderer.value.trim());
    }
    if (devInputIpv4.value.trim()) {
      sysInfo.setDevOverride('ipv4', devInputIpv4.value.trim());
    }
    if (devInputIpv6.value.trim()) {
      sysInfo.setDevOverride('ipv6', devInputIpv6.value.trim());
    }

    // Обновляем вкладку инфо
    sysInfo.renderToDOM('info-grid');

    // Если задана тестовая скорость на спидометре
    if (devInputSpeed.value !== '') {
      const spd = parseFloat(devInputSpeed.value);
      const phase = devSelectPhase.value;
      gauge.setPhase(phase);
      gauge.setSpeed(spd);
      if (phase === 'idle') {
        updateOdometer('- - -');
      } else {
        const curTheme = themes[currentThemeIdx];
        const color = (curTheme === 'custom' && customThemeConfig) 
          ? (phase === 'upload' ? customThemeConfig.ulPulse : customThemeConfig.dlPulse)
          : (phase === 'upload' ? '#f6c6f6' : '#cceeff');
        updateOdometer(spd.toFixed(1), color);
      }
    }

    devFeedback.textContent = 'значения успешно подменены!';
    setTimeout(() => { devFeedback.textContent = ''; }, 2500);
  });

  // Сброс подмены на реальные
  devResetBtn.addEventListener('click', () => {
    sysInfo.clearDevOverrides();
    devInputUa.value = '';
    devSelectGpuVendor.value = '';
    devInputGpuRenderer.value = '';
    devInputIpv4.value = '';
    devInputIpv6.value = '';
    devInputSpeed.value = '';
    sysInfo.renderToDOM('info-grid');
    resetUI();
    devFeedback.textContent = 'значения сброшены на системные';
    setTimeout(() => { devFeedback.textContent = ''; }, 2500);
  });

  // Закрытие модалок по клику вне контента
  window.addEventListener('click', (e) => {
    if (e.target === customModal) customModal.classList.add('hidden');
    if (e.target === devModal) devModal.classList.add('hidden');
  });

  // 6. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
  const navButtons = document.querySelectorAll('.header-right .nav-btn[data-tab]');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `tab-${targetTab}`) {
          pane.classList.add('active');
        }
      });

      if (targetTab === 'info') {
        sysInfo.renderToDOM('info-grid');
      }
    });
  });

  // 7. ОДОМЕТР: ЧЕТКОЕ ИЗМЕНЕНИЕ И ВЕРТИКАЛЬНАЯ ПРОКРУТКА ПРИ СМЕНЕ РАЗРЯДОВ
  const digitsWrapper = document.getElementById('digits-wrapper');
  const gaugeContainer = document.querySelector('.gauge-container');
  let currentLen = 0;

  function updateOdometer(valueStr, colorClass = null) {
    if (valueStr === '- - -') {
      gaugeContainer.classList.remove('testing');
      digitsWrapper.innerHTML = '<span class="dash-placeholder">- - -</span>';
      currentLen = 0;
      return;
    }

    gaugeContainer.classList.add('testing');

    const chars = valueStr.split('');
    const newLen = chars.length;

    if (newLen !== currentLen) {
      const animClass = (newLen > currentLen) ? 'roll-in' : 'roll-out';
      let html = '';
      for (let i = 0; i < chars.length; i++) {
        html += `<span class="digit-char ${animClass}">${chars[i]}</span>`;
      }
      digitsWrapper.innerHTML = html;
      currentLen = newLen;
    } else {
      const spanElements = digitsWrapper.querySelectorAll('.digit-char');
      if (spanElements.length === chars.length) {
        for (let i = 0; i < chars.length; i++) {
          if (spanElements[i].textContent !== chars[i]) {
            spanElements[i].textContent = chars[i];
          }
        }
      } else {
        digitsWrapper.innerHTML = chars.map(c => `<span class="digit-char">${c}</span>`).join('');
      }
    }

    if (colorClass) {
      digitsWrapper.style.color = colorClass;
    } else {
      digitsWrapper.style.color = 'var(--text-active)';
    }
  }

  // 8. UI ЭЛЕМЕНТЫ МЕТРИК
  const startBtn = document.getElementById('start-btn');
  const statusBar = document.getElementById('status-bar');

  const dlValText = document.querySelector('#metric-download .val-text');
  const ulValText = document.querySelector('#metric-upload .val-text');
  const pingValText = document.querySelector('#metric-ping .val-text');

  function setMetricValue(el, val, isDash = false, color = null) {
    el.textContent = val;
    if (isDash) {
      el.classList.add('dash');
      el.style.color = 'var(--text-inactive)';
    } else {
      el.classList.remove('dash');
      el.style.color = color || 'var(--text-active)';
    }
  }

  function resetUI() {
    updateOdometer('- - -');
    setMetricValue(dlValText, '- - -', true);
    setMetricValue(ulValText, '- - -', true);
    setMetricValue(pingValText, '- - -', true);
    gauge.reset();
    statusBar.textContent = 'готов к запуску';
  }

  resetUI();

  // 9. СВЯЗЫВАНИЕ СОБЫТИЙ ДВИЖКА (ENGINE) И UI
  engine.on('start', () => {
    startBtn.classList.add('running');
    statusBar.textContent = 'запуск тестирования сети...';
  });

  engine.on('statusMessage', (msg) => {
    statusBar.textContent = msg;
  });

  engine.on('phaseChange', ({ phase }) => {
    gauge.setPhase(phase);

    if (phase === 'ping') {
      statusBar.textContent = 'замер задержки и джиттера (latency & jitter)...';
    } else if (phase === 'download') {
      statusBar.textContent = 'тестирование входящего канала (download)...';
    } else if (phase === 'upload') {
      statusBar.textContent = 'тестирование исходящего канала (upload)...';
    } else if (phase === 'completed') {
      startBtn.classList.remove('running');
      gaugeContainer.classList.remove('testing');
      statusBar.textContent = 'тестирование успешно завершено';
      
      sysInfo.setLastSpeeds(engine.state.download.peakMbps, engine.state.upload.peakMbps);
    } else if (phase === 'idle' || phase === 'error') {
      startBtn.classList.remove('running');
      gaugeContainer.classList.remove('testing');
      if (phase === 'error') statusBar.textContent = 'ошибка во время замера';
    }
  });

  engine.on('pingUpdate', (pingData) => {
    setMetricValue(pingValText, pingData.current);
    statusBar.textContent = `пинг: ${pingData.avg} мс | джиттер: ${pingData.jitter} мс`;
  });

  engine.on('downloadProgress', (dlData) => {
    const mbpsStr = dlData.currentMbps.toFixed(1);
    gauge.setSpeed(dlData.currentMbps);
    
    const curTheme = themes[currentThemeIdx];
    let dlColor = (curTheme === 'hacker') ? '#33ffaa' : ((curTheme === 'cyber') ? '#66ffea' : ((curTheme === 'day') ? '#0066cc' : '#cceeff'));
    if (curTheme === 'custom' && customThemeConfig) {
      dlColor = customThemeConfig.dlPulse;
    }

    updateOdometer(mbpsStr, dlColor);
    setMetricValue(dlValText, mbpsStr, false, dlColor);
  });

  engine.on('uploadProgress', (ulData) => {
    const mbpsStr = ulData.currentMbps.toFixed(1);
    gauge.setSpeed(ulData.currentMbps);

    const curTheme = themes[currentThemeIdx];
    let ulColor = (curTheme === 'hacker') ? '#88ffcc' : ((curTheme === 'cyber') ? '#ff88ee' : ((curTheme === 'day') ? '#aa00aa' : '#f6c6f6'));
    if (curTheme === 'custom' && customThemeConfig) {
      ulColor = customThemeConfig.ulPulse;
    }

    updateOdometer(mbpsStr, ulColor);
    setMetricValue(ulValText, mbpsStr, false, ulColor);
  });

  engine.on('complete', (summary) => {
    setMetricValue(dlValText, summary.download.peakMbps.toFixed(1));
    setMetricValue(ulValText, summary.upload.peakMbps.toFixed(1));
    setMetricValue(pingValText, summary.ping.avg);
    gauge.setSpeed(0);
    updateOdometer(summary.download.peakMbps.toFixed(1));
  });

  startBtn.addEventListener('click', () => {
    if (engine.status === 'idle' || engine.status === 'completed' || engine.status === 'error') {
      engine.runFullTest();
    }
  });
});
