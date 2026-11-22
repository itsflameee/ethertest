/**
 * EtherTest System Information Collector
 * Сбор и аккуратный парсинг технических данных:
 * - Дата, текущее время, часовой пояс
 * - IPv4 и IPv6 (отдельными полями)
 * - Входящая и исходящая скорость (последние результаты)
 * - Браузер в понятном виде + динамическая пиксельная иконка (Chrome, Firefox, Edge, Brave, Tor, Safari, Opera или ?)
 * - Полный userAgent с терминальной иконкой >_
 * - Операционная система
 * - GPU Vendor с пиксельной иконкой конкретного вендора (NVIDIA, AMD, Intel, Apple, Unknown)
 * - GPU Renderer (чип)
 * - Поддержка Dev-режима для подмены значений на лету!
 */

class SystemInfoCollector {
  constructor() {
    this.lang = 'en';
    this.cachedData = {
      ipv4: 'detecting...',
      ipv6: 'detecting...',
      lastDownload: '- - -',
      lastUpload: '- - -'
    };

    // Оверрайды из Дев-меню
    this.devOverrides = {
      active: false,
      ua: null,
      ipv4: null,
      ipv6: null,
      gpuVendor: null,
      gpuRenderer: null,
      os: null,
      timezone: null
    };
  }

  setLang(lang) {
    this.lang = lang;
    if (this.cachedData.ipv4 === 'detecting...' || this.cachedData.ipv4 === 'определение...') {
      this.cachedData.ipv4 = lang === 'ru' ? 'определение...' : 'detecting...';
    }
    if (this.cachedData.ipv6 === 'detecting...' || this.cachedData.ipv6 === 'определение...') {
      this.cachedData.ipv6 = lang === 'ru' ? 'определение...' : 'detecting...';
    }
  }

  setDevOverride(key, val) {
    this.devOverrides.active = true;
    this.devOverrides[key] = val;
  }

  clearDevOverrides() {
    this.devOverrides = {
      active: false,
      ua: null,
      ipv4: null,
      ipv6: null,
      gpuVendor: null,
      gpuRenderer: null,
      os: null,
      timezone: null
    };
  }

  setLastSpeeds(down, up) {
    const unit = this.lang === 'ru' ? 'мбит/с' : 'Mbps';
    this.cachedData.lastDownload = down ? `${down} ${unit}` : '- - -';
    this.cachedData.lastUpload = up ? `${up} ${unit}` : '- - -';
  }

  async fetchIPs() {
    try {
      const res4 = await fetch('https://api4.ipify.org?format=json', { mode: 'cors' });
      if (res4.ok) {
        const data = await res4.json();
        this.cachedData.ipv4 = data.ip;
      }
    } catch {
      try {
        const cfRes = await fetch('https://speed.cloudflare.com/cdn-cgi/trace');
        const text = await cfRes.text();
        const match = text.match(/ip=(.+)/);
        if (match && match[1]) {
          if (match[1].includes(':')) {
            this.cachedData.ipv6 = match[1];
            this.cachedData.ipv4 = this.lang === 'ru' ? 'не назначен / NAT' : 'not assigned / NAT';
          } else {
            this.cachedData.ipv4 = match[1];
          }
        }
      } catch {
        this.cachedData.ipv4 = this.lang === 'ru' ? 'недоступно' : 'unavailable';
      }
    }

    try {
      const res6 = await fetch('https://api6.ipify.org?format=json', { mode: 'cors' });
      if (res6.ok) {
        const data = await res6.json();
        this.cachedData.ipv6 = data.ip;
      } else if (this.cachedData.ipv6 === 'определение...' || this.cachedData.ipv6 === 'detecting...') {
        this.cachedData.ipv6 = this.lang === 'ru' ? 'не поддерживается' : 'not supported';
      }
    } catch {
      if (this.cachedData.ipv6 === 'определение...' || this.cachedData.ipv6 === 'detecting...') {
        this.cachedData.ipv6 = this.lang === 'ru' ? 'не поддерживается' : 'not supported';
      }
    }
  }

