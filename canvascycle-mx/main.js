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
	eyedropperHoverColor: -1,
	keyboardHighlightColor: -1,
	highlightAffectsCanvas: true,
	selectedColor: -1,
	paused: false,
	pausedTime: 0,
	uploadedImageData: null,
	sourceImageData: null,
	currentSource: "sample",
	hasUnsavedEdits: false,
	activeFilename: "",
	pendingSceneIdx: -1,
	pendingSceneName: "",
	view: { zoom: 1, minZoom: 0.25, maxZoom: 10, offsetX: 0, offsetY: 0 },
	activeTool: null,
	dragging: false,
	dragStartX: 0,
	dragStartY: 0,
	dragStartOffsetX: 0,
	dragStartOffsetY: 0,
	currentPaintColor: [0, 0, 0],
	isPointerDown: false,
	renderDirty: false,
	paletteDrag: null,
	colorPopupOpen: false,
	sortPopupOpen: false,
	popupPlacementPadding: 8,
	spaceKeyDown: false,
	metaKeyDown: false,
	altKeyDown: false,
	temporaryToolActive: false,
	temporaryToolPrevious: null,
	forceZoomOutCursor: false,
	cycleTimeOffset: 0,
	pendingPaletteSortMode: "",
	paletteEditColorIdx: -1,
	paletteColorInputEl: null,
	lastPaletteClickIdx: -1,
	lastPaletteClickAt: 0,
	undoBuffer: [],
	maxUndoCount: 100,
	paletteEditOriginalColor: null,


	settings: {
		showOptions: true,
		targetFPS: 60,
		blendShiftEnabled: true,
		speedAdjust: 1.0,
		gridOverlay: true,
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
		this.bindPaletteDragging();
		this.positionPalettes();
		this.bindColorChipPopup();
		this.bindPaletteSortPopup();
		this.populateScenes(0);
		this.applyStoredPrefs();
		this.setGridOverlay(this.settings.gridOverlay);
		this.setTool(null);
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
				var now = Date.now();
				var isDoubleClick =
					CanvasCycle.lastPaletteClickIdx === this._idx &&
					now - CanvasCycle.lastPaletteClickAt <= 350;
				CanvasCycle.lastPaletteClickIdx = this._idx;
				CanvasCycle.lastPaletteClickAt = now;
				if (isDoubleClick) {
					CanvasCycle.openPaletteColorPicker(this._idx);
					return;
				}
				if (CanvasCycle.activeTool === "eyedropper" && CanvasCycle.bmp) {
					var c = CanvasCycle.bmp.palette.baseColors[this._idx];
					if (c) {
						CanvasCycle.currentPaintColor = [c.red, c.green, c.blue];
						CanvasCycle.updateColorChip();
					}
					return;
				}
				CanvasCycle.toggleSelectedColor(this._idx);
			};
			div.ondblclick = function (e) {
				e.preventDefault();
				e.stopPropagation();
				CanvasCycle.openPaletteColorPicker(this._idx, this);
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
		this.bindPaletteColorPicker();
	},

	bindPaletteColorPicker: function () {
		if (this.paletteColorInputEl) return;
		var picker = document.createElement("input");
		picker.type = "color";
		picker.tabIndex = -1;
		picker.setAttribute("aria-hidden", "true");
		picker.style.position = "fixed";
		picker.style.left = "0px";
		picker.style.top = "0px";
		picker.style.width = "32px";
		picker.style.height = "32px";
		picker.style.opacity = "0";
		picker.style.pointerEvents = "none";
		picker.style.zIndex = "9999";
		picker.style.display = "none";
		picker.addEventListener("input", function () {
			CanvasCycle.applyPaletteColorPickerValue(this.value);
		});
		picker.addEventListener("change", function () {
			CanvasCycle.hidePaletteColorPicker();
		});
		picker.addEventListener("blur", function () {
			CanvasCycle.hidePaletteColorPicker();
		});
		document.body.appendChild(picker);
		this.paletteColorInputEl = picker;
	},

	hidePaletteColorPicker: function () {
		if (!this.paletteColorInputEl) return;
		this.paletteColorInputEl.style.display = "none";
		this.paletteColorInputEl.style.opacity = "0";
		this.paletteColorInputEl.style.pointerEvents = "none";
		this.paletteEditOriginalColor = null;
	},

	openPaletteColorPicker: function (idx, anchorEl) {
		if (!this.bmp || !this.paletteColorInputEl) return;
		if (idx < 0 || idx >= this.bmp.palette.baseColors.length) return;
		var c = this.bmp.palette.baseColors[idx];
		this.paletteEditColorIdx = idx;
		this.paletteEditOriginalColor = [c.red, c.green, c.blue];
		this.selectColor(idx);
		this.paletteColorInputEl.value = this.rgbToHex(c.red, c.green, c.blue);
		if (anchorEl && anchorEl.getBoundingClientRect) {
			var r = anchorEl.getBoundingClientRect();
			this.paletteColorInputEl.style.left = Math.max(0, Math.round(r.left)) + "px";
			this.paletteColorInputEl.style.top = Math.max(0, Math.round(r.top)) + "px";
		}
		this.paletteColorInputEl.style.display = "block";
		this.paletteColorInputEl.style.opacity = "1";
		this.paletteColorInputEl.style.pointerEvents = "auto";
		this.paletteColorInputEl.focus();
		this.paletteColorInputEl.click();
	},

	applyPaletteColorPickerValue: function (hex) {
		if (!this.bmp) return;
		var idx = this.paletteEditColorIdx;
		if (idx < 0 || idx >= this.bmp.palette.baseColors.length) return;
		var rgb = this.hexToRgb(hex);
		if (!rgb) return;
		var color = this.bmp.palette.baseColors[idx];
		if (
			color.red === rgb[0] &&
			color.green === rgb[1] &&
			color.blue === rgb[2]
		)
			return;

		this.pushUndoAction({
			type: "palette-color",
			label: "Undo palette color",
			olddata: {
				index: idx,
				color: this.paletteEditOriginalColor
					? this.paletteEditOriginalColor.slice(0)
					: [color.red, color.green, color.blue],
			},
			newdata: { index: idx, color: [rgb[0], rgb[1], rgb[2]] },
			mergeKey: "palette-color-" + idx,
		});

		color.red = rgb[0];
		color.green = rgb[1];
		color.blue = rgb[2];
		this.renderDirty = true;
		this.markImageEdited();
		this.syncUploadedImageData();
		this.updateColorChip();
	},

	rgbToHex: function (r, g, b) {
		var n = (1 << 24) + (r << 16) + (g << 8) + b;
		return "#" + n.toString(16).slice(1);
	},

	hexToRgb: function (hex) {
		if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
		return [
			parseInt(hex.slice(1, 3), 16),
			parseInt(hex.slice(3, 5), 16),
			parseInt(hex.slice(5, 7), 16),
		];
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
		var fileTrigger = $("btn_file_menu");
		var fileMenu = $("file_menu");
		var editTrigger = $("btn_edit_menu");
		var editMenu = $("edit_menu");
		var uploadPNGItem = $("menu_upload_png");
		var uploadJSONItem = $("menu_upload_json");
		var exportJSONItem = $("menu_export_json");
		var exportEmbedItem = $("menu_export_embed");
		var undoItem = $("menu_undo");

		fileTrigger.addEventListener("click", function (e) {
			e.stopPropagation();
			CanvasCycle.toggleMenu(fileMenu, fileTrigger, [editMenu], [editTrigger]);
		});

		editTrigger.addEventListener("click", function (e) {
			e.stopPropagation();
			CanvasCycle.toggleMenu(editMenu, editTrigger, [fileMenu], [fileTrigger]);
		});

		uploadPNGItem.addEventListener("click", function () {
			CanvasCycle.closeMenus();
		});
		uploadJSONItem.addEventListener("click", function () {
			CanvasCycle.closeMenus();
		});
		exportJSONItem.addEventListener("click", function () {
			CanvasCycle.downloadCurrentJSON();
			CanvasCycle.closeMenus();
		});
		exportEmbedItem.addEventListener("click", function () {
			CanvasCycle.downloadCurrentEmbed();
			CanvasCycle.closeMenus();
		});

		undoItem.addEventListener("click", function () {
			CanvasCycle.performUndo();
			CanvasCycle.closeMenus();
		});

		fileMenu.addEventListener("click", function (e) {
			e.stopPropagation();
		});
		editMenu.addEventListener("click", function (e) {
			e.stopPropagation();
		});

		document.addEventListener("click", function () {
			CanvasCycle.closeMenus();
			CanvasCycle.closeColorChipPopup();
			CanvasCycle.closePaletteSortPopup();
		});

		this.updateUndoMenuItem();
	},

	toggleMenu: function (menu, trigger, otherMenus, otherTriggers) {
		var isHidden = /(^|\s)hidden(\s|$)/.test(menu.className);
		menu.setClass("hidden", !isHidden);
		trigger.setClass("open", isHidden);
		(otherMenus || []).forEach(function (other) {
			if (other) other.setClass("hidden", true);
		});
		(otherTriggers || []).forEach(function (other) {
			if (other) other.setClass("open", false);
		});
	},

	closeMenus: function () {
		$("file_menu").setClass("hidden", true);
		$("btn_file_menu").setClass("open", false);
		$("menu_open_sample").setClass("submenu-open", false);
		$("edit_menu").setClass("hidden", true);
		$("btn_edit_menu").setClass("open", false);
	},


	bindCanvasTools: function () {
		var canvas = $("mycanvas");
		canvas.addEventListener("mousedown", function (e) {
			CanvasCycle.isPointerDown = true;
			CanvasCycle.onCanvasMouseDown(e);
		});
		canvas.addEventListener("mousemove", function (e) {
			CanvasCycle.onCanvasMouseMove(e);
		});
		canvas.addEventListener("mouseleave", function () {
			CanvasCycle.eyedropperHoverColor = -1;
			CanvasCycle.updateHighlightColor();
		});
		window.addEventListener("mouseup", function () {
			CanvasCycle.dragging = false;
			CanvasCycle.isPointerDown = false;
			if (CanvasCycle.activeTool !== "eyedropper") {
				CanvasCycle.eyedropperHoverColor = -1;
				CanvasCycle.updateHighlightColor();
			}
			CanvasCycle.updateCanvasCursor();
		});
	},

	bindPaletteDragging: function () {
		["cycle_palette", "image_palette"].forEach(function (id) {
			var el = $(id);
			var handle = el ? el.querySelector(".palette-grip") : null;
			if (!el || !handle) return;
			handle.addEventListener("mousedown", function (e) {
				if (e.button !== 0) return;
				e.preventDefault();
				CanvasCycle.paletteDrag = {
					el: el,
					startX: e.clientX,
					startY: e.clientY,
					left: el.offsetLeft,
					top: el.offsetTop,
				};
			});
		});
		window.addEventListener("mousemove", function (e) {
			if (!CanvasCycle.paletteDrag) return;
			var d = CanvasCycle.paletteDrag;
			d.el.style.left = d.left + (e.clientX - d.startX) + "px";
			d.el.style.top = d.top + (e.clientY - d.startY) + "px";
			d.el.style.right = "auto";
		});
		window.addEventListener("contextmenu", function () {
			CanvasCycle.paletteDrag = null;
		});
		window.addEventListener("mouseup", function () {
			CanvasCycle.paletteDrag = null;
		});
	},

	positionPalettes: function () {
		var canvas = $("mycanvas");
		if (!canvas) return;
		var rect = canvas.getBoundingClientRect();
		var scrollX = window.scrollX || 0;
		var scrollY = window.scrollY || 0;
		var imagePalette = $("image_palette");
		var cyclePalette = $("cycle_palette");
		var paletteDisplay = $("palette_display");
		if (imagePalette) {
			imagePalette.style.left = rect.right + 12 + scrollX + "px";
			imagePalette.style.top = rect.top + scrollY + "px";
			imagePalette.style.right = "auto";
		}
		if (cyclePalette && paletteDisplay) {
			var pRect = paletteDisplay.getBoundingClientRect();
			var cyclesRow = $("d_cycles_row");
			var cyclesRect = cyclesRow ? cyclesRow.getBoundingClientRect() : pRect;
			cyclePalette.style.left =
				pRect.left +
				scrollX +
				Math.floor((pRect.width - cyclePalette.offsetWidth) / 2) +
				"px";
			cyclePalette.style.top = cyclesRect.top + scrollY + "px";
			cyclePalette.style.right = "auto";
		}
	},

	bindColorChipPopup: function () {
		$("tool_color_chip").addEventListener("click", function (e) {
			e.stopPropagation();
			if (CanvasCycle.colorPopupOpen) CanvasCycle.closeColorChipPopup();
			else CanvasCycle.openColorChipPopup();
		});
	},

	bindPaletteSortPopup: function () {
		var popup = $("palette_sort_popup");
		if (!popup) return;
		popup.addEventListener("click", function (e) {
			e.stopPropagation();
			var target = e.target;
			var mode = target ? target.getAttribute("data-sort") : "";
			if (!mode) return;
			CanvasCycle.requestPaletteSort(mode);
		});
	},

	togglePaletteSortPopup: function (e) {
		if (e) e.stopPropagation();
		if (!this.bmp) return;
		if (this.sortPopupOpen) this.closePaletteSortPopup();
		else this.openPaletteSortPopup();
	},

	openPaletteSortPopup: function () {
		var popup = $("palette_sort_popup");
		if (!popup) return;
		popup.setClass("hidden", false);
		this.positionPaletteSortPopup();
		this.sortPopupOpen = true;
	},

	positionPaletteSortPopup: function () {
		var popup = $("palette_sort_popup");
		var btn = $("btn_palette_sort");
		if (!popup || !btn) return;
		var btnRect = btn.getBoundingClientRect();
		var popupRect = popup.getBoundingClientRect();
		var pad = this.popupPlacementPadding;

		var left = btnRect.left;
		if (left + popupRect.width > window.innerWidth - pad)
			left = window.innerWidth - popupRect.width - pad;
		left = Math.max(pad, left);

		var top = btnRect.bottom + pad;
		if (top + popupRect.height > window.innerHeight - pad)
			top = btnRect.top - popupRect.height - pad;
		top = Math.max(pad, top);

		popup.style.left = left + "px";
		popup.style.top = top + "px";
	},

	closePaletteSortPopup: function () {
		var popup = $("palette_sort_popup");
		if (popup) popup.setClass("hidden", true);
		this.sortPopupOpen = false;
	},

	requestPaletteSort: function (mode) {
		this.closePaletteSortPopup();
		if (!this.bmp) return;
		if (this.bmp.palette.cycles.length) {
			this.pendingPaletteSortMode = mode;
			$("palette_sort_warning_modal").setClass("hidden", false);
			return;
		}
		this.sortPalette(mode);
	},

	cancelPaletteSortWarning: function () {
		this.pendingPaletteSortMode = "";
		$("palette_sort_warning_modal").setClass("hidden", true);
	},

	confirmPaletteSortWarning: function () {
		if (!this.pendingPaletteSortMode) return this.cancelPaletteSortWarning();
		this.bmp.palette.cycles = [];
		this.bmp.palette.numCycles = 0;
		var mode = this.pendingPaletteSortMode;
		this.cancelPaletteSortWarning();
		this.sortPalette(mode);
	},

	sortPalette: function (mode) {
		if (!this.bmp) return;
		var base = this.bmp.palette.baseColors;
		var indexed = [];
		for (var i = 0; i < base.length; i++)
			indexed.push({ idx: i, color: base[i] });
		if (mode === "reverse") indexed.reverse();
		else {
			indexed.sort(function (a, b) {
				return CanvasCycle.comparePaletteEntries(mode, a, b);
			});
		}
		var order = [];
		for (var n = 0; n < indexed.length; n++) order.push(indexed[n].idx);
		this.applyPaletteOrder(order);
	},

	comparePaletteEntries: function (mode, a, b) {
		var av = this.getPaletteSortMetric(mode, a.color);
		var bv = this.getPaletteSortMetric(mode, b.color);
		if (av < bv) return -1;
		if (av > bv) return 1;
		return a.idx - b.idx;
	},

	getPaletteSortMetric: function (mode, color) {
		if (mode === "red") return color.red;
		if (mode === "green") return color.green;
		if (mode === "blue") return color.blue;

		var hsv = this.rgbToHsv(color.red, color.green, color.blue);
		if (mode === "hue") return hsv.h;
		if (mode === "saturation") return hsv.s;
		if (mode === "brightness") return hsv.v;
		if (mode === "luminance")
			return color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722;
		return 0;
	},

	rgbToHsv: function (r, g, b) {
		var rn = r / 255;
		var gn = g / 255;
		var bn = b / 255;
		var max = Math.max(rn, gn, bn);
		var min = Math.min(rn, gn, bn);
		var d = max - min;
		var h = 0;
		if (d !== 0) {
			if (max === rn) h = ((gn - bn) / d) % 6;
			else if (max === gn) h = (bn - rn) / d + 2;
			else h = (rn - gn) / d + 4;
			h *= 60;
			if (h < 0) h += 360;
		}
		var s = max === 0 ? 0 : d / max;
		return { h: h, s: s, v: max };
	},

	applyPaletteOrder: function (order) {
		if (!this.bmp || !order || !order.length) return;
		var base = this.bmp.palette.baseColors;
		if (order.length !== base.length) return;
		var newBase = [];
		var remap = [];
		for (var i = 0; i < order.length; i++) {
			var oldIdx = order[i];
			newBase[i] = base[oldIdx];
			remap[oldIdx] = i;
		}
		this.bmp.palette.baseColors = newBase;
		for (var p = 0; p < this.bmp.pixels.length; p++)
			this.bmp.pixels[p] = remap[this.bmp.pixels[p]];
		this.bmp.optimize();
		this.markImageEdited();
		this.renderCyclesEditor();
		this.renderDirty = true;
		this.syncUploadedImageData();
	},

	openColorChipPopup: function () {
		if (!this.bmp) return;
		var popup = $("color_chip_popup");
		popup.innerHTML = "";
		for (var i = 0; i < this.bmp.palette.baseColors.length; i++) {
			var c = this.bmp.palette.baseColors[i];
			var chip = document.createElement("div");
			chip.className = "popup-chip";
			chip.title = "Color " + i;
			chip.style.backgroundColor =
				"rgb(" + c.red + "," + c.green + "," + c.blue + ")";
			chip._idx = i;
			chip.onclick = function (ev) {
				ev.stopPropagation();
				var picked = CanvasCycle.bmp.palette.baseColors[this._idx];
				CanvasCycle.currentPaintColor = [picked.red, picked.green, picked.blue];
				CanvasCycle.updateColorChip();
				CanvasCycle.closeColorChipPopup();
			};
			popup.appendChild(chip);
		}
		popup.setClass("hidden", false);
		this.positionColorChipPopup();
		this.colorPopupOpen = true;
	},

	positionColorChipPopup: function () {
		var popup = $("color_chip_popup");
		var chip = $("tool_color_chip");
		if (!popup || !chip) return;
		var chipRect = chip.getBoundingClientRect();
		var popupRect = popup.getBoundingClientRect();
		var pad = this.popupPlacementPadding;

		var left = chipRect.right + pad;
		if (left + popupRect.width > window.innerWidth - pad)
			left = chipRect.left - popupRect.width - pad;
		left = Math.max(
			pad,
			Math.min(left, window.innerWidth - popupRect.width - pad),
		);

		var top = chipRect.bottom - popupRect.height;
		if (top < pad) top = chipRect.top + pad;
		if (top + popupRect.height > window.innerHeight - pad)
			top = window.innerHeight - popupRect.height - pad;

		popup.style.left = left + "px";
		popup.style.top = Math.max(pad, top) + "px";
	},

	closeColorChipPopup: function () {
		$("color_chip_popup").setClass("hidden", true);
		this.colorPopupOpen = false;
	},

	clearUndoBuffer: function () {
		this.undoBuffer = [];
		this.updateUndoMenuItem();
	},

	pushUndoAction: function (action) {
		if (!action) return;
		if (!action.timestamp) action.timestamp = Date.now();
		action.type = action.type || "action";
		action.label = action.label || "Undo";

		if (action.mergeKey && this.undoBuffer.length) {
			var top = this.undoBuffer[this.undoBuffer.length - 1];
			if (top && top.mergeKey === action.mergeKey) {
				top.newdata = action.newdata;
				top.timestamp = action.timestamp;
				this.updateUndoMenuItem();
				return;
			}
		}

		this.undoBuffer.push(action);
		if (this.undoBuffer.length > this.maxUndoCount) this.undoBuffer.shift();
		this.updateUndoMenuItem();
	},

	performUndo: function () {
		if (!this.bmp || !this.undoBuffer.length) return;
		var action = this.undoBuffer.pop();
		if (!action) return;

		if (action.type === "pencil") {
			var oldPixel = action.olddata || {};
			if (typeof oldPixel.pixelIdx === "number")
				this.bmp.pixels[oldPixel.pixelIdx] = oldPixel.colorIndex;
			this.bmp.optimize();
			this.renderDirty = true;
			this.markImageEdited();
			this.syncUploadedImageData();
		} else if (action.type === "palette-color") {
			var oldPalette = action.olddata || {};
			var idx = oldPalette.index;
			if (
				typeof idx === "number" &&
				idx >= 0 &&
				idx < this.bmp.palette.baseColors.length
			) {
				var color = this.bmp.palette.baseColors[idx];
				if (oldPalette.color && oldPalette.color.length === 3) {
					color.red = oldPalette.color[0];
					color.green = oldPalette.color[1];
					color.blue = oldPalette.color[2];
				}
				this.bmp.optimize();
				this.renderDirty = true;
				this.markImageEdited();
				this.syncUploadedImageData();
				this.updateColorChip();
			}
		}

		this.updateUndoMenuItem();
	},

	updateUndoMenuItem: function () {
		var undoItem = $("menu_undo");
		if (!undoItem) return;
		if (!this.undoBuffer.length) {
			undoItem.innerHTML = "Undo";
			undoItem.setClass("menu-item-disabled", true);
			return;
		}
		var top = this.undoBuffer[this.undoBuffer.length - 1];
		undoItem.innerHTML = top.label || "Undo";
		undoItem.setClass("menu-item-disabled", false);
	},

	bindKeyboardNavigation: function () {
		document.addEventListener("keydown", function (e) {
			CanvasCycle.trackModifierKeyState(e, true);
			CanvasCycle.updateTemporaryToolShortcut(e);
			if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
				e.preventDefault();
				CanvasCycle.performUndo();
				return;
			}
			if (e.key === "Escape") {
				if (
					CanvasCycle.activeTool ||
					CanvasCycle.dragging ||
					CanvasCycle.paletteDrag
				) {
					e.preventDefault();
				}
				CanvasCycle.disableToolsAndDragging();
				return;
			}
			CanvasCycle.handlePaletteArrowKey(e);
		});
		document.addEventListener("keyup", function (e) {
			CanvasCycle.trackModifierKeyState(e, false);
			CanvasCycle.updateTemporaryToolShortcut(e);
		});
		window.addEventListener("blur", function () {
			CanvasCycle.spaceKeyDown = false;
			CanvasCycle.metaKeyDown = false;
			CanvasCycle.altKeyDown = false;
			CanvasCycle.updateTemporaryToolShortcut();
		});
	},

	trackModifierKeyState: function (e, isDown) {
		if (e.code === "Space") this.spaceKeyDown = isDown;
		if (e.key === "Meta") this.metaKeyDown = isDown;
		if (e.key === "Alt") this.altKeyDown = isDown;
		if (!isDown) {
			this.metaKeyDown = !!e.metaKey;
			this.altKeyDown = !!e.altKey;
		}
	},

	updateTemporaryToolShortcut: function (e) {
		var reserved = this.isArrowKeyReservedTarget(document.activeElement);
		var nextTool = null;
		if (!reserved && this.spaceKeyDown)
			nextTool = this.metaKeyDown ? "zoom" : "move";
		var wantsZoomOut = !!(nextTool === "zoom" && this.altKeyDown);

		if (nextTool && !this.temporaryToolActive) {
			this.temporaryToolActive = true;
			this.temporaryToolPrevious = this.activeTool;
		}

		if (nextTool) {
			this.forceZoomOutCursor = wantsZoomOut;
			this.setTool(nextTool);
			this.updateCanvasCursor(wantsZoomOut);
			if (e && (e.code === "Space" || e.key === "Meta" || e.key === "Alt"))
				e.preventDefault();
			return;
		}

		if (this.temporaryToolActive) {
			this.forceZoomOutCursor = false;
			this.setTool(this.temporaryToolPrevious);
			this.temporaryToolActive = false;
			this.temporaryToolPrevious = null;
			return;
		}

		this.forceZoomOutCursor = false;
	},

	disableToolsAndDragging: function () {
		this.setTool(null);
		this.dragging = false;
		this.isPointerDown = false;
		this.paletteDrag = null;
		this.temporaryToolActive = false;
		this.temporaryToolPrevious = null;
		this.forceZoomOutCursor = false;
		this.updateCanvasCursor();
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
		if (this.hoverHighlightColor !== -1) {
			this.highlightColor = this.hoverHighlightColor;
			this.highlightAffectsCanvas = true;
			return;
		}
		if (this.eyedropperHoverColor !== -1) {
			this.highlightColor = this.eyedropperHoverColor;
			this.highlightAffectsCanvas = false;
			return;
		}
		this.highlightColor = this.keyboardHighlightColor;
		this.highlightAffectsCanvas = true;
	},

	populateScenes: function (initialSceneIdx) {
		var wrap = $("d_scene_selector");
		wrap.innerHTML = "";
		for (var i = 0; i < scenes.length; i++) {
			var item = document.createElement("div");
			item.className =
				"menu-item sample-item" + (i === initialSceneIdx ? " selected" : "");
			item.textContent = scenes[i].title;
			item._sceneIdx = i;
			item.onclick = function (e) {
				e.stopPropagation();
				CanvasCycle.switchSceneByIndex(this._sceneIdx);
			};
			wrap.appendChild(item);
		}
	},

	updateSceneSelection: function () {
		var nodes = $("d_scene_selector").querySelectorAll(".sample-item");
		for (var i = 0; i < nodes.length; i++)
			$(nodes[i]).setClass("selected", i === this.sceneIdx);
	},

	closeFileMenu: function () {
		this.closeMenus();
	},
	applyStoredPrefs: function () {
		var prefs = this.cookie.get("settings");
		if (!prefs) return;
		this.setRate(prefs.targetFPS || 60);
		this.setSpeed(prefs.speedAdjust || 1.0);
		this.setBlendShift(prefs.blendShiftEnabled !== false);
		this.setGridOverlay(prefs.gridOverlay !== false);
	},

	jumpScene: function (dir) {
		this.sceneIdx += dir;
		if (this.sceneIdx >= scenes.length) this.sceneIdx = 0;
		else if (this.sceneIdx < 0) this.sceneIdx = scenes.length - 1;
		this.switchSceneByIndex(this.sceneIdx);
	},

	switchSceneByIndex: function (sceneIdx) {
		var name = scenes[sceneIdx].name;
		if (this.shouldConfirmSceneSwitch()) {
			this.pendingSceneIdx = sceneIdx;
			this.pendingSceneName = name;
			$("scene_modal").setClass("hidden", false);
			this.closeFileMenu();
			return;
		}
		this.sceneIdx = sceneIdx;
		this.currentSource = "sample";
		this.hasUnsavedEdits = false;
		this.loadImage(name);
		this.updateSceneSelection();
		this.closeFileMenu();
	},

	cancelSceneSwitch: function () {
		$("scene_modal").setClass("hidden", true);
		this.updateSceneSelection();
		this.pendingSceneIdx = -1;
		this.pendingSceneName = "";
	},

	confirmSceneSwitch: function () {
		if (!this.pendingSceneName) return this.cancelSceneSwitch();
		this.sceneIdx = this.pendingSceneIdx;
		this.currentSource = "sample";
		this.hasUnsavedEdits = false;
		this.loadImage(this.pendingSceneName);
		this.cancelSceneSwitch();
		this.closeFileMenu();
	},

	shouldConfirmSceneSwitch: function () {
		if (!this.bmp) return false;
		if (this.currentSource !== "sample") return true;
		return this.hasUnsavedEdits;
	},

	markImageEdited: function () {
		this.hasUnsavedEdits = true;
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
		this.sourceImageData = img;
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
		this.cycleTimeOffset = 0;
		$("btn_pause").innerHTML = "⏸";
		$("btn_pause").title = "Pause";
		this.activeFilename = img.filename || "image.json";
		this.clearUndoBuffer();
		this.resetView();
		this.renderCyclesEditor();
		this.updateSceneSelection();
		this.closeColorChipPopup();
		this.closePaletteSortPopup();
		this.cancelPaletteSortWarning();
		this.positionPalettes();
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
		var btn = $("btn_pause");
		btn.innerHTML = this.paused ? "▶" : "⏸";
		btn.title = this.paused ? "Play" : "Pause";
	},

	resetCycleAnimation: function () {
		if (!this.bmp) return;
		var baseTick = this.paused ? this.pausedTime : GetTickCount();
		this.cycleTimeOffset = baseTick;
		this.renderDirty = true;
		if (this.paused) {
			this.bmp.palette.copyColors(
				this.bmp.palette.baseColors,
				this.bmp.palette.colors,
			);
		}
	},

	toggleSelectedColor: function (idx) {
		this.selectedColor = this.selectedColor === idx ? -1 : idx;
		this.updatePaletteSelection();
	},

	selectColor: function (idx) {
		this.selectedColor = idx;
		this.updatePaletteSelection();
	},

	updatePaletteSelection: function () {
		for (var idx = 0; idx < 256; idx++) {
			var chip = $("pal_" + idx);
			if (!chip) continue;
			chip.setClass("selected", idx === this.selectedColor);
			chip.setClass("hover-highlight", idx === this.highlightColor);
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
		var debug = `<span class="fps">FPS: ${FrameCount.current}</span>`;
		if (this.highlightColor !== -1) {
			var c = this.bmp.palette.baseColors[this.highlightColor] || {
				red: 0,
				green: 0,
				blue: 0,
			};
			var hex = ((1 << 24) + (c.red << 16) + (c.green << 8) + c.blue)
				.toString(16)
				.slice(1)
				.toUpperCase();
			debug += `
        <span class="hex">#${hex}</span>
        <span class="rgb">rgb(${c.red}, ${c.green}, ${c.blue})</span>
        <span class="color">Color #${this.highlightColor}</span>
      `;
		}
		$("d_debug").innerHTML = debug;

		var rawRenderTime = this.paused ? this.pausedTime : GetTickCount();
		var renderTime = Math.max(0, rawRenderTime - this.cycleTimeOffset);
		this.bmp.palette.cycle(
			this.bmp.palette.baseColors,
			renderTime,
			this.settings.speedAdjust,
			this.settings.blendShiftEnabled,
		);
		if (this.highlightColor > -1 && this.highlightAffectsCanvas)
			this.bmp.palette.colors[this.highlightColor] = new Color(255, 255, 255);
		if (this.globalBrightness < 1.0)
			this.bmp.palette.burnOut(1.0 - this.globalBrightness, 1.0);
		this.bmp.render(
			this.imageData,
			!this.paused &&
				!this.renderDirty &&
				this.lastBrightness === this.globalBrightness &&
				this.highlightColor === this.lastHighlightColor,
		);
		this.renderDirty = false;
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
		if (this.settings.gridOverlay && this.view.zoom >= 6) this.drawPixelGrid();

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
		var header = $("cycles_header");
		container.innerHTML = "";
		if (!this.bmp) return;
		// header.style.display = this.bmp.palette.cycles.length ? "grid" : "none";
		for (var idx = 0; idx < this.bmp.palette.cycles.length; idx++) {
			var cyc = this.bmp.palette.cycles[idx];
			var row = document.createElement("div");
			row.className = "cycle_row";
			row.innerHTML =
				'<label class="cycle_field cycle_active"><input type="checkbox" data-cycle="' +
				idx +
				'" data-key="active"' +
				(cyc.active === false ? "" : ' checked="checked"') +
				'"></label>' +
				'<div class="cycle_id">C' +
				(idx + 1) +
				"</div>" +
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
				'<label class="cycle_field"><input type="number" data-cycle="' +
				idx +
				'" data-key="rate" value="' +
				cyc.rate +
				'"></label>' +
				'<label class="cycle_field"><select data-cycle="' +
				idx +
				'" data-key="reverse"><option>0</option><option>1</option><option>2</option></select></label>' +
				'<div class="button cycle_remove" data-action="remove" data-cycle="' +
				idx +
				'">x</div>';
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
		container.onfocusin = function (e) {
			CanvasCycle.syncSelectedColorToCycleField(e.target);
		};
		container.onfocusout = function (e) {
			CanvasCycle.clearSelectedColorFromCycleFieldBlur(e);
		};
		container.addEventListener("focus", function (e) {
			CanvasCycle.syncSelectedColorToCycleField(e.target);
		}, true);
		container.oninput = function (e) {
			CanvasCycle.syncSelectedColorToCycleField(e.target);
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
				CanvasCycle.markImageEdited();
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
			CanvasCycle.markImageEdited();
			CanvasCycle.syncUploadedImageData();
			CanvasCycle.syncSelectedColorToCycleField(t);
		};
	},

	syncSelectedColorToCycleField: function (field) {
		if (!field || !this.bmp) return;
		var key = field.getAttribute("data-key");
		if (key !== "low" && key !== "high") return;
		var idx = parseInt(field.value, 10);
		if (isNaN(idx)) {
			var cycleIdx = parseInt(field.getAttribute("data-cycle"), 10);
			if (!isNaN(cycleIdx) && this.bmp.palette.cycles[cycleIdx]) {
				idx = parseInt(this.bmp.palette.cycles[cycleIdx][key], 10);
			}
		}
		if (isNaN(idx) || idx < 0 || idx >= this.bmp.palette.baseColors.length)
			return;
		this.selectColor(idx);
		this.keyboardHighlightColor = idx;
		this.updateHighlightColor();
	},

	clearSelectedColorFromCycleFieldBlur: function (evt) {
		if (!evt || !this.bmp) return;
		var field = evt.target;
		if (!field || !field.getAttribute) return;
		var key = field.getAttribute("data-key");
		if (key !== "low" && key !== "high") return;
		var next = evt.relatedTarget;
		if (next && next.getAttribute) {
			var nextKey = next.getAttribute("data-key");
			if (nextKey === "low" || nextKey === "high") return;
		}
		this.selectedColor = -1;
		this.updatePaletteSelection();
	},

	addCycle: function () {
		if (!this.bmp) return;
		this.bmp.palette.cycles.push(new Cycle(280, 0, 0, 0, true));
		this.bmp.palette.numCycles = this.bmp.palette.cycles.length;
		this.bmp.optimize();
		this.markImageEdited();
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
		this.markImageEdited();
		this.renderCyclesEditor();
		this.syncUploadedImageData();
	},

	syncUploadedImageData: function () {
		if (!this.bmp) return;
		var payload = {
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
		if (this.sourceImageData) {
			this.sourceImageData.pixels = payload.pixels;
			this.sourceImageData.colors = payload.colors;
			this.sourceImageData.cycles = payload.cycles;
		}
		if (this.uploadedImageData) {
			this.uploadedImageData.pixels = payload.pixels;
			this.uploadedImageData.colors = payload.colors;
			this.uploadedImageData.cycles = payload.cycles;
		}
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
		this.updateCycleRangesForPaletteMove(fromIdx, toIdx, base.length - 1);

		var oldOrder = [];
		for (var i = 0; i < base.length; i++) oldOrder[i] = i;
		var movedIdx = oldOrder.splice(fromIdx, 1)[0];
		oldOrder.splice(toIdx, 0, movedIdx);
		var remap = [];
		for (var n = 0; n < oldOrder.length; n++) remap[oldOrder[n]] = n;
		for (var p = 0; p < this.bmp.pixels.length; p++)
			this.bmp.pixels[p] = remap[this.bmp.pixels[p]];
		this.bmp.optimize();
		this.markImageEdited();
		this.renderCyclesEditor();
		this.renderDirty = true;
		this.syncUploadedImageData();
	},

	updateCycleRangesForPaletteMove: function (fromIdx, toIdx, maxPaletteIndex) {
		var cycles = this.bmp && this.bmp.palette ? this.bmp.palette.cycles : null;
		if (!cycles || !cycles.length) return;
		for (var i = 0; i < cycles.length; i++) {
			this.remapCycleRange(cycles[i], fromIdx, toIdx, maxPaletteIndex);
		}
	},

	remapCycleRange: function (cycle, fromIdx, toIdx, maxPaletteIndex) {
		if (!cycle) return;
		var low = Math.max(
			0,
			Math.min(maxPaletteIndex, Math.min(cycle.low, cycle.high)),
		);
		var high = Math.max(
			0,
			Math.min(maxPaletteIndex, Math.max(cycle.low, cycle.high)),
		);
		if (high < low) {
			cycle.low = low;
			cycle.high = low;
			return;
		}

		var inRange = function (idx) {
			return idx >= low && idx <= high;
		};
		var remapped = [];
		for (var idx = low; idx <= high; idx++) {
			if (idx === fromIdx && !inRange(toIdx)) continue;
			remapped.push(
				CanvasCycle.remapPaletteIndexAfterMove(idx, fromIdx, toIdx),
			);
		}

		if (!inRange(fromIdx) && inRange(toIdx)) {
			remapped.push(toIdx);
		}

		if (!remapped.length) {
			cycle.low = low;
			cycle.high = low;
			return;
		}

		cycle.low = Math.max(
			0,
			Math.min(maxPaletteIndex, Math.min.apply(Math, remapped)),
		);
		cycle.high = Math.max(
			0,
			Math.min(maxPaletteIndex, Math.max.apply(Math, remapped)),
		);
	},

	remapPaletteIndexAfterMove: function (index, fromIdx, toIdx) {
		if (index === fromIdx) return toIdx;
		if (fromIdx < toIdx) {
			if (index > fromIdx && index <= toIdx) return index - 1;
			return index;
		}
		if (index >= toIdx && index < fromIdx) return index + 1;
		return index;
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
				CanvasCycle.currentSource = "upload";
				CanvasCycle.hasUnsavedEdits = false;
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
				CanvasCycle.currentSource = "upload";
				CanvasCycle.hasUnsavedEdits = false;
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
		this.positionPalettes();
		if (this.colorPopupOpen) this.positionColorChipPopup();
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
	setGridOverlay: function (enabled) {
		var value = !!enabled;
		this.settings.gridOverlay = value;
		$("tool_grid").setClass("active", value);
		this.saveSettings();
	},

	toggleGridOverlay: function () {
		this.setGridOverlay(!this.settings.gridOverlay);
	},

	setTool: function (tool) {
		if (tool !== "eyedropper") this.eyedropperHoverColor = -1;
		this.activeTool = tool || null;
		["zoom", "pencil", "eyedropper", "move"].forEach(function (name) {
			$("tool_" + name).setClass("active", name === CanvasCycle.activeTool);
		});
		this.updateHighlightColor();
		this.updateCanvasCursor();
	},

	updateCanvasCursor: function (minus) {
		var canvas = $("mycanvas");
		var showMinus = !!(minus || this.forceZoomOutCursor);
		if (!this.activeTool) canvas.style.cursor = "default";
		else if (this.activeTool === "pencil") canvas.style.cursor = "crosshair";
		else if (this.activeTool === "eyedropper") canvas.style.cursor = "copy";
		else if (this.activeTool === "move")
			canvas.style.cursor = this.dragging ? "grabbing" : "grab";
		else canvas.style.cursor = showMinus ? "zoom-out" : "zoom-in";
	},

	canvasToImagePixel: function (e) {
		if (!this.bmp) return null;
		var rect = $("mycanvas").getBoundingClientRect();
		var x = Math.floor(
			(e.clientX - rect.left - this.view.offsetX) / this.view.zoom,
		);
		var y = Math.floor(
			(e.clientY - rect.top - this.view.offsetY) / this.view.zoom,
		);
		if (x < 0 || y < 0 || x >= this.bmp.width || y >= this.bmp.height)
			return null;
		return { x: x, y: y };
	},

	onCanvasMouseDown: function (e) {
		var pixel = this.canvasToImagePixel(e);
		if (this.activeTool === "zoom" && pixel) this.applyZoomClick(e, pixel);
		else if (this.activeTool === "pencil" && pixel)
			this.paintPixel(pixel.x, pixel.y);
		else if (this.activeTool === "eyedropper" && pixel)
			this.pickPixelColor(pixel.x, pixel.y);
		else if (this.activeTool === "move") {
			this.dragging = true;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;
			this.dragStartOffsetX = this.view.offsetX;
			this.dragStartOffsetY = this.view.offsetY;
			this.updateCanvasCursor();
		}
	},

	onCanvasMouseMove: function (e) {
		this.updateCanvasCursor(e.altKey || this.forceZoomOutCursor);
		var pixel = this.canvasToImagePixel(e);
		if (this.activeTool === "eyedropper" && pixel) {
			this.eyedropperHoverColor =
				this.bmp.pixels[pixel.y * this.bmp.width + pixel.x];
		} else if (this.eyedropperHoverColor !== -1) {
			this.eyedropperHoverColor = -1;
		}
		this.updateHighlightColor();
		if (this.isPointerDown && this.activeTool === "pencil" && pixel)
			this.paintPixel(pixel.x, pixel.y);
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
		if (!this.bmp) return;
		var idx = this.findOrCreateColorIndex(this.currentPaintColor);
		if (idx < 0) return;
		var pixelIdx = y * this.bmp.width + x;
		var oldIdx = this.bmp.pixels[pixelIdx];
		if (oldIdx === idx) return;

		this.pushUndoAction({
			type: "pencil",
			label: "Undo pencil tool",
			olddata: { x: x, y: y, pixelIdx: pixelIdx, colorIndex: oldIdx },
			newdata: { x: x, y: y, pixelIdx: pixelIdx, colorIndex: idx },
		});

		this.bmp.pixels[pixelIdx] = idx;
		this.bmp.optimize();
		this.markImageEdited();
		this.renderDirty = true;
		this.syncUploadedImageData();
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
			if (
				base[i].red === rgb[0] &&
				base[i].green === rgb[1] &&
				base[i].blue === rgb[2]
			)
				return i;
		}
		if (base.length >= 256) return -1;
		base.push(new Color(rgb[0], rgb[1], rgb[2]));
		this.markImageEdited();
		this.renderDirty = true;
		this.syncUploadedImageData();
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
			ctx.beginPath();
			ctx.moveTo(px, this.view.offsetY);
			ctx.lineTo(px, this.view.offsetY + this.bmp.height * this.view.zoom);
			ctx.stroke();
		}
		for (var y = 0; y <= this.bmp.height; y++) {
			var py = this.view.offsetY + y * this.view.zoom + 0.5;
			ctx.beginPath();
			ctx.moveTo(this.view.offsetX, py);
			ctx.lineTo(this.view.offsetX + this.bmp.width * this.view.zoom, py);
			ctx.stroke();
		}
		ctx.restore();
	},

	updateColorChip: function () {
		var chip = $("tool_color_chip");
		chip.style.backgroundColor =
			"rgb(" +
			this.currentPaintColor[0] +
			"," +
			this.currentPaintColor[1] +
			"," +
			this.currentPaintColor[2] +
			")";
	},
};

var CC = CanvasCycle;
