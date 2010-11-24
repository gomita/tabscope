var PrefsUI = {

	init: function() {
		// populate Left/Middle/Right-click menus
		var popup = document.getElementById("commands-popup");
		for (var i = 0; i < 3; i++) {
			var list = document.getElementsByAttribute("preference", "click." + i)[0];
			list.appendChild(popup.cloneNode(true));
			list.value = list.value;
		}
	},

	readAnimatePref: function(aRadioGroup) {
		var val = document.getElementById(aRadioGroup.getAttribute("preference")).value;
		// update checkbox
		var checkbox = aRadioGroup.getElementsByTagName("checkbox")[0];
		checkbox.checked = val > 0;
		// update radio buttons
		Array.forEach(aRadioGroup.getElementsByTagName("radio"), function(radio) {
			if (val > 0)
				radio.removeAttribute("disabled");
			else
				radio.setAttribute("disabled", "true");
			if (radio.value == val)
				aRadioGroup.selectedItem = radio;
		});
	},

	writeAnimatePref: function(aRadioGroup) {
		var checkbox = aRadioGroup.getElementsByTagName("checkbox")[0];
		return checkbox.checked ? aRadioGroup.selectedItem.value : 0;
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