  getGPUInfo() {
    const isRu = (this.lang === 'ru');
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: isRu ? 'Не поддерживается WebGL' : 'WebGL not supported', renderer: isRu ? 'Стандартный драйвер' : 'Standard driver' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || (isRu ? 'Неизвестно' : 'Unknown');
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || (isRu ? 'Неизвестно' : 'Unknown');
        return { vendor, renderer };
      }
      return {
        vendor: gl.getParameter(gl.VENDOR) || 'WebGL',
        renderer: gl.getParameter(gl.RENDERER) || 'Generic'
      };
    } catch {
      return { vendor: isRu ? 'Ошибка WebGL' : 'WebGL error', renderer: isRu ? 'Недоступно' : 'Unavailable' };
    }
  }

  /**
   * Определение пиксельной иконки GPU вендора
   */
  detectGpuVendorIcon(vendorStr, rendererStr) {
    const v = String(vendorStr || '');
    const r = String(rendererStr || '');
    const combined = `${v} ${r}`.toLowerCase();
    
    // 1. AMD / Radeon / Mesa RADV / AMDGPU / Advanced Micro Devices
    if (
      combined.includes('amd') || 
      combined.includes('advanced micro devices') ||
      combined.includes('radeon') || 
      combined.includes('ati') ||
      combined.includes('radv') || 
      combined.includes('amdgpu') || 
      combined.includes('rdna') || 
      combined.includes('polaris') || 
      combined.includes('vega') || 
      combined.includes('navi') || 
      combined.includes('renoir') || 
      combined.includes('cezanne') || 
      combined.includes('rembrandt') || 
      combined.includes('phoenix') || 
      combined.includes('strix')
    ) {
      return PixelIcons.gpuAmd;
    }

    // 2. NVIDIA
    if (
      combined.includes('nvidia') || 
      combined.includes('geforce') || 
      combined.includes('quadro') || 
      combined.includes('nouveau') || 
      combined.includes('rtx') || 
      combined.includes('gtx')
    ) {
      return PixelIcons.gpuNvidia;
    }

    // 3. Intel
    if (
      combined.includes('intel') || 
      combined.includes('arc') || 
      combined.includes('iris') || 
      combined.includes('uhd') || 
      combined.includes('hd graphics') || 
      combined.includes('alderlake') || 
      combined.includes('tigerlake') || 
      combined.includes('raptorlake')
    ) {
      return PixelIcons.gpuIntel;
    }

    // 4. Apple
    if (
      combined.includes('apple') || 
      combined.includes('m1') || 
      combined.includes('m2') || 
      combined.includes('m3') || 
      combined.includes('m4')
    ) {
      return PixelIcons.gpuApple;
    }

    return PixelIcons.gpuUnknown;
  }

  detectBrowser(ua) {
    let name = (this.lang === 'ru') ? 'Браузер' : 'Browser';
    let icon = PixelIcons.browserUnknown;

    const isBrave = (navigator.brave && typeof navigator.brave.isBrave === 'function') || ua.includes('Brave');
    const isTor = ua.includes('TorBrowser') || ua.includes('Tor');

    if (isTor) {
      name = 'Tor Browser (Firefox Gecko)';
      icon = PixelIcons.browserTor;
    } else if (isBrave) {
      const match = ua.match(/Chrome\/(\d+(\.\d+)?)/);
      name = `Brave ${match ? match[1] : ''} (Chromium)`;
      icon = PixelIcons.browserBrave;
    } else if (ua.includes('Firefox/') || ua.includes('Gecko/')) {
      const match = ua.match(/Firefox\/(\d+(\.\d+)?)/);
      const geckoMatch = ua.match(/rv:(\d+(\.\d+)?)/);
      const ver = match ? match[1] : (geckoMatch ? geckoMatch[1] : '');
      name = `Firefox ${ver} (Gecko ${geckoMatch ? geckoMatch[1] : ver})`.trim();
      icon = PixelIcons.browserFirefox;
    } else if (ua.includes('Edg/')) {
      const match = ua.match(/Edg\/(\d+(\.\d+)?)/);
      name = `Microsoft Edge ${match ? match[1] : ''} (Blink)`.trim();
      icon = PixelIcons.browserEdge;
    } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
      const match = ua.match(/(?:OPR|Opera)\/(\d+(\.\d+)?)/);
      name = `Opera ${match ? match[1] : ''} (Blink)`.trim();
      icon = PixelIcons.browserOpera;
    } else if (ua.includes('Chrome/') || ua.includes('Chromium/')) {
      const match = ua.match(/Chrome\/(\d+(\.\d+)?)/);
      name = `Chrome ${match ? match[1] : ''} (Blink)`.trim();
      icon = PixelIcons.browserChrome;
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/(\d+(\.\d+)?)/);
      name = `Safari ${match ? match[1] : ''} (WebKit)`.trim();
      icon = PixelIcons.browserSafari;
    }

    return { name, icon };
  }

  getOS(ua) {
    if (ua.includes('Windows NT 10.0')) return 'Windows 10 / 11';
    if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
    if (ua.includes('Windows NT 6.1')) return 'Windows 7';
    if (ua.includes('Mac OS X')) {
      const match = ua.match(/Mac OS X ([0-9_]+)/);
      return match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
    }
    if (ua.includes('Android')) {
      const match = ua.match(/Android ([0-9.]+)/);
      return match ? `Android ${match[1]}` : 'Android';
    }
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Linux')) return 'Linux';
    return navigator.platform || (this.lang === 'ru' ? 'Неизвестно' : 'Unknown');
  }

  getFullReport() {
    const isRu = (this.lang === 'ru');
    const locale = isRu ? 'ru-RU' : 'en-US';
    const now = new Date();
    const ua = this.devOverrides.ua || navigator.userAgent;
    const realGpu = this.getGPUInfo();
    const gpuVendor = this.devOverrides.gpuVendor || realGpu.vendor;
    const gpuRenderer = this.devOverrides.gpuRenderer || realGpu.renderer;

    const browserInfo = this.detectBrowser(ua);
    const gpuIcon = this.detectGpuVendorIcon(gpuVendor, gpuRenderer);

    const dateStr = now.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
    const timeStr = now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const timeZone = this.devOverrides.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const ipv4Val = this.devOverrides.ipv4 || this.cachedData.ipv4;
    const ipv6Val = this.devOverrides.ipv6 || this.cachedData.ipv6;
    const osVal = this.devOverrides.os || this.getOS(ua);

    const labels = isRu ? {
      date: 'дата',
      time: 'время',
      timezone: 'часовой пояс',
      ipv4: 'ipv4 адрес',
      ipv6: 'ipv6 адрес',
      down_speed: 'входящая скорость',
      up_speed: 'исходящая скорость',
      browser: 'браузер',
      os: 'операционная система',
      gpu_vendor: 'gpu вендор',
      gpu_renderer: 'gpu рендерер',
      user_agent: 'userAgent'
    } : {
      date: 'date',
      time: 'time',
      timezone: 'timezone',
      ipv4: 'ipv4 address',
      ipv6: 'ipv6 address',
      down_speed: 'download speed',
      up_speed: 'upload speed',
      browser: 'browser',
      os: 'operating system',
      gpu_vendor: 'gpu vendor',
      gpu_renderer: 'gpu renderer',
      user_agent: 'userAgent'
    };

    return [
      { id: 'date', icon: PixelIcons.calendar, label: labels.date, value: dateStr },
      { id: 'time', icon: PixelIcons.clock, label: labels.time, value: timeStr },
      { id: 'timezone', icon: PixelIcons.globe, label: labels.timezone, value: timeZone },
      { id: 'ipv4', icon: PixelIcons.ip, label: labels.ipv4, value: ipv4Val },
      { id: 'ipv6', icon: PixelIcons.ip, label: labels.ipv6, value: ipv6Val },
      { id: 'down_speed', icon: PixelIcons.speedDown, label: labels.down_speed, value: this.cachedData.lastDownload },
      { id: 'up_speed', icon: PixelIcons.speedUp, label: labels.up_speed, value: this.cachedData.lastUpload },
      { id: 'browser', icon: browserInfo.icon, label: labels.browser, value: browserInfo.name },
      { id: 'os', icon: PixelIcons.os, label: labels.os, value: osVal },
      { id: 'gpu_vendor', icon: gpuIcon, label: labels.gpu_vendor, value: gpuVendor },
      { id: 'gpu_renderer', icon: PixelIcons.gpuRenderer, label: labels.gpu_renderer, value: gpuRenderer },
      { id: 'user_agent', icon: PixelIcons.userAgent, label: labels.user_agent, value: ua }
    ];
  }

  renderToDOM(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const report = this.getFullReport();
    container.innerHTML = report.map(item => `
      <div class="info-item">
        <div class="info-left">
          <span class="pixel-icon">${item.icon}</span>
          <span class="info-label">${item.label}:</span>
        </div>
        <div class="info-val" id="info-val-${item.id}">${item.value}</div>
      </div>
    `).join('');
  }
}

window.SystemInfoCollector = SystemInfoCollector;
