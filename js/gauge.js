/**
 * EtherTest Pixel Gauge Renderer
 * - Окружность из дискретных раздельных пикселей-квадратов со скруглением.
 * - Шкала мер интернета до 1000 Мбит/с.
 * - Минималистичная, четкая пиксельная стрелка (needle).
 * - Попиксельная анимация «дыхания» снизу вверх и перелив цветов.
 * - Поддержка кастомных цветов из темы!
 */

class PixelGauge {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    this.width = 460;
    this.height = 460;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.radius = 180;

    this.startAngle = Math.PI * 0.75;  
    this.endAngle = Math.PI * 2.25;    
    this.totalAngle = this.endAngle - this.startAngle;

    this.speedMarks = [0, 10, 50, 100, 250, 500, 750, 1000];

    this.numSegments = 48;
    this.segmentSize = 8;
    this.segmentRadius = 2;

    this.targetSpeed = 0;
    this.displaySpeed = 0;
    this.maxSpeed = 1000;
    this.phase = 'idle';
    this.theme = 'pure-oled';

    this.customColors = null; // Для кастомной темы

    this.pulseTime = 0;
    this.isTesting = false;

    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  setTheme(theme, customColors = null) {
    this.theme = theme;
    this.customColors = customColors;
  }

  setPhase(phase) {
    this.phase = phase;
    this.isTesting = (phase === 'download' || phase === 'upload');
  }

  setSpeed(speedMbps) {
    this.targetSpeed = Math.min(this.maxSpeed, Math.max(0, speedMbps));
  }

  reset() {
    this.targetSpeed = 0;
    this.displaySpeed = 0;
    this.phase = 'idle';
    this.isTesting = false;
  }

  speedToFraction(speed) {
    if (speed <= 0) return 0;
    if (speed >= 1000) return 1;
    return Math.pow(speed / 1000, 0.45);
  }

  getPulseColor(pixelIndex, totalPixels, time, phase, theme) {
    const waveOffset = (pixelIndex / totalPixels) * Math.PI * 2;
    const wave = (Math.sin(time * 0.005 + waveOffset) + 1) / 2;

    if (this.customColors) {
      if (phase === 'download') return this.customColors.dlPulse || '#cceeff';
      if (phase === 'upload') return this.customColors.ulPulse || '#f6c6f6';
      return this.customColors.active || '#ffffff';
    }

    if (theme === 'hacker') {
      if (phase === 'download') {
        const r = 0;
        const g = 255;
        const b = Math.round(102 + wave * (170 - 102));
        return `rgb(${r},${g},${b})`;
      } else if (phase === 'upload') {
        const r = Math.round(50 + wave * (136 - 50));
        const g = 255;
        const b = Math.round(150 + wave * (204 - 150));
        return `rgb(${r},${g},${b})`;
      }
      return '#00ff66';
    }

    if (theme === 'cyber') {
      if (phase === 'download') {
        return '#66ffea';
      } else if (phase === 'upload') {
        return '#ff88ee';
      }
      return '#00ffcc';
    }

    if (theme === 'day') {
      if (phase === 'download') {
        const r = Math.round(17 + wave * (0 - 17));
        const g = Math.round(17 + wave * (102 - 17));
        const b = Math.round(17 + wave * (204 - 17));
        return `rgb(${r},${g},${b})`;
      } else if (phase === 'upload') {
        const r = Math.round(17 + wave * (170 - 17));
        const g = Math.round(17 + wave * (0 - 17));
        const b = Math.round(17 + wave * (170 - 17));
        return `rgb(${r},${g},${b})`;
      }
      return '#111111';
    }

    if (phase === 'download') {
      const r = Math.round(255 - wave * (255 - 204));
      const g = Math.round(255 - wave * (255 - 238));
      const b = 255;
      return `rgb(${r},${g},${b})`;
    } else if (phase === 'upload') {
      const r = 255;
      const g = Math.round(255 - wave * (255 - 198));
      const b = 255;
      return `rgb(${r},${g},${b})`;
    }

    return '#ffffff';
  }

