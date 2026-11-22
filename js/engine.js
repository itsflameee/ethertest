/**
 * EtherTest Core Engine
 * Соответствует спецификации speedtest-spec.md:
 * - Пинг/Джиттер по RFC 3550 с серией микро-запросов
 * - Детекция доступности Cloudflare перед тестом (1.5с таймаут)
 * - Умный мульти-провайдерный фоллбэк:
 *   * При блокировке Cloudflare в РФ мгновенно задействуется пул быстрых локальных CDN (Яндекс CDN yastatic.net, VK Cloud Storage, Selectel)
 *   * Открытый CORS (*), стриминг через ReadableStream без аллокаций памяти (Zero Memory Leak)
 *   * Пул из 8-12 параллельных потоков для утилизации 1-2.5 Гбит/с каналов
 *   * Защита от сбоев: при сетевой ошибке поток переключается на следующее зеркало без падения теста в 0
 *   * Upload фоллбэк на открытые HTTP эхо/приемники
 * - EWMA скользящее окно с тиком каждые 100 мс, отсечение slow-start
 * - Event-Driven Architecture
 */

class EtherTestEngine {
  constructor() {
    this.status = 'idle'; // 'idle' | 'ping' | 'download' | 'upload' | 'completed' | 'error'
    this.listeners = {};
    this.abortController = null;
    this.useCloudflare = true;

    // Провайдеры и эндпоинты
    this.endpoints = {
      cfDown: (bytes) => `https://speed.cloudflare.com/__down?bytes=${bytes}`,
      cfUp: 'https://speed.cloudflare.com/__up',
      cfPing: 'https://speed.cloudflare.com/cdn-cgi/trace',
      
      // Тяжелые статические файлы и ассеты с открытыми CORS (*) и быстрым доступом в РФ (Мск/Екб/Спб):
      // Яндекс CDN, VK Cloud Storage, cdnjs, jsdelivr
      ruCdnPool: [
        // Яндекс CDN
        'https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/3.0.12328/build/full.js',
        'https://yastatic.net/s3/web4static/_/v2/static/js/bundle-search.js',
        'https://yastatic.net/s3/distribution-static/browser/yandex.exe',
        'https://yastatic.net/s3/home/dist/desktop.css',
        // VK / Mail Cloud CDN
        'https://hb.bizmrg.com/public-assets/static/bundle.js',
        // Зеркала с открытым CORS и серверами в РФ
        'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
        'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.js',
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.js'
      ],

      // Эндпоинты для пинга
      pingTargets: [
        'https://yastatic.net/favicon.ico',
        'https://speed.cloudflare.com/cdn-cgi/trace',
        'https://1.1.1.1/cdn-cgi/trace'
      ],

      // Эндпоинты для отдачи (Upload) с открытым CORS (*) и поддержкой высоких скоростей
      uploadTargets: [
        'https://speed.cloudflare.com/__up',
        'https://icanhazip.com',
        'https://ipv4.icanhazip.com'
      ]
    };

    this.state = {
      ping: { current: 0, min: 0, max: 0, avg: 0, jitter: 0 },
      download: { currentMbps: 0, peakMbps: 0, totalBytes: 0, progress: 0 },
      upload: { currentMbps: 0, peakMbps: 0, totalBytes: 0, progress: 0 }
    };
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  /**
   * Быстрая проверка доступности Cloudflare (1.5 сек таймаут)
   */
  async checkCloudflareAvailability() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(`${this.endpoints.cfPing}?t=${Date.now()}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      this.useCloudflare = res.ok;
    } catch {
      clearTimeout(timeoutId);
      this.useCloudflare = false;
    }

    return this.useCloudflare;
  }

  async runFullTest() {
    if (this.status !== 'idle' && this.status !== 'completed' && this.status !== 'error') {
      return;
    }

    this.abortController = new AbortController();
    this.emit('start');

    try {
      // 0. Автопроверка региона / Cloudflare
      this.emit('statusMessage', 'проверка доступности узлов сети...');
      await this.checkCloudflareAvailability();

      if (!this.useCloudflare) {
        this.emit('statusMessage', 'узлы РФ: активирован локальный CDN пул (Яндекс / RU CDN)');
      } else {
        this.emit('statusMessage', 'активирован глобальный Cloudflare CDN');
      }

      // 1. ФАЗА ПИНГА И ДЖИТТЕРА (RFC 3550)
      this.status = 'ping';
      this.emit('phaseChange', { phase: 'ping', provider: this.useCloudflare ? 'Cloudflare' : 'RU CDN' });
      await this.runPingTest(15);

      // 2. ФАЗА ЗАГРУЗКИ (DOWNLOAD)
      this.status = 'download';
      this.emit('phaseChange', { phase: 'download', provider: this.useCloudflare ? 'Cloudflare' : 'RU CDN' });
      await this.runDownloadTest(8500);

      await new Promise(r => setTimeout(r, 400));

      // 3. ФАЗА ОТДАЧИ (UPLOAD)
      this.status = 'upload';
      this.emit('phaseChange', { phase: 'upload', provider: this.useCloudflare ? 'Cloudflare' : 'Echo Mirror' });
      await this.runUploadTest(8000);

      // ЗАВЕРШЕНИЕ
      this.status = 'completed';
      this.emit('phaseChange', { phase: 'completed' });
      this.emit('complete', {
        ping: this.state.ping,
        download: this.state.download,
        upload: this.state.upload
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        this.status = 'idle';
        this.emit('phaseChange', { phase: 'idle' });
      } else {
        console.error('Speedtest error:', err);
        this.status = 'error';
        this.emit('phaseChange', { phase: 'error' });
        this.emit('error', err);
      }
    }
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.status = 'idle';
    this.emit('phaseChange', { phase: 'idle' });
  }

  /**
   * Замер пинга и джиттера по RFC 3550
   */
  async runPingTest(samplesCount = 15) {
    const rtts = [];
    let prevRtt = null;
    let jitter = 0;

    // Выбираем цель для пинга в зависимости от региона
    const pingTarget = this.useCloudflare ? this.endpoints.pingTargets[1] : this.endpoints.pingTargets[0];

    for (let i = 0; i < samplesCount; i++) {
      if (this.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const url = `${pingTarget}?t=${Date.now()}_${i}`;
      const tStart = performance.now();
      try {
        await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          mode: 'cors',
          signal: this.abortController.signal
        });
        const rtt = Math.max(1, performance.now() - tStart);
        rtts.push(rtt);

        // RFC 3550
        if (prevRtt !== null) {
          const diff = Math.abs(rtt - prevRtt);
          jitter = jitter + (diff - jitter) / 16;
        }
        prevRtt = rtt;

        const sum = rtts.reduce((a, b) => a + b, 0);
        const avg = sum / rtts.length;
        const min = Math.min(...rtts);
        const max = Math.max(...rtts);

        this.state.ping = {
          current: Math.round(rtt),
          min: Math.round(min),
          max: Math.round(max),
          avg: Math.round(avg),
          jitter: Math.round(jitter * 10) / 10
        };

        this.emit('pingUpdate', this.state.ping);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }

      await new Promise(r => setTimeout(r, 60));
    }
  }

  /**
   * Высокоскоростной замер загрузки (Download)
   * Пул из 10 параллельных потоков, чтение чанков без сохранения в память.
   * Умный фоллбэк: если Cloudflare душится — автоматическое переключение на CDN РФ без падений в 0.
   */
  async runDownloadTest(durationMs = 8500) {
    const numStreams = 10;
    const testStartTime = performance.now();
    let totalLoadedBytes = 0;
    let lastLoadedBytes = 0;
    let lastSampleTime = testStartTime;

    let smoothedMbps = 0;
    let peakMbps = 0;
    const slowStartDurationMs = 600;

    let isRunning = true;
    let activeProviderIsCf = this.useCloudflare;
    const ruCdnList = this.endpoints.ruCdnPool;

    // Воркерный поток с автоматическим переключением зеркал
    const workerStream = async (workerId) => {
      let urlIndex = workerId % ruCdnList.length;

      while (isRunning && !this.abortController.signal.aborted) {
        try {
          let targetUrl;
          if (activeProviderIsCf) {
            targetUrl = `${this.endpoints.cfDown(30 * 1024 * 1024)}&worker=${workerId}&ts=${Date.now()}`;
          } else {
            const baseUrl = ruCdnList[urlIndex % ruCdnList.length];
            targetUrl = `${baseUrl}?nocache=${Date.now()}_${workerId}_${Math.random()}`;
          }

          const res = await fetch(targetUrl, {
            mode: 'cors',
            cache: 'no-store',
            signal: this.abortController.signal
          });

          if (!res.ok && activeProviderIsCf) {
            // Если Cloudflare выдал ошибку, переключаем весь тест на RU CDN
            activeProviderIsCf = false;
            this.emit('statusMessage', 'переключение на резервные CDN узлы РФ...');
            continue;
          }

          if (!res.body) {
            urlIndex++;
            continue;
          }

          const reader = res.body.getReader();

          while (isRunning) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalLoadedBytes += value.length; // Чтение длины чанка без аллокаций
            }
          }

          // По завершении чанка переходим к следующему URL
          urlIndex++;
        } catch (e) {
          if (e.name === 'AbortError') throw e;

          // При ошибке Cloudflare (например блокировка ТСПУ / Failed to fetch)
          if (activeProviderIsCf) {
            activeProviderIsCf = false;
            this.emit('statusMessage', 'cloudflare заблокирован: переключение на быстрый CDN РФ...');
          }

          // Тихо переключаем зеркало и продолжаем качать
          urlIndex++;
          await new Promise(r => setTimeout(r, 40));
        }
      }
    };

    const workerPromises = Array.from({ length: numStreams }, (_, i) => workerStream(i));

    let speedSamples = [];

    // Цикл расчета метрик каждые 100 мс
    while (performance.now() - testStartTime < durationMs) {
      if (this.abortController.signal.aborted) {
        isRunning = false;
        throw new DOMException('Aborted', 'AbortError');
      }

      await new Promise(r => setTimeout(r, 100));

      const now = performance.now();
      const deltaSec = (now - lastSampleTime) / 1000;
      if (deltaSec <= 0) continue;

      const deltaBytes = totalLoadedBytes - lastLoadedBytes;
      lastLoadedBytes = totalLoadedBytes;
      lastSampleTime = now;

      // Мбит/с за текущий интервал
      const instantMbps = (deltaBytes * 8) / (deltaSec * 1_000_000);

      // EWMA сглаживание: alpha = 0.35
      if (smoothedMbps === 0) {
        smoothedMbps = instantMbps;
      } else {
        smoothedMbps = smoothedMbps * 0.65 + instantMbps * 0.35;
      }

      const elapsed = now - testStartTime;
      if (elapsed > slowStartDurationMs) {
        speedSamples.push(smoothedMbps);
        if (smoothedMbps > peakMbps) {
          peakMbps = smoothedMbps;
        }
      }

      // Накопительное среднее по всем значениям с момента прогрева
      const avgMbps = speedSamples.length > 0
        ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
        : smoothedMbps;

      this.state.download = {
        currentMbps: Math.max(0, Math.round(avgMbps * 10) / 10),
        avgMbps: Math.max(0, Math.round(avgMbps * 10) / 10),
        peakMbps: Math.round(peakMbps * 10) / 10,
        instantMbps: Math.max(0, Math.round(smoothedMbps * 10) / 10),
        totalBytes: totalLoadedBytes,
        progress: Math.min(1, elapsed / durationMs)
      };

      this.emit('downloadProgress', this.state.download);
    }

    isRunning = false;
    await Promise.race([
      Promise.all(workerPromises),
      new Promise(r => setTimeout(r, 300))
    ]);
  }

  /**
   * Высокоскоростной замер отдачи (Upload)
   * С автоматическим выбором эндпоинта и защитой от падения в 0
   */
  async runUploadTest(durationMs = 8000) {
    const numStreams = 10;
    const testStartTime = performance.now();
    let totalUploadedBytes = 0;
    let lastUploadedBytes = 0;
    let lastSampleTime = testStartTime;

    let smoothedMbps = 0;
    let peakMbps = 0;
    const slowStartDurationMs = 600;

    // 2.5 MB чанк для полной утилизации TCP-окна на гигабитных скоростях
    const bufferSize = 2.5 * 1024 * 1024;
    const chunkData = new Uint8Array(bufferSize);
    for (let i = 0; i < bufferSize; i += 4096) {
      chunkData[i] = (Math.random() * 255) | 0;
    }

    let isRunning = true;
    const targets = this.endpoints.uploadTargets;

    const uploadWorker = async (workerId) => {
      let targetIdx = this.useCloudflare ? 0 : 1;

      while (isRunning && !this.abortController.signal.aborted) {
        const currentTarget = targets[targetIdx % targets.length];
        try {
          const tReqStart = performance.now();
          const res = await fetch(`${currentTarget}?w=${workerId}&ts=${Date.now()}`, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            body: chunkData,
            signal: this.abortController.signal
          });

          const tReqEnd = performance.now();
          if (res.ok && tReqEnd - tReqStart > 0) {
            totalUploadedBytes += bufferSize;
          } else {
            targetIdx++;
            await new Promise(r => setTimeout(r, 40));
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          // Ротация эндпоинта при ошибке
          targetIdx++;
          await new Promise(r => setTimeout(r, 40));
        }
      }
    };

    const workerPromises = Array.from({ length: numStreams }, (_, i) => uploadWorker(i));

    let speedSamples = [];

    while (performance.now() - testStartTime < durationMs) {
      if (this.abortController.signal.aborted) {
        isRunning = false;
        throw new DOMException('Aborted', 'AbortError');
      }

      await new Promise(r => setTimeout(r, 100));

      const now = performance.now();
      const deltaSec = (now - lastSampleTime) / 1000;
      if (deltaSec <= 0) continue;

      const deltaBytes = totalUploadedBytes - lastUploadedBytes;
      lastUploadedBytes = totalUploadedBytes;
      lastSampleTime = now;

      const instantMbps = (deltaBytes * 8) / (deltaSec * 1_000_000);

      if (smoothedMbps === 0) {
        smoothedMbps = instantMbps;
      } else {
        smoothedMbps = smoothedMbps * 0.65 + instantMbps * 0.35;
      }

      const elapsed = now - testStartTime;
      if (elapsed > slowStartDurationMs) {
        speedSamples.push(smoothedMbps);
        if (smoothedMbps > peakMbps) {
          peakMbps = smoothedMbps;
        }
      }

      // Накопительное среднее по всем значениям с момента прогрева
      const avgMbps = speedSamples.length > 0
        ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
        : smoothedMbps;

      this.state.upload = {
        currentMbps: Math.max(0, Math.round(avgMbps * 10) / 10),
        avgMbps: Math.max(0, Math.round(avgMbps * 10) / 10),
        peakMbps: Math.round(peakMbps * 10) / 10,
        instantMbps: Math.max(0, Math.round(smoothedMbps * 10) / 10),
        totalBytes: totalUploadedBytes,
        progress: Math.min(1, elapsed / durationMs)
      };

      this.emit('uploadProgress', this.state.upload);
    }

    isRunning = false;
    await Promise.race([
      Promise.all(workerPromises),
      new Promise(r => setTimeout(r, 300))
    ]);
  }
}

// Экспорт глобально для Vanilla JS
window.EtherTestEngine = EtherTestEngine;
