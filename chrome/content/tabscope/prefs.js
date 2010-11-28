var PrefsUI = {

	_beforeInit: true,

	init: function() {
		this._beforeInit = false;
		// populate Left/Middle/Right-click menus
		var popup = document.getElementById("commands-popup");
		for (var i = 0; i < 3; i++) {
			var list = document.getElementsByAttribute("preference", "click." + i)[0];
			list.appendChild(popup.cloneNode(true));
			list.value = list.value;
		}
		this.readAnimatePref("animate_move");
		this.readAnimatePref("animate_zoom");
	},

	readAnimatePref: function(aPrefName) {
		var pref  = document.getElementById(aPrefName);
		var check = document.querySelector("[_uigroup='" + aPrefName + "'] > checkbox");
		var scale = document.querySelector("[_uigroup='" + aPrefName + "'] > scale");
		check.checked = pref.value > 0;
		scale.value = (pref.value > 0 ? pref.value : pref.defaultValue) / 100;
		scale.disabled = pref.value == 0;
	},

	writeAnimatePref: function(aPrefName) {
		// ignore scale's change event before onload
		if (this._beforeInit)
			return;
		var pref  = document.getElementById(aPrefName);
		var check = document.querySelector("[_uigroup='" + aPrefName + "'] > checkbox");
		var scale = document.querySelector("[_uigroup='" + aPrefName + "'] > scale");
		pref.value = check.checked ? scale.value * 100 : 0;
		this.readAnimatePref(aPrefName);
	},

	readHoveringPref: function() {
		var enabled = document.getElementById("hovering").value;
		var selector = "[_uigroup='hovering'] :-moz-any(label, menulist)";
		Array.forEach(document.querySelectorAll(selector), function(elt) {
			if (enabled)
				elt.removeAttribute("disabled");
			else
				elt.setAttribute("disabled", "true");
		});
	},

};


