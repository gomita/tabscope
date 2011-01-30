var TabScope = {

	// Firefox 3.6
	_fx36: false,

	// Mac OS X
	_mac: false,

	// xul:panel element
	popup: null,

	// html:canvas element
	canvas: null,

	// xul:tab element which mouse pointer currently points to
	_tab: null,

	// timer id to open popup with delay
	_timerId: null,

	// nsITimer instance to update preview and popup position
	_timer: null,

	// flag indicates to require updating preview
	_shouldUpdatePreview: false,

	// flag indicates to require updating title
	_shouldUpdateTitle: false,

	// nsIPrefBranch
	_branch: null,

	// avail rectangle in screen
	_availRect: null,

	// flag indicates using multiple displays
	_multiScreens: false,

	// zoom state of preview
	_zoomState: false,

	// time when window is opened
	_initTime: null,

	// [Firefox3.6] last time to hide popup
	_lastHidingTime: null,

	init: function() {
		var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
		this._fx36 = parseFloat(appInfo.version) < 4.0;
		this._mac  = navigator.platform.indexOf("Mac") >= 0;
		this._initTime = Date.now();
		this.popup = document.getElementById("tabscope-popup");
		this.canvas = document.getElementById("tabscope-preview");
		this.popup.addEventListener("DOMMouseScroll", this, false);
		this.canvas.addEventListener("transitionend", this, false);
		// [Firefox3.6] use gPrefService instead of Services.prefs
		this._branch = (this._fx36 ? gPrefService : Services.prefs).
		               getBranch("extensions.tabscope.");
		// disable default tooltip of tabs
		gBrowser.mTabContainer.tooltip = null;
		gBrowser.mTabContainer.mTabstrip.addEventListener("mouseover", this, false);
		gBrowser.mTabContainer.mTabstrip.addEventListener("mousemove", this, false);
		gBrowser.mTabContainer.mTabstrip.addEventListener("mouseout", this, false);
		gBrowser.mTabContainer.addEventListener("TabOpen", this, false);
		gBrowser.mTabContainer.addEventListener("TabClose", this, false);
		gBrowser.mTabContainer.addEventListener("TabSelect", this, false);
		gBrowser.mTabContainer.addEventListener("draggesture", this, false);
		// cache avail rect
		var svc = Cc["@mozilla.org/gfx/screenmanager;1"].getService(Ci.nsIScreenManager);
		var left = {}, top = {}, width = {}, height = {};
		svc.primaryScreen.GetAvailRect(left, top, width, height);
		this._availRect = {
			left: left.value, right: left.value + width.value,
			top: top.value, bottom: top.value + height.value
		};
		this._multiScreens = svc.numberOfScreens > 1;
		this.loadPrefs();
	},

	uninit: function() {
		this._cancelDelayedOpen();
		// [backmonitor] should close popup explicitly
		this.popup.hidePopup();
		NS_ASSERT(this._timer === null, "timer is not cancelled.");
		gBrowser.mTabContainer.removeEventListener("TabOpen", this, false);
		gBrowser.mTabContainer.removeEventListener("TabClose", this, false);
		gBrowser.mTabContainer.removeEventListener("TabSelect", this, false);
		gBrowser.mTabContainer.removeEventListener("draggesture", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mouseover", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mousemove", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mouseout", this, false);
		this.canvas.removeEventListener("transitionend", this, false);
		this.popup.removeEventListener("DOMMouseScroll", this, false);
		this.canvas = null;
		this.popup = null;
		this._tab = null;
		this._availRect = null;
		this._branch = null;
	},

	loadPrefs: function() {
		var toolbar = document.getElementById("tabscope-toolbar");
		var buttons = this._branch.getCharPref("buttons");
		// [Firefox3.6] exclude unsupported buttons
		if (this._fx36)
			buttons = buttons.split(",").
			          filter(function(id) id != "pin" && id != "groups").join(",");
		var display = this._branch.getIntPref("toolbar_display");
		this.popup.setAttribute("_toolbardisplay", display);
		toolbar.hidden = display == 0 || !buttons || !this._branch.getBoolPref("popup_hovering");
		if (toolbar.hidden)
			return;
		buttons = buttons.split(",");
		Array.forEach(toolbar.getElementsByTagName("toolbarbutton"), function(elt) {
			elt.hidden = buttons.indexOf(elt.id.replace(/^tabscope-|-button$/g, "")) < 0;
		});
	},

	handleEvent: function(event) {
//		var rel = event.relatedTarget ? event.relatedTarget.localName : "null";	// #debug
//		this.log([event.type, event.target.localName, rel].join("\t"));	// #debug
		switch (event.type) {
			case "TabOpen": 
				if (!this._branch.getBoolPref("backmonitor"))
					return;
				// [backmonitor] to fix issue#12 halfway, disable in a few seconds after window is opened
				if (this._initTime && Date.now() - this._initTime < 2000) {
					this.log("*** disable backmonitor " + (Date.now() - this._initTime))	// #debug
					return;
				}
				// [backmonitor] when once we pass the check above, we no more need to do it
				this._initTime = null;
				// [backmonitor] temporarily disable if mouse pointer is currently on tab or popup
				if (this._tab && 
				    (this._tab.parentNode.querySelector(":hover") == this._tab || 
				     this.popup.parentNode.querySelector(":hover") == this.popup))
					return;
				// [backmonitor][BarTab] to fix issue#18, disable backmonitor for unloaded tabs
				if ("BarTabHandler" in gBrowser && event.target.getAttribute("ontap") == "true")
					return;
			case "mouseover": 
				// [backmonitor] temporarily disable if window is inactive
				// don't open popup for tab in background window
				// [Firefox3.6] :-moz-window-inactive pseudo class is unsupported
				if (this._fx36) {
					if (!document.documentElement.hasAttribute("active"))
						return;
				}
				else {
					if (document.querySelector("#main-window:-moz-window-inactive"))
						return;
				}
				// when mouse pointer moves inside a tab...
				// when hovering on tab strip...
				// (includes outside corner edge of a tab, new tab button and tab scroller)
				if (event.target == this._tab || event.target.localName != "tab")
					// do nothing, keep popup open if it is opened
					return;
				// don't open popup for tab which is about to close
				if (gBrowser._removingTabs.indexOf(event.target) > -1)
					return;
				// don't open popup for an exceptional tab
				if (this._branch.getIntPref("tab_exceptions") & 1 && 
				    event.target == gBrowser.mCurrentTab) {
					this._cancelDelayedOpen();
					return;
				}
				// when mouse pointer moves from one tab to another before popup will open...
				// cancel opening popup and restart timer in the following process
				this._cancelDelayedOpen();
				if (!this._tab) {
					// when hovering on a tab...
					// popup is currently closed, so open it with delay
					this._tab = event.target;
					var noAutoHide = event.type == "TabOpen";
					var callback = function(self) { self._delayedOpenPopup(noAutoHide); };
					var delay = noAutoHide ? 100 : this._branch.getIntPref("popup_delay");
					this._timerId = window.setTimeout(callback, delay, this);
					this.log("--- start timer (" + this._timerId + ")");	// #debug
				}
				else {
					// [Firefox3.6] don't move popup, just close it and start dummy timer
					if (this._fx36 && event.type == "mouseover") {
						this.popup.hidePopup();
						this._tab = event.target;
						this._timerId = window.setTimeout(function() {}, 0);	// dummy
						this.log("--- start dummy timer (" + this._timerId + ")");	// #debug
						return;
					}
					// when mouse pointer moves from one tab to another...
					// popup is already opened, so move it now
					this._tab.linkedBrowser.removeEventListener("MozAfterPaint", this, false);
					this._tab.removeEventListener("TabAttrModified", this, false);
					this._tab = event.target;
					this._tab.linkedBrowser.addEventListener("MozAfterPaint", this, false);
					this._tab.addEventListener("TabAttrModified", this, false);
					this._ensureTabIsRestored();
					this._shouldUpdatePreview = false;
					this._shouldUpdateTitle = false;
					this._adjustPopupPosition(true);
					this._updatePreview();
					this._updateTitle();
					this._updateToolbar();
				}
				break;
			case "mousemove": 
				// don't handle events while popup is open, but before popup is open
				if (!this._timerId)
					return;
				// when mouse pointer moves from a tab to non-tab elements (e.g. new tab button)...
				if (event.target.localName != "tab")
					return;
				// don't open popup for tab which is about to close
				if (gBrowser._removingTabs.indexOf(event.target) > -1)
					return;
				// when mouse pointer moves from one tab to another, restart timer to open popup
				this._cancelDelayedOpen();
				this._tab = event.target;
				var callback = function(self) { self._delayedOpenPopup(false); };
				var delay;
				// [Firefox3.6] if mouse pointer moves quickly, open popup with minimal delay
				if (this._fx36 && Date.now() - this._lastHidingTime < 200)
					delay = 10;
				else
					delay = this._branch.getIntPref("popup_delay");
				this._timerId = window.setTimeout(callback, delay, this);
				this.log("--- start timer again (" + this._timerId + ")");	// #debug
				break;
			case "mouseout": 
				// don't handle events on non-tab elements e.g. arrowscrollbox
				if (!this._tab)
					return;
				var box = this._tab.boxObject;
				var x = event.screenX, y = event.screenY;
				// if tabs are arranged vertically...
				if (gBrowser.mTabContainer.orient == "vertical") {
					// when mouse pointer moves inside vertical band-like area containing tabs...
					if (box.screenX <= x && x < box.screenX + box.width)
						// do nothing, keep popup open
						return;
				}
				// if tabs are arranged horizontally...
				else {
					// when mouse pointer moves inside horizontal band-like area containing tabs...
					if (box.screenY <= y && y < box.screenY + box.height)
						// do nothing, keep popup open
						return;
				}
				// [Firefox3.6][Mac] close popup when hovering over it if backmonitor is enabled
				if (this._fx36 && this._mac)
					this.popup.removeAttribute("noautohide");
				// since popup boxObject holds its size and position even if it is closed,
				// should test with popup boxObject only if popup is open
				if (this._branch.getBoolPref("popup_hovering") && this.popup.state == "open") {
					if (this._fx36 && this._mac) {
						// [Firefox3.6][Mac] event.screenX and event.screenY have bogus values
						// so, close popup *only* when mouse pointer moves from popup to browser
						if (event.target == this.popup && 
						    event.relatedTarget && event.relatedTarget.localName == "browser") {
							this.popup.hidePopup();
						}
						return;
					}
					// when mouse pointer is hovering over popup...
					box = this.popup.boxObject;
					if (box.screenX <= x && x < box.screenX + box.width && 
					    box.screenY <= y && y < box.screenY + box.height)
						// do nothing, keep popup open
						return;
				}
				// otherwise...
				this._cancelDelayedOpen();
				// close popup if it is opened
				this.popup.hidePopup();
				break;
			case "popupshowing": 
				this.log("open popup");	// #debug
				this._tab.linkedBrowser.addEventListener("MozAfterPaint", this, false);
				this._tab.addEventListener("TabAttrModified", this, false);
				this._ensureTabIsRestored();
				this._shouldUpdatePreview = false;
				this._shouldUpdateTitle = false;
				this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
				this._timer.initWithCallback(this, 500, Ci.nsITimer.TYPE_REPEATING_SLACK);
				this._adjustPreviewSize(false);
				this._updatePreview();
				this._updateTitle();
				this._updateToolbar();
				// XXX to fix wrong border on bottom-right corner if Windows Aero is enabled...
				// 1) set collapsed to true before opening popup
				// 2) set collapsed to false just after popup is shown
				var selector = "#tabscope-popup:-moz-system-metric(windows-compositor)";
				if (this.popup.parentNode.querySelector(selector))
					this.popup.collapsed = true;
				break;
			case "popupshown": 
				if (this.popup.collapsed)
					this.popup.collapsed = false;
				break;
			case "popuphiding": 
				this.log("close popup");	// #debug
				this._tab.linkedBrowser.removeEventListener("MozAfterPaint", this, false);
				this._tab.removeEventListener("TabAttrModified", this, false);
				this._timer.cancel();
				this._timer = null;
				this._resetPreview();
				this._resetTitle();
				this.popup.removeAttribute("style");
				this._tab = null;
				// [Firefox3.6] remember the last time when popup hid
				if (this._fx36)
					this._lastHidingTime = Date.now();
				break;
			case "MozAfterPaint": 
				this._shouldUpdatePreview = true;
				break;
			case "TabAttrModified": 
				this._shouldUpdateTitle = true;
				break;
			case "TabSelect": 
			case "TabClose": 
			case "draggesture": 
				if (event.target != this._tab)
					return;
				// when selecting / closing / dragging the current pointed tab...
				this._cancelDelayedOpen();
				this.popup.hidePopup();
				break;
			case "click": 
				this._performAction(this._branch.getCharPref("click." + event.button), event);
				break;
			case "dblclick": 
				// hide toolbar when double-clicking on spacer
				if (this.popup.getAttribute("_toolbardisplay") == "2" && 
				    event.button == 0 && event.target.localName == "spacer")
					document.getElementById("tabscope-toolbar").collapsed = true;
				break;
			case "DOMMouseScroll": 
				event.preventDefault();
				event.stopPropagation();
				var elt = this._elementFromPointOnPreview(event);
				elt.ownerDocument.defaultView.scrollByLines(event.detail);
				this._updatePreview();
				break;
			case "command": 
				this._performAction(event.target.id.replace(/^tabscope-|-button$/g, ""), event);
				break;
			case "transitionend": 
				this.log(event.type + " " + event.target.localName + " " + event.propertyName);	// #debug
				// ignore first width change, only handle second height change
				if (event.propertyName != "height")
					return;
				// to fix issue#23, check popup is already closed before transitionend
				if (!this._tab)
					return;
				// [Mac] XXX update preview before adjusting size, 
				// otherwise preview becomes blank for a quick moment
				if (this._mac)
					this._updatePreview();
				var canvas = this.canvas;
				canvas.width  = parseInt(canvas.style.width);
				canvas.height = parseInt(canvas.style.height);
				this._updatePreview();
				break;
		}
	},

	_delayedOpenPopup: function(aNoAutoHide) {
		if (!aNoAutoHide) {
			// if mouse pointer moves outside tab before callback...
			// if any other popup e.g. tab context menu is opened...
			var anotherPopupOpen;
			if (this._fx36)
				// [Firefox3.6] need to check each possible popup is open
				anotherPopupOpen = (
					document.getElementById("contentAreaContextMenu").state == "open" || 
					document.getElementById("toolbar-context-menu").state == "open" || 
					document.getElementById("allTabs-panel").state == "open" || 
					document.getAnonymousElementByAttribute(
						gBrowser, "anonid", "tabContextMenu").state == "open"
				);
			else
				anotherPopupOpen = !!document.popupNode;
			if (this._tab.parentNode.querySelector(":hover") != this._tab || anotherPopupOpen) {
				// don't open popup
				this._cancelDelayedOpen();
				return;
			}
		}
		this.popup.setAttribute("noautohide", aNoAutoHide.toString());
		this._timerId = null;
		var alignment = this._branch.getIntPref("popup_alignment");
		if (alignment == 0) {
			alignment = (gBrowser.mTabContainer.orient == "horizontal")
			          ? (gBrowser.boxObject.y < gBrowser.mTabContainer.boxObject.y ? 1 : 2)
			          : (gBrowser.boxObject.x < gBrowser.mTabContainer.boxObject.x ? 3 : 4);
		}
		// correct popup alignment
		// XXX if popup has never been opened, popup.boxObject.width and height are both 0
		// in that case, estimate popup size based on preview size
		var popup = this.popup.boxObject;
		var popupWidth  = popup.width  || this._branch.getIntPref("preview_width")  + 10;
		var popupHeight = popup.height || this._branch.getIntPref("preview_height") + 40;
		var tab = this._tab.boxObject;
		if (this._multiScreens) {
			// recalculate _availRect based on the current screen
			var svc = Cc["@mozilla.org/gfx/screenmanager;1"].getService(Ci.nsIScreenManager);
			var scr = svc.screenForRect(tab.screenX, tab.screenY, tab.width, tab.height);
			var left = {}, top = {}, width = {}, height = {};
			scr.GetAvailRect(left, top, width, height);
			this._availRect = {
				left: left.value, right: left.value + width.value,
				top: top.value, bottom: top.value + height.value
			};
		}
		switch (alignment) {
			case 1: 
				if (this._availRect.top > tab.screenY - popupHeight)
					alignment = 2;
				break;
			case 2: 
				if (this._availRect.bottom < tab.screenY + tab.height + popupHeight)
					alignment = 1;
				break;
			case 3: 
				if (this._availRect.left > tab.screenX - popupWidth)
					alignment = 4;
				break;
			case 4: 
				if (this._availRect.right < tab.screenX + tab.width + popupWidth)
					alignment = 3;
				break;
		}
		this.popup.setAttribute("_alignment", alignment.toString());
		// if popup alignment is top, place toolbar at the bottom of popup
		var toolbar = document.getElementById("tabscope-toolbar");
		toolbar.setAttribute(alignment == 1 ? "bottom" : "top", "0");
		toolbar.removeAttribute(alignment == 1 ? "top" : "bottom");
		// [Firefox3.6] bottom attribute has no effect, so adjust toolbar position later
		if (this._fx36)
			toolbar.setAttribute("top", "0");
		// adjust popup position before opening popup
		this._adjustPopupPosition(false);
		// [Mac][Linux] don't eat clicks while popup is open if popup is not for background monitor
		if (!aNoAutoHide)
			this.popup.popupBoxObject.setConsumeRollupEvent(Ci.nsIPopupBoxObject.ROLLUP_NO_CONSUME);
		if (this._multiScreens)
			// open popup at the corner of the current screen
			this.popup.openPopupAtScreen(this._availRect.left, this._availRect.top, false);
		else
			this.popup.openPopupAtScreen(0, 0, false);
	},

	_cancelDelayedOpen: function() {
		if (!this._timerId)
			return;
		this.log("--- cancel timer (" + this._timerId + ")");	// #debug
		window.clearTimeout(this._timerId);
		this._timerId = null;
		this._tab = null;
	},

	_adjustPopupPosition: function(aAnimate) {
		var alignment = parseInt(this.popup.getAttribute("_alignment"));
		// XXX if popup has never been opened, popup.boxObject.width and height are both 0
		// in that case, estimate popup size based on preview size
		var popup = this.popup.boxObject;
		var popupWidth  = popup.width  || this._branch.getIntPref("preview_width")  + 10;
		var popupHeight = popup.height || this._branch.getIntPref("preview_height") + 40;
		var tab = this._tab.boxObject;
		// determine screen coordinate whereto open popup
		var x, y;
		switch (alignment) {
			case 1: x = tab.screenX; y = tab.screenY - popupHeight; break;
			case 2: x = tab.screenX; y = tab.screenY + tab.height; break;
			case 3: y = tab.screenY; x = tab.screenX - popupWidth; break;
			case 4: y = tab.screenY; x = tab.screenX + tab.width; break;
		}
		// correct position to avoid popup auto-position
		x = Math.max(x, this._availRect.left);
		y = Math.max(y, this._availRect.top);
		x = Math.min(x, this._availRect.right  - popupWidth);
		y = Math.min(y, this._availRect.bottom - popupHeight);
		// correct 1px glitch of current tab
		if (alignment == 2 && this._tab == gBrowser.selectedTab) {
			var margin = parseInt(window.getComputedStyle(this._tab, null).marginBottom);
			if (margin < 0)
				y += margin;
		}
		if (this._multiScreens) {
			// correct position based on the current screen
			x -= this._availRect.left;
			y -= this._availRect.top;
		}
		// if position will be same as current, no need to move popup
		var lastX = parseInt(this.popup.style.marginLeft || 0);
		var lastY = parseInt(this.popup.style.marginTop  || 0);
		if (x == lastX && y == lastY)
			return;
		// XXX to fix popup flicker problem when transition starts just after transtion ends...
		// 1) add extremely small randomness to duration value
		// 2) calculate duration value with getComputedStyle
		var duration = 0;
		if (aAnimate) {
			var delta = Math.max(Math.abs(x - lastX), Math.abs(y - lastY));
			duration = Math.min(1, delta / 250) * this._branch.getIntPref("animate_move") / 1000;
			if (duration > 0)
				duration = Math.max(0.2, duration) + Math.random() * 0.001;
		}
		this.popup.style.MozTransitionDuration = duration.toString() + "s";
		window.getComputedStyle(this.popup, null).MozTransitionDuration;
		this.popup.style.marginLeft = x.toString() + "px";
		this.popup.style.marginTop  = y.toString() + "px";
		this.log("move popup (" + lastX + ", " + lastY + ") => (" + x + ", " + y + ") / " + duration);	// #debug
	},

	_adjustPreviewSize: function(aAnimate) {
		this.log("adjust preview size (" + aAnimate + ")");	// #debug
		var canvas = this.canvas;
		var width  = this._branch.getIntPref("preview_width");
		var height = this._branch.getIntPref("preview_height");
		if (this._zoomState) {
			var ratio = parseFloat(this._branch.getCharPref("zoom_ratio")) || 1.1;
			width  *= ratio;
			height *= ratio;
		}
		var duration = aAnimate ? this._branch.getIntPref("animate_zoom") / 1000 : 0;
		if (this._fx36 || duration == 0 || !this._zoomState) {
			// [Firefox3.6] update canvas size immediately without animation
			// when opening popup, update canvas size immediately
			// when starting zoom-in, update canvas size on transitionend event
			// when starting zoom-out, update canvas size immediately
			canvas.width = width;
			canvas.height = height;
		}
		// XXX hack to fix popup flicker problem @see _adjustPopupPosition
		duration += Math.random() * 0.001;
		canvas.style.MozTransitionDuration = duration.toString() + "s";
		window.getComputedStyle(canvas, null).MozTransitionDuration;
		canvas.style.width  = width.toString() + "px";
		canvas.style.height = height.toString() + "px";
		if (this._fx36) {
			// [Firefox3.6] emulate xul:stack child's bottom attribute
			var toolbar = document.getElementById("tabscope-toolbar");
			toolbar.width = width;
			var val = toolbar.getAttribute("bottom") ? height - 21 : 0;
			toolbar.style.marginTop = val.toString() + "px";
		}
	},

	_togglePreviewSize: function() {
		this._zoomState = !this._zoomState;
		this._adjustPreviewSize(true);
		// no need to update preview immediately when starting to zoom-in with animation
		// [Firefox3.6] update immeidately without animation
		if (!this._fx36 && this._zoomState && this._branch.getIntPref("animate_zoom") > 0)
			return;
		this._updatePreview();
	},

	_updatePreview: function() {
		this.log("update preview");	// #debug
		var canvas = this.canvas;
		var win = this._tab.linkedBrowser.contentWindow;
		var w = win.innerWidth;
		var scale = canvas.width / w;
		canvas._scale = scale;	// for later use
		var h = canvas.height / scale;
		var ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.save();
		ctx.scale(scale, scale);
		ctx.drawWindow(win, win.scrollX, win.scrollY, w, h, "rgb(255,255,255)");
		ctx.restore();
		// fade-to-white effect
		if (!this._branch.getBoolPref("fade_to_white"))
			return;
		var grad = ctx.createLinearGradient(0, canvas.height / 2, 0, canvas.height);
		grad.addColorStop(0, "rgba(255,255,255,0)");
		grad.addColorStop(1, "rgb(255,255,255)");
		ctx.fillStyle = grad;
		ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
	},

	_resetPreview: function() {
		var canvas = this.canvas;
		var ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		canvas.width = 0;
		canvas.height = 0;
	},

	_updateTitle: function() {
		this.log("update title");	// #debug
		var label = document.getElementById("tabscope-title");
		label.value = this._tab.label;
		label.setAttribute("tooltiptext", label.value);
		label.style.width = this._branch.getIntPref("preview_width").toString() + "px";
	},

	_resetTitle: function() {
		var label = document.getElementById("tabscope-title");
		label.value = "";
		label.removeAttribute("tooltiptext");
		label.style.width = "0px";
	},

	_updateToolbar: function() {
		if (document.getElementById("tabscope-toolbar").hidden)
			return;
		this.log("update toolbar");	// #debug
		document.getElementById("tabscope-toolbar").collapsed = false;
		var browser = this._tab.linkedBrowser;
		document.getElementById("tabscope-back-button").disabled = !browser.canGoBack;
		document.getElementById("tabscope-forward-button").disabled = !browser.canGoForward;
		var button = document.getElementById("tabscope-reload-button");
		if (!button.hidden)
			button.setAttribute("_loading", browser.webProgress.isLoadingDocument);
		button = document.getElementById("tabscope-pin-button");
		if (!button.hidden)
			button.setAttribute("_active", this._tab.pinned);
		button = document.getElementById("tabscope-zoom-button");
		if (!button.hidden)
			button.setAttribute("_active", this._zoomState);
	},

	_performAction: function(aCommand, event) {
		switch (aCommand) {
			case "select" : gBrowser.selectedTab = this._tab; return;
			case "hide"   : this.popup.hidePopup(); return;
			case "back"   : this._tab.linkedBrowser.goBack(); break;
			case "forward": this._tab.linkedBrowser.goForward(); break;
			case "reload" : 
				event.target.getAttribute("_loading") == "true" ? 
				this._tab.linkedBrowser.stop() : this._tab.linkedBrowser.reload();
				break;
			case "pin"    : 
				gBrowser[this._tab.pinned ? "unpinTab" : "pinTab"](this._tab);
				this._adjustPopupPosition(true);
				break;
			case "zoom"   : this._togglePreviewSize(); break;
			case "alltabs": allTabs.open(); this.popup.hidePopup(); return;
			case "groups" : TabView.toggle(); this.popup.hidePopup(); return;
			case "close"  : gBrowser.removeTab(this._tab, { animate: true }); return;
			case "emulate": 
				var elt = this._elementFromPointOnPreview(event);
				var evt = elt.ownerDocument.createEvent("MouseEvents");
				evt.initMouseEvent(
					event.type, true, true, elt.ownerDocument.defaultView, event.detail,
					0, 0, 0, 0,
					event.ctrlKey, event.altKey, event.shiftKey, event.metaKey,
					0, null
				);
				elt.dispatchEvent(evt);
				return;
			default: return;
		}
		// update title and toolbar immediately after back/forward/reload/stop/pin/zoom
		this._updateTitle();
		this._updateToolbar();
	},

	_ensureTabIsRestored: function() {
		if (!this._branch.getBoolPref("unloaded_tab"))
			return;
		// [BarTab]
		if ("BarTabHandler" in gBrowser)
			gBrowser.BarTabHandler.loadTab(this._tab);
		// [Firefox3.6] TAB_STATE_NEEDS_RESTORE is unsupported
		if (this._fx36)
			return;
		if (this._tab.linkedBrowser.__SS_restoreState == 1)
			this._tab.linkedBrowser.reload();
	},

	_elementFromPointOnPreview: function(event) {
		// get real position
		var rect = this.canvas.getBoundingClientRect();
		var x = (event.clientX - rect.left) / this.canvas._scale;
		var y = (event.clientY - rect.top)  / this.canvas._scale;
		// get real element
		var win = this._tab.linkedBrowser.contentWindow;
		var elt = win.document.elementFromPoint(x, y);
		// fix issue#6 cannot send click event if target is outside of the viewport
		if (!elt)
			elt = win.QueryInterface(Ci.nsIInterfaceRequestor).
			      getInterface(Ci.nsIDOMWindowUtils).
			      elementFromPoint(x, y, true, false);
		if (!elt)
			elt = win.document.body || win.document.documentElement;
		while (/^i?frame$/.test(elt.localName.toLowerCase())) {
			x -= elt.getBoundingClientRect().left;
			y -= elt.getBoundingClientRect().top;
			elt = elt.contentDocument.elementFromPoint(x, y);
		}
		return elt;
	},

	notify: function(aTimer) {
		var shouldClosePopup;
		var hovering = this._branch.getBoolPref("popup_hovering");
		var onPopup = this.popup.parentNode.querySelector(":hover") == this.popup;
		var onTab = this._tab.parentNode.querySelector(":hover") == this._tab;
		if (this.popup.getAttribute("noautohide") == "true")
			// [backmonitor] close popup if hovering over popup despite hovering is disabled
			// [backmonitor] close popup if window is minimized
			shouldClosePopup = !hovering && onPopup || window.windowState == 2;
		else
			// if hovering is enabled, close popup if not hovering over tab and popup
			// if hovering is disabled, close popup if not hovering over tab
			shouldClosePopup = hovering ? !onTab && !onPopup : !onTab;
		if (shouldClosePopup) {
			this.log("*** close popup with delay");	// #debug
			this.popup.hidePopup();
			return;
		}
		if (this._shouldUpdatePreview) {
			this._shouldUpdatePreview = false;
			this._updatePreview();
		}
		// [Firefox3.6] always update title since TabAttrModified event is unsupported
		if (this._fx36 || this._shouldUpdateTitle) {
			this._shouldUpdateTitle = false;
			this._updateTitle();
		}
		var toolbar = document.getElementById("tabscope-toolbar");
		if (this.popup.getAttribute("_toolbardisplay") == "1" || 
		    toolbar.parentNode.querySelector(":hover") == toolbar)
			// if toolbar display is autohide, update toolbar only when hovering over it
			this._updateToolbar();
		this._adjustPopupPosition(true);
	},

	log: function(aText) {
		dump("tabscope> " + aText + "\n");
	},

};


window.addEventListener("load", function() { TabScope.init(); }, false);
window.addEventListener("unload", function() { TabScope.uninit(); }, false);


