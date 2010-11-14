var TabScope = {

	// xul:panel element
	popup: null,

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

	init: function() {
		this.popup = document.getElementById("tabscope-popup");
		this._branch = Services.prefs.getBranch("extensions.tabscope.");
		// disable default tooltip of tabs
		gBrowser.mTabContainer.tooltip = null;
		gBrowser.mTabContainer.mTabstrip.addEventListener("mouseover", this, false);
		gBrowser.mTabContainer.mTabstrip.addEventListener("mousemove", this, false);
		gBrowser.mTabContainer.mTabstrip.addEventListener("mouseout", this, false);
		gBrowser.mTabContainer.addEventListener("TabSelect", this, false);
		gBrowser.mTabContainer.addEventListener("TabClose", this, false);
		gBrowser.mTabContainer.addEventListener("draggesture", this, false);
	},

	uninit: function() {
		this._cancelDelayedOpen();
		NS_ASSERT(this._timer === null, "timer is not cancelled.");
		gBrowser.mTabContainer.removeEventListener("TabSelect", this, false);
		gBrowser.mTabContainer.removeEventListener("TabClose", this, false);
		gBrowser.mTabContainer.removeEventListener("draggesture", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mouseover", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mousemove", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mouseout", this, false);
		this._branch = null;
		this.popup = null;
		this._tab = null;
	},

	handleEvent: function(event) {
//		var rel = event.relatedTarget ? event.relatedTarget.localName : "null";
//		this.log([event.type, event.target.localName, rel].join("\t"));
		switch (event.type) {
			case "mouseover": 
				// when mouse pointer moves inside a tab...
				// when hovering on tab strip...
				// (includes outside corner edge of a tab, new tab button and tab scroller)
				if (event.target == this._tab || event.target.localName != "tab")
					// do nothing, keep popup open if it is opened
					return;
				// when mouse pointer moves from one tab to another before popup will open...
				// cancel opening popup and restart timer in the following process
				this._cancelDelayedOpen();
				if (!this._tab) {
					// when hovering on a tab...
					// popup is currently closed, so open it with delay
					this._tab = event.target;
					var callback = function(self) { self._delayedOpenPopup(); };
					var delay = this._branch.getIntPref("popup_delay");
					this._timerId = window.setTimeout(callback, delay, this);
					this.log("--- start timer (" + this._timerId + ")");
				}
				else {
					// when mouse pointer moves from one tab to another...
					// popup is already opened, so move it now
					this._tab.linkedBrowser.removeEventListener("MozAfterPaint", this, false);
					this._tab.removeEventListener("TabAttrModified", this, false);
					this._tab = event.target;
					this._tab.linkedBrowser.addEventListener("MozAfterPaint", this, false);
					this._tab.addEventListener("TabAttrModified", this, false);
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
				// when mouse pointer moves from one tab to another, restart timer to open popup
				this._cancelDelayedOpen();
				this._tab = event.target;
				var callback = function(self) { self._delayedOpenPopup(); };
				var delay = this._branch.getIntPref("popup_delay");
				this._timerId = window.setTimeout(callback, delay, this);
				this.log("--- start timer again (" + this._timerId + ")");
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
				// since popup boxObject holds its size and position even if it is closed,
				// should test with popup boxObject only if popup is open
				if (this._branch.getBoolPref("hovering") && this.popup.state == "open") {
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
				this.log("open popup");
				this._tab.linkedBrowser.addEventListener("MozAfterPaint", this, false);
				this._tab.addEventListener("TabAttrModified", this, false);
				this._shouldUpdatePreview = false;
				this._shouldUpdateTitle = false;
				this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
				this._timer.initWithCallback(this, 500, Ci.nsITimer.TYPE_REPEATING_SLACK);
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
				// @see comment in _adjustPopupPosition
				var alignment = parseInt(this.popup.getAttribute("popup_alignment"));
				if (alignment == 1 || alignment == 3)
					this._adjustPopupPosition(false);
				break;
			case "popuphiding": 
				this.log("close popup");
				this._tab.linkedBrowser.removeEventListener("MozAfterPaint", this, false);
				this._tab.removeEventListener("TabAttrModified", this, false);
				this._timer.cancel();
				this._timer = null;
				this._resetPreview();
				this._resetTitle();
				this.popup.removeAttribute("style");
				this._tab = null;
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
				switch (event.button) {
					case 0: gBrowser.selectedTab = this._tab; break;
					case 1: this.popup.hidePopup(); break;
					case 2: break;
				}
				break;
			case "command": 
				switch (event.target.id.replace(/^tabscope-|-button$/g, "")) {
					case "back"   : this._tab.linkedBrowser.goBack(); break;
					case "forward": this._tab.linkedBrowser.goForward(); break;
					case "reload" : this._tab.linkedBrowser.reload(); break;
					case "stop"   : this._tab.linkedBrowser.stop(); break;
					case "pin"    : 
						this._tab.pinned ? gBrowser.unpinTab(this._tab)
						                 : gBrowser.pinTab(this._tab);
						this.popup.hidePopup();
						return;
					case "alltabs": allTabs.open(); this.popup.hidePopup(); return;
					case "groups" : TabView.toggle(); this.popup.hidePopup(); return;
					case "close"  : gBrowser.removeTab(this._tab); return;
					default: NS_ASSERT(false, "unknown command: " + event.target.id); return;
				}
				// update title and toolbar immediately after back/forward/reload/stop
				this._updateTitle();
				this._updateToolbar();
				break;
		}
	},

	_delayedOpenPopup: function() {
		// if mouse pointer moves outside tab before callback...
		// if any other popup e.g. tab context menu is opened...
		if (this._tab.parentNode.querySelector(":hover") != this._tab || document.popupNode) {
			// don't open popup
			this._cancelDelayedOpen();
			return;
		}
		this._timerId = null;
		// if popup_alignment is top, place toolbar at the bottom of popup
		var alignment = this._branch.getIntPref("popup_alignment");
		this.popup.setAttribute("popup_alignment", alignment.toString());
		var toolbar = document.getElementById("tabscope-toolbar");
		toolbar.setAttribute(alignment == 1 ? "bottom" : "top", "0");
		toolbar.removeAttribute(alignment == 1 ? "top" : "bottom");
		// adjust popup position before opening popup
		this._adjustPopupPosition(false);
		// [Mac][Linux] don't eat clicks while popup is open
		this.popup.popupBoxObject.setConsumeRollupEvent(Ci.nsIPopupBoxObject.ROLLUP_NO_CONSUME);
		this.popup.openPopupAtScreen(0, 0, false);
	},

	_cancelDelayedOpen: function() {
		if (!this._timerId)
			return;
		this.log("--- cancel timer (" + this._timerId + ")");
		window.clearTimeout(this._timerId);
		this._timerId = null;
		this._tab = null;
	},

	_adjustPopupPosition: function(aAnimate) {
		// note that popup.boxObject.width and .height are 0px if popup has never been opened
		// to fix wrong positioning, call _adjustPopupPosition in popupshown event handler
		var box = this._tab.boxObject;
		var x, y;
		switch (parseInt(this.popup.getAttribute("popup_alignment"))) {
			case 1: x = box.screenX; y = box.screenY - this.popup.boxObject.height; break;
			case 2: x = box.screenX; y = box.screenY + box.height; break;
			case 3: y = box.screenY; x = box.screenX - this.popup.boxObject.width; break;
			case 4: y = box.screenY; x = box.screenX + box.width;  break;
		}
		// correct position to avoid popup auto-position
		x = Math.max(x, 0);
		y = Math.max(y, 0);
		var lastX = parseInt(this.popup.style.marginLeft || 0);
		var lastY = parseInt(this.popup.style.marginTop  || 0);
		if (x == lastX && y == lastY)
			// no need to change popup position
			return;
		// XXX to fix popup flicker problem when transition starts just after transtion ends...
		// 1) add extremely small randomness to duration value
		// 2) calculate duration value with getComputedStyle
		var duration = 0;
		if (aAnimate) {
			var delta = Math.max(Math.abs(x - lastX), Math.abs(y - lastY));
			duration = delta * this._branch.getIntPref("animate") / 1000;
			if (duration > 0)
				duration = Math.max(0.2, duration) + Math.random() * 0.001;
		}
		this.popup.style.MozTransitionDuration = duration.toString() + "s";
		window.getComputedStyle(this.popup, null).MozTransitionDuration;
		this.popup.style.marginLeft = x.toString() + "px";
		this.popup.style.marginTop  = y.toString() + "px";
		this.log("move popup (" + lastX + ", " + lastY + ") => (" + x + ", " + y + ") / " + duration);
	},

	_updatePreview: function() {
		this.log("update preview");
		var canvas = document.getElementById("tabscope-preview");
		canvas.width  = this._branch.getIntPref("preview_width");
		canvas.height = this._branch.getIntPref("preview_height");
		var win = this._tab.linkedBrowser.contentWindow;
		var w = win.innerWidth;
		var scale = canvas.width / w;
		var h = canvas.height / scale;
		var ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.save();
		ctx.scale(scale, scale);
		ctx.drawWindow(win, win.scrollX, win.scrollY, w, h, "rgb(255,255,255)");
		ctx.restore();
		// fade-to-white effect
		var grad = ctx.createLinearGradient(0, canvas.height / 2, 0, canvas.height);
		grad.addColorStop(0, "rgba(255,255,255,0)");
		grad.addColorStop(1, "rgb(255,255,255)");
		ctx.fillStyle = grad;
		ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
	},

	_resetPreview: function() {
		var canvas = document.getElementById("tabscope-preview");
		var ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		canvas.width = 0;
		canvas.height = 0;
	},

	_updateTitle: function() {
		this.log("update title");
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
		if (!this._branch.getBoolPref("hovering"))
			return;
		this.log("update toolbar");
		var browser = this._tab.linkedBrowser;
		document.getElementById("tabscope-back-button").disabled = !browser.canGoBack;
		document.getElementById("tabscope-forward-button").disabled = !browser.canGoForward;
		var loading = browser.webProgress.isLoadingDocument;
		document.getElementById("tabscope-reload-button").hidden = loading;
		document.getElementById("tabscope-stop-button").hidden = !loading;
	},

	notify: function(aTimer) {
		// check mouse pointer is hovering over tab, otherwise close popup
		if (this._tab.parentNode.querySelector(":hover") != this._tab && 
		    this.popup.parentNode.querySelector(":hover") != this.popup) {
			this.log("*** close popup with delay");
			this.popup.hidePopup();
			return;
		}
		if (this._shouldUpdatePreview) {
			this._shouldUpdatePreview = false;
			this._updatePreview();
		}
		if (this._shouldUpdateTitle) {
			this._shouldUpdateTitle = false;
			this._updateTitle();
		}
		var toolbar = document.getElementById("tabscope-toolbar");
		if (toolbar.parentNode.querySelector(":hover") == toolbar)
			// update toolbar only when hovering over it
			this._updateToolbar();
		this._adjustPopupPosition(true);
	},

	log: function(aText) {
		dump("tabscope> " + aText + "\n");
	},

};


window.addEventListener("load", function() { TabScope.init(); }, false);
window.addEventListener("unload", function() { TabScope.uninit(); }, false);


