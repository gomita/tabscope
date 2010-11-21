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

	// avail rectangle in screen
	_availRect: null,

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
		// cache avail rect
		var svc = Cc["@mozilla.org/gfx/screenmanager;1"].getService(Ci.nsIScreenManager);
		var left = {}, top = {}, width = {}, height = {};
		svc.primaryScreen.GetAvailRect(left, top, width, height);
		this._availRect = {
			left: left.value, right: left.value + width.value,
			top: top.value, bottom: top.value + height.value
		};
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
		this._availRect = null;
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
		this.popup.setAttribute("popup_alignment", alignment.toString());
		// if popup alignment is top, place toolbar at the bottom of popup
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
		var alignment = parseInt(this.popup.getAttribute("popup_alignment"));
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
		var lastX = parseInt(this.popup.style.marginLeft || 0);
		var lastY = parseInt(this.popup.style.marginTop  || 0);
		// correct 1px glitch of current tab
		if (alignment == 2 && this._tab == gBrowser.selectedTab) {
			var margin = parseInt(window.getComputedStyle(this._tab, null).marginBottom);
			if (margin < 0)
				y += margin;
		}
		// if position will be same as current, no need to move popup
		if (x == lastX && y == lastY)
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


