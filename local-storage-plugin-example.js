(function ($) {
	var a = amplify;

	a.subscribe("aboutToSave", function (action, post_data) {

		post_data.post_format = $('input.post-format:checked').attr("id");
	});

	a.subscribe("showBackup", function (action, post_data) {

		console.log(post_data.post_format);
		$("input.post-format")
			.filter("[value=" + post_data.post_format + "]")
				.prop("checked", true);
	});
	
	
}(jQuery));
