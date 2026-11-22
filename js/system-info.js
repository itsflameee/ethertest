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
    this.cachedData = {
      ipv4: 'определение...',
      ipv6: 'определение...',
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
    this.cachedData.lastDownload = down ? `${down} мбит/с` : '- - -';
    this.cachedData.lastUpload = up ? `${up} мбит/с` : '- - -';
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
            this.cachedData.ipv4 = 'не назначен / NAT';
          } else {
            this.cachedData.ipv4 = match[1];
          }
        }
      } catch {
        this.cachedData.ipv4 = 'недоступно';
      }
    }

    try {
      const res6 = await fetch('https://api6.ipify.org?format=json', { mode: 'cors' });
      if (res6.ok) {
        const data = await res6.json();
        this.cachedData.ipv6 = data.ip;
      } else if (this.cachedData.ipv6 === 'определение...') {
        this.cachedData.ipv6 = 'не поддерживается';
      }
    } catch {
      if (this.cachedData.ipv6 === 'определение...') {
        this.cachedData.ipv6 = 'не поддерживается';
      }
    }
  }

  getGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: 'Не поддерживается WebGL', renderer: 'Стандартный драйвер' };

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Неизвестно';
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Неизвестно';
        return { vendor, renderer };
      }
      return {
        vendor: gl.getParameter(gl.VENDOR) || 'WebGL',
        renderer: gl.getParameter(gl.RENDERER) || 'Generic'
      };
    } catch {
      return { vendor: 'Ошибка WebGL', renderer: 'Недоступно' };
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
    let name = 'Браузер';
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
    return navigator.platform || 'Неизвестно';
  }

  getFullReport() {
    const now = new Date();
    const ua = this.devOverrides.ua || navigator.userAgent;
    const realGpu = this.getGPUInfo();
    const gpuVendor = this.devOverrides.gpuVendor || realGpu.vendor;
    const gpuRenderer = this.devOverrides.gpuRenderer || realGpu.renderer;

    const browserInfo = this.detectBrowser(ua);
    const gpuIcon = this.detectGpuVendorIcon(gpuVendor, gpuRenderer);

    const dateStr = now.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
    const timeStr = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const timeZone = this.devOverrides.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const ipv4Val = this.devOverrides.ipv4 || this.cachedData.ipv4;
    const ipv6Val = this.devOverrides.ipv6 || this.cachedData.ipv6;
    const osVal = this.devOverrides.os || this.getOS(ua);

    return [
      { id: 'date', icon: PixelIcons.calendar, label: 'дата', value: dateStr },
      { id: 'time', icon: PixelIcons.clock, label: 'время', value: timeStr },
      { id: 'timezone', icon: PixelIcons.globe, label: 'часовой пояс', value: timeZone },
      { id: 'ipv4', icon: PixelIcons.ip, label: 'ipv4 адрес', value: ipv4Val },
      { id: 'ipv6', icon: PixelIcons.ip, label: 'ipv6 адрес', value: ipv6Val },
      { id: 'down_speed', icon: PixelIcons.speedDown, label: 'входящая скорость', value: this.cachedData.lastDownload },
      { id: 'up_speed', icon: PixelIcons.speedUp, label: 'исходящая скорость', value: this.cachedData.lastUpload },
      { id: 'browser', icon: browserInfo.icon, label: 'браузер', value: browserInfo.name },
      { id: 'os', icon: PixelIcons.os, label: 'операционная система', value: osVal },
      { id: 'gpu_vendor', icon: gpuIcon, label: 'gpu вендор', value: gpuVendor },
      { id: 'gpu_renderer', icon: PixelIcons.gpuRenderer, label: 'gpu рендерер', value: gpuRenderer },
      { id: 'user_agent', icon: PixelIcons.userAgent, label: 'userAgent', value: ua }
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
