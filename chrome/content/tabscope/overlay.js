var TabScope = {

	popup: null,

	// the tab which the mouse cursor currently points to
	_tab: null,

	init: function() {
		this.popup = document.getElementById("tabscope-popup");
		this.popup.addEventListener("transitionend", this, false);
		// disable default tooltip of tabs
		gBrowser.mTabContainer.tooltip = null;
		gBrowser.mTabContainer.mTabstrip.addEventListener("mouseover", this, false);
		gBrowser.mTabContainer.mTabstrip.addEventListener("mouseout", this, false);
	},

	uninit: function() {
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mouseover", this, false);
		gBrowser.mTabContainer.mTabstrip.removeEventListener("mouseout", this, false);
		this.popup.removeEventListener("transitionend", this, false);
		this.popup = null;
		this._tab = null;
	},

	handleEvent: function(event) {
//		var rel = event.relatedTarget ? event.relatedTarget.localName : "null";
//		this.log([event.type, event.target.localName, rel].join("\t"));
		switch (event.type) {
			case "mouseover": 
				// do nothing when hovering on tab strip except tabs
				// i.e. corner edge of a tab, new tab button, scroller
				if (event.target.localName != "tab")
					return;
				// popup is currently closed, so open it now
				if (!this._tab) {
					this.log("*** open popup");
					this._tab = event.target;
					this._adjustPopupPosition();
					// [Mac][Linux] don't eat click event when the popup is open
					this.popup.popupBoxObject.setConsumeRollupEvent(Ci.nsIPopupBoxObject.ROLLUP_NO_CONSUME);
					this.popup.openPopupAtScreen(0, 0, false);
					return;
				}
				// adjust popup position when moving from one tab to another
				if (event.target != this._tab) {
					this.log("*** move popup");
					this._tab = event.target;
					this.popup.style.MozTransitionDuration = "0.5s";
					this._adjustPopupPosition();
					return;
				}
				// do nothing when moving inside a tab
				break;
			case "mouseout": 
//				if (event.relatedTarget == this.popup)
//					return;
				// close popup when moving outside tab strip
				var box = gBrowser.mTabContainer.mTabstrip.boxObject;
				if (event.screenX <= box.screenX || box.screenX + box.width  <= event.screenX || 
				    event.screenY <= box.screenY || box.screenY + box.height <= event.screenY)
					this.popup.hidePopup();
				break;
			case "popuphiding": 
				this.log("*** close popup");
				this.popup.removeAttribute("style");
				this._tab = null;
				break;
			case "transitionend": 
				// XXX fix popup flicker problem when transition starting just after transtionend
				this.popup.style.MozTransitionDuration = "0s";
				break;
		}
	},

	_adjustPopupPosition: function() {
		var box = this._tab.boxObject;
		var x = box.screenX;
		var y = box.screenY + box.height;
		// [Windows] XXX fix 1px height glitch of selected tab compared to others
		if (navigator.platform == "Win32" && this._tab.selected)
			y--;
		this.popup.style.marginLeft = Math.max(x, 0) + "px";
		this.popup.style.marginTop  = Math.max(y, 0) + "px";
		this.log(this.popup.style.marginLeft + ", " + this.popup.style.marginTop);
	},

	log: function(aMsg) {
		dump("tabscope> " + aMsg + "\n");
	},

};


window.addEventListener("load", function() { TabScope.init(); }, false);
window.addEventListener("unload", function() { TabScope.uninit(); }, false);


