(function (global) {
  function clampNum(value, min, max) {
    var num = Number(value);
    if (Number.isNaN(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function normalizeData(input) {
    return {
      filename: input.filename || "untitled.json",
      width: input.width,
      height: input.height,
      pixels:
        input.pixels instanceof Uint8Array
          ? input.pixels
          : Uint8Array.from(input.pixels || []),
      colors: (input.colors || []).map(function (c) {
        return [c[0], c[1], c[2]];
      }),
      cycles: (input.cycles || []).map(function (cy) {
        return {
          low: clampNum(cy.low, 0, 255),
          high: clampNum(cy.high, 0, 255),
          rate: Number(cy.rate) || 0,
          reverse: Number(cy.reverse) === 2 || Number(cy.reverse) === 1 ? 1 : 0,
        };
      }),
    };
  }

  function getCycledColors(baseColors, cycles, timeNow) {
    var colors = baseColors.map(function (c) {
      return [c[0], c[1], c[2]];
    });
    for (var i = 0; i < cycles.length; i++) {
      var cycle = cycles[i];
      if (!cycle || !cycle.rate) continue;
      var low = Math.max(0, cycle.low | 0);
      var high = Math.min(255, cycle.high | 0);
      if (high <= low) continue;
      var size = high - low + 1;
      var amountRaw = Math.floor(
        (timeNow / (1000 / (cycle.rate / 280))) % size,
      );
      var amount = cycle.reverse === 1 ? (size - amountRaw) % size : amountRaw;
      if (!amount) continue;
      var segment = colors.slice(low, high + 1);
      for (var j = 0; j < size; j++) {
        colors[low + ((j + amount) % size)] = segment[j];
      }
    }
    return colors;
  }

  function Cycle8Player(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.imageData = null;
    this.data = null;
    this.paused = false;
    this.raf = 0;
    this.lastDraw = 0;
    this.targetFps = 60;
    this.loop = this.loop.bind(this);
  }

  Cycle8Player.prototype.loadFromData = function (jsonData) {
    this.data = normalizeData(jsonData);
    this.canvas.width = this.data.width;
    this.canvas.height = this.data.height;
    this.imageData = this.ctx.createImageData(
      this.data.width,
      this.data.height,
    );
    this.lastDraw = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  };

  Cycle8Player.prototype.loadFromUrl = async function (url) {
    var stamp = "t=" + Date.now();
    var glue = url.indexOf("?") !== -1 ? "&" : "?";
    var res = await fetch(url + glue + stamp, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load " + url);
    var json = await res.json();
    this.loadFromData(json);
  };

  Cycle8Player.prototype.pause = function () {
    this.paused = true;
  };
  Cycle8Player.prototype.resume = function () {
    this.paused = false;
  };
  Cycle8Player.prototype.stop = function () {
    this.paused = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.data = null;
    if (this.imageData)
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  Cycle8Player.prototype.loop = function (now) {
    if (this.data && !this.paused) {
      var minDelta = 1000 / this.targetFps;
      if (now - this.lastDraw >= minDelta) {
        this.render(now);
        this.lastDraw = now;
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  Cycle8Player.prototype.render = function (now) {
    var colors = getCycledColors(this.data.colors, this.data.cycles, now);
    var src = this.data.pixels;
    var dst = this.imageData.data;
    for (var i = 0; i < src.length; i++) {
      var c = colors[src[i]] || [0, 0, 0];
      var di = i * 4;
      dst[di] = c[0];
      dst[di + 1] = c[1];
      dst[di + 2] = c[2];
      dst[di + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  };

  global.Cycle8Player = Cycle8Player;
})(window);
