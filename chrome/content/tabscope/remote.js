let TabScopeRemote = {

	init: function() {
		addMessageListener("TabScope:OpenPopup", this);
		addMessageListener("TabScope:ClosePopup", this);
		addMessageListener("TabScope:Preview", this);
		addMessageListener("TabScope:Scroll", this);
		addMessageListener("TabScope:Emulate", this);
	},

	receiveMessage: function(aMsg) {
		this.log(aMsg.name + "\t" + aMsg.data.toSource());	// #debug
		switch (aMsg.name) {
			case "TabScope:OpenPopup": 
				break;
			case "TabScope:ClosePopup": 
				break;
			case "TabScope:Preview": 
				this._updatePreview(aMsg.data);
				break;
			case "TabScope:Scroll": 
				this._scrollWindow(aMsg.data);
				break;
			case "TabScope:Emulate": 
				this._emulateEvent(aMsg.data);
				break;
			default: 
				this.log("unknown message: " + aMsg.toSource());	// #debug
		}
	},

	// aData = {
	//   id: sequential number,
	//   action: any of "" | "zoom-in:begin" | "zoom-in:end" | "zoom-out:begin" | "zoom-out:end"
	//   width: preview width in px,
	//   height: preview height in px,
	// }
	_updatePreview: function(aData) {
		// [ToDo] should reuse in-memory canvas element for the same document?
		let canvas = content.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
		canvas.mozImageSmoothingEnabled = true;
		canvas.width  = aData.width;
		canvas.height = aData.height;
		let win = content.window;
		let w = win.innerWidth;
		let scale = canvas.width / w;
		let h = canvas.height / scale;
		let ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.save();
		ctx.scale(scale, scale);
		ctx.drawWindow(win, win.scrollX, win.scrollY, w, h, "rgb(255,255,255)");
		ctx.restore();
		sendAsyncMessage("TabScopeRemote:Response", {
			id     : aData.id,
			action : aData.action,
			width  : aData.width,	// #debug
			height : aData.height,	// #debug
			imgData: ctx.getImageData(0, 0, canvas.width, canvas.height),
			scale  : scale,
		});
	},

	// aData = {
	//   id: sequential number,
	//   x: horizontal position to scroll in px,
	//   y: vertical position to scroll in px,
	//   lines: the number of lines to scroll the document by,
	// }
	_scrollWindow: function(aData) {
		let elt = this._elementFromPoint(aData.x, aData.y);
		elt.ownerDocument.defaultView.scrollByLines(aData.lines);
	},

	// aData = {
	//   id: sequential number,
	//   x: horizontal position to click in px,
	//   y: vertical position to click in px,
	//   type    : event.type,
	//   detail  : event.detail,
	//   ctrlKey : event.ctrlKey,
	//   altKey  : event.altKey,
	//   shiftKey: event.shiftKey,
	//   metaKey : event.metaKey,
	// }
	_emulateEvent: function(aData) {
		let elt = this._elementFromPoint(aData.x, aData.y);
		let evt = elt.ownerDocument.createEvent("MouseEvents");
		evt.initMouseEvent(
			aData.type, true, true, elt.ownerDocument.defaultView, aData.detail,
			0, 0, 0, 0,
			aData.ctrlKey, aData.altKey, aData.shiftKey, aData.metaKey,
			0, null
		);
		elt.dispatchEvent(evt);
	},

	_elementFromPoint: function(x, y) {
		let elt = content.document.elementFromPoint(x, y);
		// fix issue#6 cannot send click event if target is outside of the viewport
		if (!elt) {
			const Ci = Components.interfaces;
			elt = content.window.QueryInterface(Ci.nsIInterfaceRequestor).
			      getInterface(Ci.nsIDOMWindowUtils).
			      elementFromPoint(x, y, true, false);
		}
		if (!elt)
			elt = content.document.body || content.document.documentElement;
		while (/^i?frame$/.test(elt.localName.toLowerCase())) {
			x -= elt.getBoundingClientRect().left;
			y -= elt.getBoundingClientRect().top;
			elt = elt.contentDocument.elementFromPoint(x, y);
		}
		return elt;
	},

	log: function(aText) {
		// dump("tabscope:remote> " + aText + "\n");
		Components.utils.import("resource://gre/modules/Services.jsm");
		Services.console.logStringMessage("TabScopeRemote> " + aText);
	},

};

TabScopeRemote.init();