  getInactivePixelColor(theme) {
    if (this.customColors) return this.customColors.gaugeBg || '#222222';
    if (theme === 'hacker') return '#0b1f12';
    if (theme === 'cyber') return '#112220';
    if (theme === 'pure-oled') return '#2a2a2a';
    if (theme === 'dark') return '#262630';
    if (theme === 'night') return '#261b3d';
    if (theme === 'day') return '#d6d6dc';
    return '#222222';
  }

  getTextColor(theme) {
    if (this.customColors) return this.customColors.inactive || '#777777';
    if (theme === 'hacker') return '#1a5c32';
    if (theme === 'cyber') return '#447766';
    if (theme === 'day') return '#666666';
    if (theme === 'night') return '#796899';
    return '#777777';
  }

  getNeedleColor(theme) {
    if (this.customColors) return this.customColors.needle || '#ffffff';
    if (theme === 'hacker') return '#00ff66';
    if (theme === 'cyber') return '#00ffcc';
    if (theme === 'day') return '#111111';
    return '#ffffff';
  }

  render(timestamp) {
    this.pulseTime = timestamp || 0;

    const lerpFactor = this.isTesting ? 0.16 : 0.08;
    this.displaySpeed += (this.targetSpeed - this.displaySpeed) * lerpFactor;
    if (Math.abs(this.targetSpeed - this.displaySpeed) < 0.05) {
      this.displaySpeed = this.targetSpeed;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawScaleLabels(ctx);
    this.drawPixelRing(ctx);

    if (this.isTesting || this.displaySpeed > 0.5) {
      this.drawPixelNeedle(ctx);
    }

    requestAnimationFrame(this.render);
  }

  drawScaleLabels(ctx) {
    ctx.save();
    ctx.font = '10px "Hack", "JetBrains Mono", monospace';
    ctx.fillStyle = this.getTextColor(this.theme);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const labelRadius = this.radius + 28;

    this.speedMarks.forEach(speed => {
      const frac = this.speedToFraction(speed);
      const angle = this.startAngle + frac * this.totalAngle;
      const x = this.centerX + Math.cos(angle) * labelRadius;
      const y = this.centerY + Math.sin(angle) * labelRadius;

      ctx.fillText(speed.toString(), x, y);
    });

    ctx.restore();
  }

  drawPixelRing(ctx) {
    const activeFraction = this.speedToFraction(this.displaySpeed);
    const activeSegmentsCount = Math.round(activeFraction * this.numSegments);
    const inactiveColor = this.getInactivePixelColor(this.theme);

    for (let i = 0; i <= this.numSegments; i++) {
      const frac = i / this.numSegments;
      const angle = this.startAngle + frac * this.totalAngle;

      const px = this.centerX + Math.cos(angle) * this.radius;
      const py = this.centerY + Math.sin(angle) * this.radius;

      const isActive = i <= activeSegmentsCount && this.displaySpeed > 0;
      let fillColor = inactiveColor;

      if (isActive) {
        fillColor = this.getPulseColor(i, this.numSegments, this.pulseTime, this.phase, this.theme);
      }

      ctx.fillStyle = fillColor;
      this.roundRect(
        ctx,
        px - this.segmentSize / 2,
        py - this.segmentSize / 2,
        this.segmentSize,
        this.segmentSize,
        this.segmentRadius
      );
      ctx.fill();
    }
  }

  drawPixelNeedle(ctx) {
    const fraction = this.speedToFraction(this.displaySpeed);
    const angle = this.startAngle + fraction * this.totalAngle;

    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.rotate(angle);

    const needleColor = this.getNeedleColor(this.theme);
    ctx.fillStyle = needleColor;

    ctx.fillRect(-4, -4, 8, 8);

    const needleEnd = this.radius - 20;

    ctx.fillRect(4, -1, needleEnd - 12, 2);

    ctx.fillRect(needleEnd - 8, -3, 2, 6);
    ctx.fillRect(needleEnd - 6, -2, 2, 4);
    ctx.fillRect(needleEnd - 4, -1, 4, 2);

    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

window.PixelGauge = PixelGauge;
