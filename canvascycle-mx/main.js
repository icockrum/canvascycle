FrameCount.visible = false;

var CanvasCycle = {
	cookie: new CookieTree(),
	ctx: null,
	imageData: null,
	clock: 0,
	inGame: false,
	bmp: null,
	inited: false,
	optTween: null,
	winSize: null,
	globalBrightness: 1.0,
	lastBrightness: 0,
	sceneIdx: -1,
	highlightColor: -1,
	paused: false,
	uploadedImageData: null,
	currentSource: 'sample',

	settings: {
		showOptions: false,
		targetFPS: 60,
		zoomFull: false,
		blendShiftEnabled: true,
		speedAdjust: 1.0
	},

	contentSize: {
		width: 640,
		optionsWidth: 0,
		height: 480 + 40,
		scale: 1.0
	},

	init: function() {
		if (this.inited) return;
		this.inited = true;
		$('container').style.display = 'block';
		$('d_options').style.display = 'none';
		FrameCount.init();
		this.handleResize();
		this.buildPalette();
		this.bindUploadControls();
		this.populateScenes(0);
		this.applyStoredPrefs();
		this.loadImage(scenes[0].name);
		this.sceneIdx = 0;
	},

	buildPalette: function() {
		var pal = $('palette_display');
		for (var idx = 0; idx < 256; idx++) {
			var div = document.createElement('div');
			div._idx = idx;
			div.id = 'pal_' + idx;
			div.className = 'palette_color';
			div.draggable = true;
			div.onmouseover = function() { CanvasCycle.highlightColor = this._idx; };
			div.onmouseout = function() { CanvasCycle.highlightColor = -1; };
			div.ondragstart = function(e) { e.dataTransfer.setData('text/plain', '' + this._idx); };
			div.ondragover = function(e) { e.preventDefault(); };
			div.ondrop = function(e) {
				e.preventDefault();
				var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
				var to = this._idx;
				CanvasCycle.reorderPalette(from, to);
			};
			pal.appendChild(div);
		}
		var clear = document.createElement('div');
		clear.className = 'clear';
		pal.appendChild(clear);
	},

	bindUploadControls: function() {
		$('fe_upload_png').addEventListener('change', function(e) { CanvasCycle.handlePNGUpload(e); });
		$('fe_upload_json').addEventListener('change', function(e) { CanvasCycle.handleJSONUpload(e); });
	},

	populateScenes: function(initialSceneIdx) {
		var html = '<select id="fe_scene" onChange="CanvasCycle.switchScene(this)">';
		for (var i = 0; i < scenes.length; i++) {
			html += '<option value="' + scenes[i].name + '"' + ((i === initialSceneIdx) ? ' selected="selected"' : '') + '>' + scenes[i].title + '</option>';
		}
		html += '</select>';
		$('d_scene_selector').innerHTML = html;
	},

	applyStoredPrefs: function() {
		var prefs = this.cookie.get('settings');
		if (!prefs) return;
		if (prefs.showOptions) this.toggleOptions();
		this.setRate(prefs.targetFPS || 60);
		this.setZoom(!!prefs.zoomFull);
		this.setSpeed(prefs.speedAdjust || 1.0);
		this.setBlendShift((prefs.blendShiftEnabled !== false));
	},

	jumpScene: function(dir) {
		this.sceneIdx += dir;
		if (this.sceneIdx >= scenes.length) this.sceneIdx = 0;
		else if (this.sceneIdx < 0) this.sceneIdx = scenes.length - 1;
		$('fe_scene').selectedIndex = this.sceneIdx;
		this.switchScene($('fe_scene'));
	},

	switchScene: function(menu) {
		var name = menu.options[menu.selectedIndex].value;
		this.sceneIdx = menu.selectedIndex;
		this.currentSource = 'sample';
		this.loadImage(name);
	},

	loadImage: function(name) {
		this.stop();
		this.showLoading();
		var url = 'images/' + name + '.json?t=' + Date.now();
		fetch(url, { cache: 'no-store' })
			.then(function(res) {
				if (!res.ok) throw new Error('Failed to load scene: ' + name);
				return res.json();
			})
			.then(function(img) {
				img.filename = img.filename || (name + '.json');
				CanvasCycle.processImage(img);
			})
			.catch(function(err) {
				CanvasCycle.hideLoading();
				$('d_debug').innerHTML = err.message;
			});
	},

	processImage: function(img) {
		this.bmp = new Bitmap(img);
		this.bmp.optimize();
		var canvas = $('mycanvas');
		if (!canvas.getContext) return;
		if (!this.ctx) this.ctx = canvas.getContext('2d');
		this.ctx.clearRect(0, 0, this.bmp.width, this.bmp.height);
		this.ctx.fillStyle = 'rgb(0,0,0)';
		this.ctx.fillRect(0, 0, this.bmp.width, this.bmp.height);

		if (!this.imageData || this.imageData.width !== this.bmp.width || this.imageData.height !== this.bmp.height) {
			this.imageData = this.ctx.createImageData(this.bmp.width, this.bmp.height);
		}

		this.globalBrightness = 1.0;
		this.paused = false;
		$('btn_pause').innerHTML = 'Pause';
		this.renderCyclesEditor();
		this.hideLoading();
		this.run();
	},

	run: function() {
		if (!this.inGame) {
			this.inGame = true;
			this.animate();
		}
	},

	stop: function() { this.inGame = false; },

	togglePlayback: function() {
		this.paused = !this.paused;
		$('btn_pause').innerHTML = this.paused ? 'Resume' : 'Pause';
	},

	animate: function() {
		if (!this.inGame || !this.bmp) return;
		var colors = this.bmp.palette.colors;
		if (this.settings.showOptions) {
			for (var idx = 0; idx < colors.length; idx++) {
				var clr = colors[idx], div = $('pal_' + idx);
				div.style.backgroundColor = 'rgb(' + clr.red + ',' + clr.green + ',' + clr.blue + ')';
			}
			$('d_debug').innerHTML = 'FPS: ' + FrameCount.current + ((this.highlightColor !== -1) ? (' - Color #' + this.highlightColor) : '');
		}

		if (!this.paused) {
			this.bmp.palette.cycle(this.bmp.palette.baseColors, GetTickCount(), this.settings.speedAdjust, this.settings.blendShiftEnabled);
			if (this.highlightColor > -1) this.bmp.palette.colors[this.highlightColor] = new Color(255, 255, 255);
			if (this.globalBrightness < 1.0) this.bmp.palette.burnOut(1.0 - this.globalBrightness, 1.0);
			this.bmp.render(this.imageData, (this.lastBrightness === this.globalBrightness) && (this.highlightColor === this.lastHighlightColor));
			this.lastBrightness = this.globalBrightness;
			this.lastHighlightColor = this.highlightColor;
			this.ctx.putImageData(this.imageData, 0, 0);
		}

		TweenManager.logic(this.clock++);
		FrameCount.count();
		this.scaleAnimate();
		if (this.inGame) setTimeout(function() { CanvasCycle.animate(); }, 1000 / this.settings.targetFPS);
	},

	renderCyclesEditor: function() {
		var container = $('cycles_editor');
		container.innerHTML = '';
		if (!this.bmp) return;
		for (var idx = 0; idx < this.bmp.palette.cycles.length; idx++) {
			var cyc = this.bmp.palette.cycles[idx];
			var row = document.createElement('div');
			row.className = 'cycle_row';
			row.innerHTML = 'C' + (idx + 1)
				+ ' <label>reverse <select data-cycle="' + idx + '" data-key="reverse"><option>0</option><option>1</option><option>2</option></select></label>'
				+ ' <label>rate <input type="number" data-cycle="' + idx + '" data-key="rate" value="' + cyc.rate + '"></label>'
				+ ' <label>low <input type="number" min="0" max="255" data-cycle="' + idx + '" data-key="low" value="' + cyc.low + '"></label>'
				+ ' <label>high <input type="number" min="0" max="255" data-cycle="' + idx + '" data-key="high" value="' + cyc.high + '"></label>';
			container.appendChild(row);
			var sel = row.querySelector('select');
			sel.value = '' + cyc.reverse;
		}
		container.onchange = function(e) {
			var t = e.target;
			if (!t.getAttribute('data-cycle')) return;
			var cidx = parseInt(t.getAttribute('data-cycle'), 10);
			var key = t.getAttribute('data-key');
			var cyc = CanvasCycle.bmp.palette.cycles[cidx];
			var val = parseInt(t.value, 10);
			if (key === 'low' || key === 'high' || key === 'reverse') {
				if (isNaN(val)) val = 0;
				if (key !== 'reverse') val = Math.max(0, Math.min(255, val));
				if (key === 'reverse') val = Math.max(0, Math.min(2, val));
				t.value = '' + val;
			}
			cyc[key] = isNaN(val) ? 0 : val;
			CanvasCycle.bmp.optimize();
		};
	},

	reorderPalette: function(fromIdx, toIdx) {
		if (!this.bmp || fromIdx === toIdx || isNaN(fromIdx) || isNaN(toIdx)) return;
		var base = this.bmp.palette.baseColors;
		if (fromIdx < 0 || toIdx < 0 || fromIdx >= base.length || toIdx >= base.length) return;

		var moved = base.splice(fromIdx, 1)[0];
		base.splice(toIdx, 0, moved);
		var oldOrder = [];
		for (var i = 0; i < base.length; i++) oldOrder[i] = i;
		var movedIdx = oldOrder.splice(fromIdx, 1)[0];
		oldOrder.splice(toIdx, 0, movedIdx);
		var remap = [];
		for (var n = 0; n < oldOrder.length; n++) remap[oldOrder[n]] = n;
		for (var p = 0; p < this.bmp.pixels.length; p++) this.bmp.pixels[p] = remap[this.bmp.pixels[p]];
		this.bmp.optimize();
	},

	handleJSONUpload: function(e) {
		var file = e.target.files[0];
		if (!file) return;
		var reader = new FileReader();
		reader.onload = function() {
			try {
				var img = JSON.parse(reader.result);
				img.filename = file.name;
				CanvasCycle.uploadedImageData = img;
				CanvasCycle.currentSource = 'uploaded';
				CanvasCycle.processImage(img);
				$('btn_resume_uploaded').setClass('disabled', false);
			} catch (err) { $('d_debug').innerHTML = 'Invalid JSON upload'; }
		};
		reader.readAsText(file);
		e.target.value = '';
	},

	handlePNGUpload: function(e) {
		var file = e.target.files[0];
		if (!file) return;
		var reader = new FileReader();
		reader.onload = function() {
			try {
				var png = UPNG.decode(reader.result);
				if (png.ctype !== 3 || !png.tabs || !png.tabs.PLTE) throw new Error('PNG must be indexed with PLTE palette');
				var colors = [];
				for (var i = 0; i < png.tabs.PLTE.length; i += 3) colors.push([png.tabs.PLTE[i], png.tabs.PLTE[i + 1], png.tabs.PLTE[i + 2]]);
				var pixels = [];
				var stride = Math.ceil(png.width / 4) * 4;
				for (var y = 0; y < png.height; y++) {
					var rowStart = y * stride;
					for (var x = 0; x < png.width; x++) pixels.push(png.data[rowStart + x]);
				}
				var img = { filename: file.name.replace(/\.png$/i, '.json'), width: png.width, height: png.height, pixels: pixels, colors: colors, cycles: [] };
				CanvasCycle.uploadedImageData = img;
				CanvasCycle.currentSource = 'uploaded';
				CanvasCycle.processImage(img);
				$('btn_resume_uploaded').setClass('disabled', false);
			} catch (err) { $('d_debug').innerHTML = err.message; }
		};
		reader.readAsArrayBuffer(file);
		e.target.value = '';
	},

	resumeUploadedImage: function() {
		if (!this.uploadedImageData) return;
		this.currentSource = 'uploaded';
		this.processImage(JSON.parse(JSON.stringify(this.uploadedImageData)));
	},

	downloadCurrentJSON: function() {
		if (!this.bmp) return;
		var payload = {
			filename: (this.currentSource === 'uploaded' ? (this.uploadedImageData && this.uploadedImageData.filename) : (scenes[this.sceneIdx] ? scenes[this.sceneIdx].name + '.json' : 'image.json')),
			width: this.bmp.width,
			height: this.bmp.height,
			pixels: this.bmp.pixels,
			colors: this.bmp.palette.baseColors.map(function(c) { return [c.red, c.green, c.blue]; }),
			cycles: this.bmp.palette.cycles.map(function(c) { return { low: c.low, high: c.high, rate: c.rate, reverse: c.reverse }; })
		};
		var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = payload.filename || 'canvascycle-export.json';
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		if (this.currentSource === 'uploaded') this.uploadedImageData = payload;
	},

	showLoading: function() {
		var loading = $('d_loading');
		loading.style.left = '' + Math.floor(((this.contentSize.width * this.contentSize.scale) / 2) - 16) + 'px';
		loading.style.top = '' + Math.floor(((this.contentSize.height * this.contentSize.scale) / 2) - 16) + 'px';
		loading.show();
	},
	hideLoading: function() { $('d_loading').hide(); },

	scaleAnimate: function() {
		if (this.settings.zoomFull) {
			var maxScaleX = (this.winSize.width - 30) / (this.contentSize.width + this.contentSize.optionsWidth);
			var maxScaleY = (this.winSize.height - 30) / this.contentSize.height;
			var maxScale = Math.min(maxScaleX, maxScaleY);
			if (this.contentSize.scale !== maxScale) {
				this.contentSize.scale += ((maxScale - this.contentSize.scale) / 8);
				if (Math.abs(this.contentSize.scale - maxScale) < 0.001) this.contentSize.scale = maxScale;
				this.applyScale();
			}
		}
		else if (this.contentSize.scale > 1.0) {
			this.contentSize.scale += ((1.0 - this.contentSize.scale) / 8);
			if (this.contentSize.scale < 1.001) this.contentSize.scale = 1.0;
			this.applyScale();
		}
	},

	applyScale: function() {
		var sty = $('mycanvas').style;
		if (ua.webkit) sty.webkitTransform = 'translate3d(0px, 0px, 0px) scale(' + this.contentSize.scale + ')';
		else if (ua.ff) sty.MozTransform = 'scale(' + this.contentSize.scale + ')';
		else if (ua.op) sty.OTransform = 'scale(' + this.contentSize.scale + ')';
		else sty.transform = 'scale(' + this.contentSize.scale + ')';
		sty.marginRight = '' + Math.floor((this.contentSize.width * this.contentSize.scale) - this.contentSize.width) + 'px';
		$('d_header').style.width = '' + Math.floor(this.contentSize.width * this.contentSize.scale) + 'px';
		this.repositionContainer();
	},

	repositionContainer: function() {
		var div = $('container');
		if (!div) return;
		this.winSize = getInnerWindowSize();
		div.style.left = '' + Math.floor((this.winSize.width / 2) - (((this.contentSize.width * this.contentSize.scale) + this.contentSize.optionsWidth) / 2)) + 'px';
		div.style.top = '' + Math.floor((this.winSize.height / 2) - ((this.contentSize.height * this.contentSize.scale) / 2)) + 'px';
	},

	handleResize: function() {
		this.repositionContainer();
		if (this.settings.zoomFull) this.scaleAnimate();
	},

	saveSettings: function() { this.cookie.set('settings', this.settings); this.cookie.save(); },

	toggleOptions: function() {
		var startValue, endValue;
		TweenManager.removeAll({ category: 'options' });
		if (!this.settings.showOptions) {
			startValue = this.optTween ? this.optTween.target.value : 0;
			endValue = 1.0;
			$('d_options').style.display = '';
			$('d_options').style.opacity = startValue;
			$('btn_options_toggle').innerHTML = '&#x00AB; Hide Options';
		} else {
			startValue = this.optTween ? this.optTween.target.value : 1.0;
			endValue = 0;
			$('btn_options_toggle').innerHTML = 'Show Options &#x00BB;';
		}
		this.optTween = TweenManager.tween({
			target: { value: startValue }, duration: Math.floor(this.settings.targetFPS / 3), mode: 'EaseOut', algo: 'Quadratic', props: { value: endValue },
			onTweenUpdate: function(tween) {
				$('d_options').style.opacity = tween.target.value;
				$('btn_options_toggle').style.left = '' + Math.floor(tween.target.value * 128) + 'px';
				CanvasCycle.contentSize.optionsWidth = Math.floor(tween.target.value * 150);
				CanvasCycle.handleResize();
			},
			onTweenComplete: function(tween) { if (tween.target.value === 0) $('d_options').style.display = 'none'; CanvasCycle.optTween = null; },
			category: 'options'
		});
		this.settings.showOptions = !this.settings.showOptions;
		this.saveSettings();
	},

	setZoom: function(enabled) {
		if (enabled !== this.settings.zoomFull) {
			this.settings.zoomFull = enabled; this.saveSettings();
			$('btn_zoom_actual').setClass('selected', !enabled);
			$('btn_zoom_max').setClass('selected', enabled);
		}
	},
	setRate: function(rate) { this.settings.targetFPS = rate; this.saveSettings(); },
	setSpeed: function(speed) {
		$('btn_speed_025').setClass('selected', speed === 0.25);
		$('btn_speed_05').setClass('selected', speed === 0.5);
		$('btn_speed_1').setClass('selected', speed === 1);
		$('btn_speed_2').setClass('selected', speed === 2);
		$('btn_speed_4').setClass('selected', speed === 4);
		this.settings.speedAdjust = speed; this.saveSettings();
	},
	setBlendShift: function(enabled) {
		$('btn_blendshift_on').setClass('selected', enabled);
		$('btn_blendshift_off').setClass('selected', !enabled);
		this.settings.blendShiftEnabled = enabled; this.saveSettings();
	}
};

var CC = CanvasCycle;
