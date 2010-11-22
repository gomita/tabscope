var PrefsUI = {

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

};


