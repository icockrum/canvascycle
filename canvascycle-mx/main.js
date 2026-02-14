FrameCount.visible = false;

var CanvasCycle = {
  cookie: new CookieTree(),
  ctx: null,
  imageData: null,
  clock: 0,
  inGame: false,
  bmp: null,
  globalTimeStart: new Date().getTime(),
  inited: false,
  optTween: null,
  winSize: null,
  globalBrightness: 1.0,
  lastBrightness: 0,
  sceneIdx: -1,
  highlightColor: -1,
  hoverHighlightColor: -1,
  keyboardHighlightColor: -1,
  selectedColor: -1,
  paused: false,
  pausedTime: 0,
  uploadedImageData: null,
  currentSource: "sample",
  activeFilename: "",
  pendingSceneIdx: -1,
  pendingSceneName: "",
  view: { zoom: 1, minZoom: 0.25, maxZoom: 10, offsetX: 0, offsetY: 0 },
  activeTool: "zoom",
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartOffsetX: 0,
  dragStartOffsetY: 0,
  currentPaintColor: [0, 0, 0],

  settings: {
    showOptions: true,
    targetFPS: 60,
    blendShiftEnabled: true,
    speedAdjust: 1.0,
  },

  contentSize: {
    width: 640,
    optionsWidth: 150,
    height: 480 + 40,
    scale: 1.0,
  },

  init: function () {
    if (this.inited) return;
    this.inited = true;
    // $("container").style.display = "block";
    // $("d_options").style.display = "";
    FrameCount.init();
    this.handleResize();
    this.buildPalette();
    this.bindKeyboardNavigation();
    this.bindUploadControls();
    this.bindMenus();
    this.bindCanvasTools();
    this.populateScenes(0);
    this.applyStoredPrefs();
    this.setTool("zoom");
    this.updateColorChip();
    this.loadImage(scenes[0].name);
    this.sceneIdx = 0;
  },

  buildPalette: function () {
    var pal = $("palette_display");
    for (var idx = 0; idx < 256; idx++) {
      var div = document.createElement("div");
      div._idx = idx;
      div.id = "pal_" + idx;
      div.className = "palette_color";
      div.draggable = true;
      div.onmouseover = function () {
        CanvasCycle.hoverHighlightColor = this._idx;
        CanvasCycle.updateHighlightColor();
      };
      div.onmouseout = function () {
        CanvasCycle.hoverHighlightColor = -1;
        CanvasCycle.updateHighlightColor();
      };
      div.onclick = function () {
        if (CanvasCycle.activeTool === "eyedropper" && CanvasCycle.bmp) {
          var c = CanvasCycle.bmp.palette.baseColors[this._idx];
          if (c) { CanvasCycle.currentPaintColor = [c.red, c.green, c.blue]; CanvasCycle.updateColorChip(); }
          return;
        }
        CanvasCycle.toggleSelectedColor(this._idx);
      };
      div.ondragstart = function (e) {
        e.dataTransfer.setData("text/plain", "" + this._idx);
      };
      div.ondragover = function (e) {
        e.preventDefault();
      };
      div.ondrop = function (e) {
        e.preventDefault();
        var from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        var to = this._idx;
        CanvasCycle.reorderPalette(from, to);
      };
      pal.appendChild(div);
    }
    var clear = document.createElement("div");
    clear.className = "clear";
    pal.appendChild(clear);
  },

  bindUploadControls: function () {
    $("fe_upload_png").addEventListener("change", function (e) {
      CanvasCycle.handlePNGUpload(e);
    });
    $("fe_upload_json").addEventListener("change", function (e) {
      CanvasCycle.handleJSONUpload(e);
    });
  },

  bindMenus: function () {
    $("btn_file_menu").addEventListener("click", function (e) {
      e.stopPropagation();
      var menu = $("file_menu");
      var isHidden = /(^|\s)hidden(\s|$)/.test(menu.className);
      menu.setClass("hidden", !isHidden);
    });
    document.addEventListener("click", function () {
      $("file_menu").setClass("hidden", true);
    });
  },

  bindCanvasTools: function () {
    var canvas = $("mycanvas");
    canvas.addEventListener("mousedown", function (e) {
      CanvasCycle.onCanvasMouseDown(e);
    });
    canvas.addEventListener("mousemove", function (e) {
      CanvasCycle.onCanvasMouseMove(e);
    });
    window.addEventListener("mouseup", function () {
      CanvasCycle.dragging = false;
      CanvasCycle.updateCanvasCursor();
    });
    canvas.addEventListener("click", function (e) {
      CanvasCycle.onCanvasClick(e);
    });
  },

  bindKeyboardNavigation: function () {
    document.addEventListener("keydown", function (e) {
      CanvasCycle.handlePaletteArrowKey(e);
    });
  },

  isArrowKeyReservedTarget: function (el) {
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") return true;
    return false;
  },

  getPaletteColumns: function () {
    var firstChip = $("pal_0");
    if (!firstChip) return 1;
    var firstTop = firstChip.offsetTop;
    var cols = 0;
    for (var i = 0; i < 256; i++) {
      var chip = $("pal_" + i);
      if (!chip || chip.offsetTop !== firstTop) break;
      cols++;
    }
    return Math.max(1, cols);
  },

  handlePaletteArrowKey: function (e) {
    if (!this.bmp) return;
    var key = e.key;
    if (
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "ArrowLeft" &&
      key !== "ArrowRight"
    )
      return;
    if (this.isArrowKeyReservedTarget(document.activeElement)) return;

    var current = this.highlightColor;
    if (current < 0 || current > 255) current = 0;

    var cols = this.getPaletteColumns();
    var next = current;
    if (key === "ArrowLeft") next = current - 1;
    else if (key === "ArrowRight") next = current + 1;
    else if (key === "ArrowUp") next = current - cols;
    else if (key === "ArrowDown") next = current + cols;

    if (next < 0) next = 0;
    if (next > 255) next = 255;

    this.keyboardHighlightColor = next;
    this.updateHighlightColor();
    e.preventDefault();
  },

  updateHighlightColor: function () {
    this.highlightColor =
      this.hoverHighlightColor !== -1
        ? this.hoverHighlightColor
        : this.keyboardHighlightColor;
  },

  populateScenes: function (initialSceneIdx) {
    var html = '<select id="fe_scene" onChange="CanvasCycle.switchScene(this)">';
    for (var i = 0; i < scenes.length; i++) {
      html +=
        '<option value="' +
        scenes[i].name +
        '"' +
        (i === initialSceneIdx ? ' selected="selected"' : "") +
        ">" +
        scenes[i].title +
        "</option>";
    }
    html += "</select>";
    $("d_scene_selector").innerHTML = html;
  },

  applyStoredPrefs: function () {
    var prefs = this.cookie.get("settings");
    if (!prefs) return;
    this.setRate(prefs.targetFPS || 60);
    this.setSpeed(prefs.speedAdjust || 1.0);
    this.setBlendShift(prefs.blendShiftEnabled !== false);
  },

  jumpScene: function (dir) {
    this.sceneIdx += dir;
    if (this.sceneIdx >= scenes.length) this.sceneIdx = 0;
    else if (this.sceneIdx < 0) this.sceneIdx = scenes.length - 1;
    $("fe_scene").selectedIndex = this.sceneIdx;
    this.switchScene($("fe_scene"));
  },

  switchScene: function (menu) {
    var name = menu.options[menu.selectedIndex].value;
    if (this.bmp) {
      this.pendingSceneIdx = menu.selectedIndex;
      this.pendingSceneName = name;
      $("scene_modal").setClass("hidden", false);
      return;
    }
    this.sceneIdx = menu.selectedIndex;
    this.currentSource = "sample";
    this.loadImage(name);
  },

  cancelSceneSwitch: function () {
    $("scene_modal").setClass("hidden", true);
    if (this.sceneIdx >= 0) $("fe_scene").selectedIndex = this.sceneIdx;
    this.pendingSceneIdx = -1;
    this.pendingSceneName = "";
  },

  confirmSceneSwitch: function () {
    if (!this.pendingSceneName) return this.cancelSceneSwitch();
    this.sceneIdx = this.pendingSceneIdx;
    this.currentSource = "sample";
    this.loadImage(this.pendingSceneName);
    this.cancelSceneSwitch();
  },

  modalExportJSON: function () {
    this.downloadCurrentJSON();
  },

  loadImage: function (name) {
    this.stop();
    this.showLoading();
    var url = "images/" + name + ".json?t=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load scene: " + name);
        return res.json();
      })
      .then(function (img) {
        img.filename = img.filename || name + ".json";
        CanvasCycle.processImage(img);
      })
      .catch(function (err) {
        CanvasCycle.hideLoading();
        $("d_debug").innerHTML = err.message;
      });
  },

  processImage: function (img) {
    this.bmp = new Bitmap(img);
    this.bmp.optimize();
    var canvas = $("mycanvas");
    if (!canvas.getContext) return;
    if (!this.ctx) this.ctx = canvas.getContext("2d");
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (
      !this.imageData ||
      this.imageData.width !== this.bmp.width ||
      this.imageData.height !== this.bmp.height
    ) {
      this.imageData = this.ctx.createImageData(
        this.bmp.width,
        this.bmp.height,
      );
    }

    this.globalBrightness = 1.0;
    this.hoverHighlightColor = -1;
    this.keyboardHighlightColor = -1;
    this.updateHighlightColor();
    this.paused = false;
    this.pausedTime = 0;
    $("btn_pause").innerHTML = "Pause";
    this.activeFilename = img.filename || "image.json";
    this.resetView();
    this.renderCyclesEditor();
    this.hideLoading();
    this.run();
  },

  run: function () {
    if (!this.inGame) {
      this.inGame = true;
      this.animate();
    }
  },

  stop: function () {
    this.inGame = false;
  },

  togglePlayback: function () {
    this.paused = !this.paused;
    if (this.paused) this.pausedTime = GetTickCount();
    $("btn_pause").innerHTML = this.paused ? "Resume" : "Pause";
  },

  toggleSelectedColor: function (idx) {
    this.selectedColor = this.selectedColor === idx ? -1 : idx;
    this.updatePaletteSelection();
  },

  updatePaletteSelection: function () {
    for (var idx = 0; idx < 256; idx++) {
      var chip = $("pal_" + idx);
      if (chip) chip.setClass("selected", idx === this.selectedColor);
    }
  },

  animate: function () {
    if (!this.inGame || !this.bmp) return;
    var colors = this.bmp.palette.colors;
    for (var idx = 0; idx < colors.length; idx++) {
      var clr = colors[idx],
        div = $("pal_" + idx);
      div.style.backgroundColor =
        "rgb(" + clr.red + "," + clr.green + "," + clr.blue + ")";
    }
    this.updatePaletteSelection();
    $("d_debug").innerHTML =
      "FPS: " +
      FrameCount.current +
      (this.highlightColor !== -1 ? " - Color #" + this.highlightColor : "");

    var renderTime = this.paused ? this.pausedTime : GetTickCount();
    this.bmp.palette.cycle(
      this.bmp.palette.baseColors,
      renderTime,
      this.settings.speedAdjust,
      this.settings.blendShiftEnabled,
    );
    if (this.highlightColor > -1)
      this.bmp.palette.colors[this.highlightColor] = new Color(255, 255, 255);
    if (this.globalBrightness < 1.0)
      this.bmp.palette.burnOut(1.0 - this.globalBrightness, 1.0);
    this.bmp.render(
      this.imageData,
      !this.paused &&
        this.lastBrightness === this.globalBrightness &&
        this.highlightColor === this.lastHighlightColor,
    );
    this.lastBrightness = this.globalBrightness;
    this.lastHighlightColor = this.highlightColor;
    var off = document.createElement("canvas");
    off.width = this.bmp.width;
    off.height = this.bmp.height;
    off.getContext("2d").putImageData(this.imageData, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.drawImage(
      off,
      this.view.offsetX,
      this.view.offsetY,
      this.bmp.width * this.view.zoom,
      this.bmp.height * this.view.zoom,
    );
    if (this.view.zoom >= 6) this.drawPixelGrid();

    TweenManager.logic(this.clock++);
    FrameCount.count();
    this.scaleAnimate();
    if (this.inGame)
      setTimeout(function () {
        CanvasCycle.animate();
      }, 1000 / this.settings.targetFPS);
  },

  renderCyclesEditor: function () {
    var container = $("cycles_editor");
    container.innerHTML = "";
    if (!this.bmp) return;
    if (this.bmp.palette.cycles.length) {
      var header = document.createElement("div");
      header.className = "cycle_header";
      header.innerHTML =
        '<div class="cycle_id">Cycle</div>' +
        '<div class="cycle_col">Direction</div>' +
        '<div class="cycle_col">Rate</div>' +
        '<div class="cycle_col">Low</div>' +
        '<div class="cycle_col">High</div>' +
        '<div class="cycle_col">Active</div>' +
        '<div class="cycle_col">Remove</div>';
      container.appendChild(header);
    }
    for (var idx = 0; idx < this.bmp.palette.cycles.length; idx++) {
      var cyc = this.bmp.palette.cycles[idx];
      var row = document.createElement("div");
      row.className = "cycle_row";
      row.innerHTML =
        '<div class="cycle_id">C' +
        (idx + 1) +
        "</div>" +
        '<label class="cycle_field"><select data-cycle="' +
        idx +
        '" data-key="reverse"><option>0</option><option>1</option><option>2</option></select></label>' +
        '<label class="cycle_field"><input type="number" data-cycle="' +
        idx +
        '" data-key="rate" value="' +
        cyc.rate +
        '"></label>' +
        '<label class="cycle_field"><input type="number" min="0" max="255" data-cycle="' +
        idx +
        '" data-key="low" value="' +
        cyc.low +
        '"></label>' +
        '<label class="cycle_field"><input type="number" min="0" max="255" data-cycle="' +
        idx +
        '" data-key="high" value="' +
        cyc.high +
        '"></label>' +
        '<label class="cycle_field cycle_active"><input type="checkbox" data-cycle="' +
        idx +
        '" data-key="active"' +
        (cyc.active === false ? "" : ' checked="checked"') +
        "></label>" +
        '<div class="button cycle_remove" data-action="remove" data-cycle="' +
        idx +
        '">-</div>';
      container.appendChild(row);
      var sel = row.querySelector("select");
      sel.value = "" + cyc.reverse;
    }
    container.onclick = function (e) {
      var t = e.target;
      if (t.getAttribute("data-action") !== "remove") return;
      var cidx = parseInt(t.getAttribute("data-cycle"), 10);
      CanvasCycle.removeCycle(cidx);
    };
    container.onchange = function (e) {
      var t = e.target;
      if (!t.getAttribute("data-cycle")) return;
      var cidx = parseInt(t.getAttribute("data-cycle"), 10);
      var key = t.getAttribute("data-key");
      var cyc = CanvasCycle.bmp.palette.cycles[cidx];
      var val =
        t.type === "checkbox" ? (t.checked ? 1 : 0) : parseInt(t.value, 10);
      if (key === "active") {
        cyc.active = !!val;
        CanvasCycle.bmp.optimize();
        CanvasCycle.syncUploadedImageData();
        return;
      }
      if (key === "low" || key === "high" || key === "reverse") {
        if (isNaN(val)) val = 0;
        if (key !== "reverse") val = Math.max(0, Math.min(255, val));
        if (key === "reverse") val = Math.max(0, Math.min(2, val));
        t.value = "" + val;
      }
      cyc[key] = isNaN(val) ? 0 : val;
      CanvasCycle.bmp.optimize();
      CanvasCycle.syncUploadedImageData();
    };
  },

  addCycle: function () {
    if (!this.bmp) return;
    this.bmp.palette.cycles.push(new Cycle(280, 0, 0, 0, true));
    this.bmp.palette.numCycles = this.bmp.palette.cycles.length;
    this.bmp.optimize();
    this.renderCyclesEditor();
    this.syncUploadedImageData();
  },

  removeCycle: function (cycleIdx) {
    if (!this.bmp || !this.bmp.palette.cycles.length) return;
    if (
      isNaN(cycleIdx) ||
      cycleIdx < 0 ||
      cycleIdx >= this.bmp.palette.cycles.length
    )
      return;
    this.bmp.palette.cycles.splice(cycleIdx, 1);
    this.bmp.palette.numCycles = this.bmp.palette.cycles.length;
    this.bmp.optimize();
    this.renderCyclesEditor();
    this.syncUploadedImageData();
  },

  syncUploadedImageData: function () {
    if (
      !this.uploadedImageData ||
      !this.bmp
    )
      return;
    this.uploadedImageData.cycles = this.bmp.palette.cycles.map(function (c) {
      return {
        low: c.low,
        high: c.high,
        rate: c.rate,
        reverse: c.reverse,
        active: c.active !== false,
      };
    });
  },

  reorderPalette: function (fromIdx, toIdx) {
    if (!this.bmp || fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx))
      return;
    var base = this.bmp.palette.baseColors;
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= base.length ||
      toIdx >= base.length
    )
      return;

    var moved = base.splice(fromIdx, 1)[0];
    base.splice(toIdx, 0, moved);
    var oldOrder = [];
    for (var i = 0; i < base.length; i++) oldOrder[i] = i;
    var movedIdx = oldOrder.splice(fromIdx, 1)[0];
    oldOrder.splice(toIdx, 0, movedIdx);
    var remap = [];
    for (var n = 0; n < oldOrder.length; n++) remap[oldOrder[n]] = n;
    for (var p = 0; p < this.bmp.pixels.length; p++)
      this.bmp.pixels[p] = remap[this.bmp.pixels[p]];
    this.bmp.optimize();
  },

  handleJSONUpload: function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var img = JSON.parse(reader.result);
        img.filename = file.name;
        CanvasCycle.uploadedImageData = img;
        CanvasCycle.processImage(img);
      } catch (err) {
        $("d_debug").innerHTML = "Invalid JSON upload";
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  },

  handlePNGUpload: function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var png = UPNG.decode(reader.result);
        if (png.ctype !== 3 || !png.tabs || !png.tabs.PLTE)
          throw new Error("PNG must be indexed with PLTE palette");
        var colors = [];
        for (var i = 0; i < png.tabs.PLTE.length; i += 3)
          colors.push([
            png.tabs.PLTE[i],
            png.tabs.PLTE[i + 1],
            png.tabs.PLTE[i + 2],
          ]);
        var pixels = [];
        var stride = Math.ceil(png.width / 4) * 4;
        for (var y = 0; y < png.height; y++) {
          var rowStart = y * stride;
          for (var x = 0; x < png.width; x++)
            pixels.push(png.data[rowStart + x]);
        }
        var img = {
          filename: file.name.replace(/\.png$/i, ".json"),
          width: png.width,
          height: png.height,
          pixels: pixels,
          colors: colors,
          cycles: [],
        };
        CanvasCycle.uploadedImageData = img;
        CanvasCycle.processImage(img);
      } catch (err) {
        $("d_debug").innerHTML = err.message;
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  },

  buildDownloadPayload: function () {
    if (!this.bmp) return null;
    return {
      filename: this.activeFilename || "image.json",
      width: this.bmp.width,
      height: this.bmp.height,
      pixels: this.bmp.pixels,
      colors: this.bmp.palette.baseColors.map(function (c) {
        return [c.red, c.green, c.blue];
      }),
      cycles: this.bmp.palette.cycles.map(function (c) {
        return {
          low: c.low,
          high: c.high,
          rate: c.rate,
          reverse: c.reverse,
          active: c.active !== false,
        };
      }),
    };
  },

  downloadBlob: function (content, type, filename) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  buildEmbedScript: function (payload) {
    var runtime =
      "function m(v,n,x){var z=Number(v);return Number.isNaN(z)?n:Math.max(n,Math.min(x,z))}function n(i){return{filename:i.filename||'untitled.json',width:i.width,height:i.height,pixels:i.pixels instanceof Uint8Array?i.pixels:Uint8Array.from(i.pixels||[]),colors:(i.colors||[]).map(function(c){return[c[0],c[1],c[2]]}),cycles:(i.cycles||[]).map(function(c){return{low:m(c.low,0,255),high:m(c.high,0,255),rate:Number(c.rate)||0,reverse:m(c.reverse,0,2),active:c.active!==false}})}}function g(b,y,t){var o=b.map(function(c){return[c[0],c[1],c[2]]});for(var i=0;i<y.length;i++){var c=y[i];if(!c||c.active===false||!c.rate)continue;var l=Math.max(0,c.low|0),h=Math.min(255,c.high|0);if(h<=l)continue;var s=h-l+1,a=Math.floor((t/(1000/(c.rate/280)))%s),r=c.reverse===2?(s-a)%s:a;if(!r)continue;var q=o.slice(l,h+1);for(var j=0;j<s;j++)o[l+((j+r)%s)]=q[j]}return o}function P(cv){this.canvas=cv;this.ctx=cv.getContext('2d');this.imageData=null;this.data=null;this.paused=false;this.raf=0;this.lastDraw=0;this.targetFps=60;this.loop=this.loop.bind(this)}P.prototype.loadFromData=function(d){this.data=n(d);this.canvas.width=this.data.width;this.canvas.height=this.data.height;this.imageData=this.ctx.createImageData(this.data.width,this.data.height);this.lastDraw=performance.now();if(!this.raf)this.raf=requestAnimationFrame(this.loop)};P.prototype.loop=function(now){if(this.data&&!this.paused){var min=1000/this.targetFps;if(now-this.lastDraw>=min){this.render(now);this.lastDraw=now}}this.raf=requestAnimationFrame(this.loop)};P.prototype.render=function(now){var colors=g(this.data.colors,this.data.cycles,now),src=this.data.pixels,dst=this.imageData.data;for(var i=0;i<src.length;i++){var c=colors[src[i]]||[0,0,0],di=i*4;dst[di]=c[0];dst[di+1]=c[1];dst[di+2]=c[2];dst[di+3]=255}this.ctx.putImageData(this.imageData,0,0)};";
    return (
      '(function(){"use strict";' +
      runtime +
      "var data=" +
      JSON.stringify(payload) +
      ';var script=document.currentScript;var canvas=document.createElement("canvas");canvas.width=data.width;canvas.height=data.height;canvas.style.display="inline-block";canvas.style.imageRendering="pixelated";canvas.setAttribute("aria-label",(data.filename||"CanvasCycle animation")+" animation");if(script&&script.parentNode){script.parentNode.insertBefore(canvas,script);script.parentNode.removeChild(script)}else{document.body.appendChild(canvas)}new P(canvas).loadFromData(data)})();'
    );
  },

  downloadCurrentJSON: function () {
    var payload = this.buildDownloadPayload();
    if (!payload) return;
    this.downloadBlob(
      JSON.stringify(payload),
      "application/json",
      payload.filename || "canvascycle-export.json",
    );
    this.uploadedImageData = payload;
  },

  downloadCurrentEmbed: function () {
    var payload = this.buildDownloadPayload();
    if (!payload) return;
    var script = this.buildEmbedScript(payload);
    var base = (payload.filename || "canvascycle-export.json").replace(
      /\.json$/i,
      "",
    );
    this.downloadBlob(script, "text/javascript", base + ".embed.js");
    this.uploadedImageData = payload;
  },

  showLoading: function () {
    var loading = $("d_loading");
    loading.style.left =
      "" +
      Math.floor((this.contentSize.width * this.contentSize.scale) / 2 - 16) +
      "px";
    loading.style.top =
      "" +
      Math.floor((this.contentSize.height * this.contentSize.scale) / 2 - 16) +
      "px";
    loading.show();
  },
  hideLoading: function () {
    $("d_loading").hide();
  },

  scaleAnimate: function () {
    // zoom is intentionally fixed at actual size
    return;
  },

  repositionContainer: function () {
    var div = $("container");
    if (!div) return;
    var optionsGap = this.contentSize.optionsWidth ? 15 : 0;
    var contentWidth =
      this.contentSize.width + this.contentSize.optionsWidth + optionsGap;
    div.style.width = "" + contentWidth + "px";
  },

  handleResize: function () {
    // this.repositionContainer();
  },

  saveSettings: function () {
    this.cookie.set("settings", this.settings);
    this.cookie.save();
  },

  setRate: function (rate) {
    this.settings.targetFPS = rate;
    this.saveSettings();
  },
  setSpeed: function (speed) {
    $("btn_speed_025").setClass("selected", speed === 0.25);
    $("btn_speed_05").setClass("selected", speed === 0.5);
    $("btn_speed_1").setClass("selected", speed === 1);
    $("btn_speed_2").setClass("selected", speed === 2);
    $("btn_speed_4").setClass("selected", speed === 4);
    this.settings.speedAdjust = speed;
    this.saveSettings();
  },
  setBlendShift: function (enabled) {
    $("chk_blend").checked = !!enabled;
    this.settings.blendShiftEnabled = enabled;
    this.saveSettings();
  },

  setTool: function (tool) {
    this.activeTool = tool;
    ["zoom", "pencil", "eyedropper", "move"].forEach(function (name) {
      $("tool_" + name).setClass("active", name === tool);
    });
    this.updateCanvasCursor();
  },

  updateCanvasCursor: function (minus) {
    var canvas = $("mycanvas");
    if (this.activeTool === "pencil") canvas.style.cursor = "crosshair";
    else if (this.activeTool === "eyedropper") canvas.style.cursor = "copy";
    else if (this.activeTool === "move")
      canvas.style.cursor = this.dragging ? "grabbing" : "grab";
    else canvas.style.cursor = minus ? "zoom-out" : "zoom-in";
  },

  canvasToImagePixel: function (e) {
    if (!this.bmp) return null;
    var rect = $("mycanvas").getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left - this.view.offsetX) / this.view.zoom);
    var y = Math.floor((e.clientY - rect.top - this.view.offsetY) / this.view.zoom);
    if (x < 0 || y < 0 || x >= this.bmp.width || y >= this.bmp.height) return null;
    return { x: x, y: y };
  },

  onCanvasClick: function (e) {
    var pixel = this.canvasToImagePixel(e);
    if (!pixel) return;
    if (this.activeTool === "zoom") this.applyZoomClick(e, pixel);
    else if (this.activeTool === "pencil") this.paintPixel(pixel.x, pixel.y);
    else if (this.activeTool === "eyedropper") this.pickPixelColor(pixel.x, pixel.y);
  },

  onCanvasMouseDown: function (e) {
    if (this.activeTool !== "move") return;
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartOffsetX = this.view.offsetX;
    this.dragStartOffsetY = this.view.offsetY;
    this.updateCanvasCursor();
  },

  onCanvasMouseMove: function (e) {
    this.updateCanvasCursor(e.altKey);
    if (!this.dragging || this.activeTool !== "move") return;
    this.view.offsetX = this.dragStartOffsetX + (e.clientX - this.dragStartX);
    this.view.offsetY = this.dragStartOffsetY + (e.clientY - this.dragStartY);
  },

  applyZoomClick: function (e, pixel) {
    var oldZoom = this.view.zoom;
    var nextZoom = oldZoom;
    if (e.altKey) {
      if (oldZoom > 1) nextZoom = Math.max(1, oldZoom - 1);
      else nextZoom = Math.max(0.25, oldZoom - 0.25);
    } else nextZoom = Math.min(10, oldZoom + 1);
    var sx = pixel.x * oldZoom + this.view.offsetX;
    var sy = pixel.y * oldZoom + this.view.offsetY;
    this.view.zoom = nextZoom;
    this.view.offsetX = sx - pixel.x * nextZoom;
    this.view.offsetY = sy - pixel.y * nextZoom;
  },

  paintPixel: function (x, y) {
    var idx = this.findOrCreateColorIndex(this.currentPaintColor);
    if (idx < 0) return;
    this.bmp.pixels[y * this.bmp.width + x] = idx;
    this.bmp.optimize();
  },

  pickPixelColor: function (x, y) {
    var idx = this.bmp.pixels[y * this.bmp.width + x];
    var c = this.bmp.palette.baseColors[idx];
    if (!c) return;
    this.currentPaintColor = [c.red, c.green, c.blue];
    this.updateColorChip();
  },

  findOrCreateColorIndex: function (rgb) {
    var base = this.bmp.palette.baseColors;
    for (var i = 0; i < base.length; i++) {
      if (base[i].red === rgb[0] && base[i].green === rgb[1] && base[i].blue === rgb[2]) return i;
    }
    if (base.length >= 256) return -1;
    base.push(new Color(rgb[0], rgb[1], rgb[2]));
    return base.length - 1;
  },

  resetView: function () {
    var canvas = $("mycanvas");
    this.view.zoom = 1;
    if (!this.bmp) return;
    this.view.offsetX = Math.floor((canvas.width - this.bmp.width) / 2);
    this.view.offsetY = Math.floor((canvas.height - this.bmp.height) / 2);
  },

  drawPixelGrid: function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (var x = 0; x <= this.bmp.width; x++) {
      var px = this.view.offsetX + x * this.view.zoom + 0.5;
      ctx.beginPath(); ctx.moveTo(px, this.view.offsetY); ctx.lineTo(px, this.view.offsetY + this.bmp.height * this.view.zoom); ctx.stroke();
    }
    for (var y = 0; y <= this.bmp.height; y++) {
      var py = this.view.offsetY + y * this.view.zoom + 0.5;
      ctx.beginPath(); ctx.moveTo(this.view.offsetX, py); ctx.lineTo(this.view.offsetX + this.bmp.width * this.view.zoom, py); ctx.stroke();
    }
    ctx.restore();
  },

  updateColorChip: function () {
    var chip = $("tool_color_chip");
    chip.style.backgroundColor =
      "rgb(" + this.currentPaintColor[0] + "," + this.currentPaintColor[1] + "," + this.currentPaintColor[2] + ")";
  },
};

var CC = CanvasCycle;
