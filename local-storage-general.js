(function ($) {
	var isOnline = true,
		a = amplify,
		lastSyncDate = a.store("lastSyncDate");

	$(document).ready(function () {


		autosaveSynced = function (response) {

			var res = lsBackupParseResponse(response, 'autosave');

		};

		lsBackupParseResponse = function (response, action) {
			action = typeof (action) === 'undefined' ? 'autosave' : action;

			var res = wpAjax.parseAjaxResponse(response, 'ls_backup_' + action),
	   			message, postID, sup,
				ID;

			if (res && res.responses && res.responses.length) {
				message = res.responses[0].data;
				ID = parseInt(res.responses[0].id, 10);
				if (!isNaN(ID) && ID > 0) {
					lsRemovePost(ID, action);
				} else if (ID === 0) {
					lsRemovePost(parseInt(res.responses[0].supplemental.old_id, 10), action);
				}
			}

			if (message) {

				$('.autosave-message').html(message);
			}

			return res;
		};

		saveSynced = function (response) {

			var res = lsBackupParseResponse(response, 'save');

		};
		publishSynced = function (response) {

			var res = lsBackupParseResponse(response, 'publish');

		};

		toSync = function (actions) {

			var sync = false,
				i = 0,
				actionList;

			if ($.isArray(actions)) {

				for (i; i < actions.length; i += 1) {

					actionList = a.store(actions[i]);
					sync = sync || (typeof (actionList) !== 'undefined' 
							&& actionList.length);

				}

			} else {

				actionList = a.store(actions);
				sync = typeof (actionList) !== 'undefined' && actionList.length;

			}


			return sync;
		};

		lsRemovePost = function (id, action) {

			a.publish("removingPost", id, action);
			a.store(id + '-' + action, null);
			var list = a.store(action);
			list.splice(list.indexOf(id).toString(), 1);
			a.store(action, list);

		};

		lsSync = function (action, list) {

			list = typeof (list) !== 'undefined' ? list : a.store(action);
			var i, callback, post_data;

			a.publish("aboutToSync", action, list);

			if (action === 'autosave') {
				callback = autosaveSynced;
			} else if (action === 'save') {
				callback = saveSynced;
			} else {
				callback = publishSynced;
			}

			if (typeof (list) !== 'undefined') {
				for (i = 0; i < list.length; i++) {

					post_data = a.store(list[i] + '-' + action);
					a.publish("aboutToSync", action, post_data);
					if (post_data.user_ID === userSettings.uid) {
						$.ajax({
							data: post_data,
							type: "POST",
							url: ajaxurl,
							timeout : 10000,
							success: callback
						});
					}
				}
			}
		};

		lsBuildUrl = function (id, action, post) {

			var url = lsl10.post_edit_url;

			url += "?post=" + id;
			url += "&action=edit";
			url += "&backup=" + action;
			if (post.post_type !== "post" && post.post_type !== "page")
				url += "&post_type=" + post.post_type;

			return url;
		};

		lsBuildNotice = function (id, action, post) {
			var	msg  = '<p>';
			if (onEditor && post.post_ID == $("#post_ID").val()) {
				if (action === 'publish') {
					msg += lsl10.curr_post; 
				} else {
					msg += lsl10.curr_autosave;
				}
			} else {

				msg += lsl10.publish_post.replace("%s", post.post_title); 
			}
				msg += '</p>';

				$msg = $(msg).wrap('<div class="updated" />').parent();
				$msg.children('p')
					.append('<a href="#" class="ls-sync">' + lsl10.publish + '</a> ')
					.append('<a href="' + lsBuildUrl(id, action, post) + '"class="ls-show" id="ls-show-' + action + '-' + id + '">' + lsl10.show + '</a> ')
					.append('<a href="#" class="ls-delete">' + lsl10.del + '</a> ');

				$msg.find('.ls-sync, .ls-delete, .ls-show')
					.data({'post': post.post_ID, 'action': action});

				$("#wpcontent").prepend($msg);

			
		};

		onEditor = (window.location.href.indexOf(lsl10.post_edit_url) !== -1);

		if (toSync(['publish'])) {

			var list = a.store('publish'), msg, $msg, i, post;


			for (i = 0; i < list.length; i++) {

				post = a.store(list[i] + '-publish');
				lsBuildNotice(post.post_ID, 'publish', post);
			}
		}

		if (toSync(['save', 'autosave'])) {
			//a.publish("aboutToSync");
			if (!onEditor) {

				lsSync('autosave');
				lsSync('save');
			} else {
				if (a.store('autosave').indexOf($('#post_ID').val()) !== -1) {
					lsBuildNotice($("#post_ID").val(), 'autosave', a.store($("#post_ID").val() + '-autosave'));
				}
			}
		}

		$(".ls-show").click(function (e) {
			if ($(this).data('post') == $("#post_ID").val()) {

				
				lsShowBackup($(this).data('action'), $(this).data('post'));
				//lsRemovePost($(this).data('post'), $(this).data('action')); 

				$(this).parents('.updated').remove();
				e.preventDefault();
			}
			return true;

		});

		$('.ls-sync').click(function (e) {

			lsSync('publish', [$(this).data('post')]);
			$(this).parents('.updated').remove();

		});

		$('.ls-delete').click(function (e) {

			lsRemovePost($(this).data('post'), 'publish');
			$(this).parents('.updated').remove();

		});

	});

}(jQuery));
