(function ($) {
	var backupLast = '',
		isOnline = true,
		a = amplify,
		connectPeriodical,
		lastSyncDate = a.store("lastSyncDate");

	$(document).ready(function () {

		lsShowBackup = function (action, id) {

			var post_data = a.store(id + '-' + action),
				rich = (typeof tinyMCE !== "undefined") && tinyMCE.activeEditor 
						&& !tinyMCE.activeEditor.isHidden(),
				goodcats,
				ed = tinyMCE.activeEditor;
		
			$("#title").val(post_data.post_title);
			ed.setContent(post_data.content, {format: 'raw'});
			$(document).triggerHandler('wpcountwords', [post_data.content]);

			if (post_data.post_name) {
				$("#post_name").val(post_data.post_name);
			}

			goodcats = post_data.catslist.split(",");
		
			$('input[name|="post_category[]"]').each(function (i) {

				if ($.inArray($(this).val(), goodcats) >= 0) {
					$(this).prop('checked', true);
				} else {
					$(this).prop('checked', false);
				}
			});

			if (post_data.comment_status === 'open') {
				$("#comment_status").prop("checked", true);
			}

			if (post_data.ping_status === 'open') {
			$("#ping_status").prop("checked", true);
			}

			if (post_data.excerpt) {
				$("#excerpt").val(post_data.excerpt);
			}

			if (post_data.post_author) {
				$("#post_author").val(post_data.post_author);
			}

			if (post_data.parent_id) {
				$("#parent_id").val(post_data.parent_id);
			}

			$("#user_ID").val(post_data.user_ID);

			$("input[name=visibility]")
				.filter("[value=" + post_data.visibility + "]")
					.prop("checked", true);
			if (post_data.visibility === 'password') {
				$("#post_password").val(post_data.post_password);
			} 

			$("#post_status").children()
				.filter("[value=" + post_data.post_status + "]")
					.prop("checked", true);

			if(typeof (post_data.aa) !== "undefined") {

				attemptedDate = new Date( post_data.aa, post_data.mm - 1, 
						post_data.jj, post_data.hh, post_data.mn );
				var now = new Date();

				if (attemptedDate > now && post_data.post_status === "future") {

					var time = ['aa', 'mm', 'jj', 'hh', 'mn', 'ss'];
					for (var i = 0; i < time.length; i++) {

						$("#" + time[i]).val(post_data[time[i]]);
					}
				}

				a.publish("showBackup", action, post_data);

				updateText();
				
			}



		};

		var useBackup = wpAjax.unserialize(window.location.search).backup,
			$form;
		if (useBackup) {

			tinyMCE.onAddEditor.add(function (ed) {
				ed.activeEditor.onInit.add(function (ed) {
					lsShowBackup(useBackup, $("#post_ID").val());
				});
			});

		}

		$form = $("#post");

		lsSubmit = function (e) {
			e.preventDefault();
			var timeout = 2500,
				action = 'publish',
				that = this;

			a.publish("clickedSubmit");
			checkConnection(timeout);

			setTimeout(function () {
				if (!isOnline) {

					lsBackup(action);
					toSync = true;
					$('.autosave-message').html(lsl10.post_saved);
					autosave_enable_buttons(); // re-enable disabled form buttons
				} else {
					//took this from After the Deadline's book
					//apparently, for some unknown reason, the post won't 
					//publish when you submit the form, but will, when you
					//click the button
					$(that).unbind('click', lsSubmit).click();
				}

			}, timeout + 100); 

			
		};
		$('input[type="submit"]').click(lsSubmit);

		//check if a request times out or doesn't get sent for reasons other 
		//than parseError, act accordingly, set isOnline to false
		$(".autosave-message").ajaxError(function (e, request, settings, thrownError) {

			

			if ((thrownError === "timeout" || request.statusText === "timeout" 
			|| request.statusText === "error") && settings.url === ajaxurl) {
				isOnline = false;
				//cancel autosave, replace with simple request to see if the 
				//connection is back up
				$.cancel(autosavePeriodical);
				connectPeriodical = $.schedule({
					time : autosaveL10n.autosaveInterval * 1000,
					func : function () {checkConnection(5000, true); },
					repeat : true,
					protect : true
				});

				//notify the user
				$(this).html(lsl10.connection_down);

				//disable preview
				lsDisablePreview();

				//if this was an autosave request, we should backup what it 
				//was trying to backup
				if (settings.data.indexOf('action=autosave') !== -1) {

					lsBackup("autosave");

				}
			}
		});
	});

	checkConnection = function (timeout, doSync) {
		timeout = timeout || 5000;
		doSync = typeof (doSync) !== 'undefined' ? doSync : false;

		$.ajax({

			data: {action: 'ls_check_connection'},
			type: "POST",
			url: ajaxurl,
			timeout: timeout,
			success: function () {
				isOnline = true;
				if (doSync) {
					lsSync("autosave");
					lsSync("save");
					lsSync("publish");
				}

				$.cancel(connectPeriodical);

				//re-enable autosaving;
				autosavePeriodical = $.schedule({
					time: autosaveL10n.autosaveInterval * 1000,
					func: function () { autosave(); },
					repeat: true, protect: true
				});

			}
		});

	};


	lsBackupParseResponse = function (response, action) {
		action = typeof (action) === 'undefined' ? 'autosave' : action;
		var res = wpAjax.parseAjaxResponse(response, 'ls_backup_' + action),
			message, postID, sup, ID, list;
		if (res && res.responses && res.responses.length) {
			message = res.responses[0].data;
			ID = parseInt(res.responses[0].id, 10);
			if (!isNaN(ID) && ID > 0) {

				a.store(ID + '-' + action, null);
				list = a.store(action);
				list.splice(list.indexOf(ID).toString(), 1);
				a.store(action, list);

			}
		}

		if (message) {

			$('.autosave-message').html(message);
		}

		return res;
	};


	

	lsBackup = function (action) {

		var rich = (typeof tinyMCE !== "undefined") && tinyMCE.activeEditor 
			&& !tinyMCE.activeEditor.isHidden(),
			list = a.store(action) || [],
			doBackup = typeof (isOnline) !== 'undefined' ? !isOnline : true,
			origStatus,
			ed,
			goodcats,
			post_data = {
				action: "ls_backup_" + action,
				post_ID:  $("#post_ID").val() || 0,
				post_type: $('#post_type').val() || "",
				post_save_date : Math.round(new Date().getTime() / 1000)
			},
		   	aa = $('#aa').val(), mm = $('#mm').val(), jj = $('#jj').val(),
		   	hh = $('#hh').val(), mn = $('#mn').val();


		post_data['ls_backup_' + action] = 1;
		post_data["ls_backup_" + action + "_nonce"] = $('#ls_backup_' + action
			  	 	+ "_" + post_data.post_type + "_" + post_data.post_ID)
					.val();
		/* Gotta do this up here so we can check the length when tinyMCE is in use */
		if (rich && doBackup) {
			ed = tinyMCE.activeEditor;
			// Don't run while the TinyMCE spellcheck is on. It resets all found words.
			if (ed.plugins.spellchecker && ed.plugins.spellchecker.active 
			&& action === "autosave") {
				doBackup = false;
			} else {
				if ('mce_fullscreen' === ed.id 
				|| 'wp_mce_fullscreen' === ed.id) {
					tinyMCE.get('content').setContent(ed.getContent());
				}

				tinyMCE.triggerSave();
			}
		}

		if (fullscreen && fullscreen.settings.visible) {
			post_data.post_title = $('#wp-fullscreen-title').val();
			post_data.content = tinyMCE.get("wp_mce_fullscreen").getContent();
		} else {
			post_data.post_title = $("#title").val();
			post_data.content = tinyMCE.get("content").getContent();
		}

		if ($('#post_name').val()) {
			post_data.post_name = $('#post_name').val();
		}


		// Nothing to save or no change.
		if ((post_data.post_title.length === 0 
		&& post_data.content.length === 0) 
		|| (post_data.post_title + post_data.content === backupLast 
		&& action === 'autosave')) {
			doBackup = false;
		}

		origStatus = $('#original_post_status').val();

		goodcats = ([]);
		$("[name='post_category[]']:checked").each(function (i) {
			goodcats.push(this.value);
		});
		post_data.catslist = goodcats.join(",");

		if ($("#comment_status").prop("checked")) {
			post_data.comment_status = 'open';
		}
		if ($("#ping_status").prop("checked")) {
			post_data.ping_status = 'open';
		}
		if ($("#excerpt").size()) {
			post_data.excerpt = $("#excerpt").val();
		}
		if ($("#post_author").size()) {
			post_data.post_author = $("#post_author").val();
		}
		if ($("#parent_id").val()) {
			post_data.parent_id = $("#parent_id").val();
		}

		post_data.user_ID = $("#user-id").val();
		if ($('#auto_draft').val() == '1') {
			post_data.auto_draft = '1';
		}


		post_data.visibility = $("[name=visibility]:checked").val();
		if (post_data.visibility === 'password') {
			post_data.post_password = $("#post_password").val();
		} else if (post_data.visibility === "private") {
				post_data.saveasprivate = 1;
		}

		

		attemptedDate = new Date( aa, mm - 1, jj, hh, mn );
		currentDate = new Date( $('#cur_aa').val(), $('#cur_mm').val() -1,
			   	$('#cur_jj').val(), $('#cur_hh').val(), $('#cur_mn').val() );

		if (attemptedDate > currentDate) {

		   if($("#post_status > :checked").val() !== "draft" 
				|| $("#post_status > :checked").val() !== "pending") {
				post_data.post_status = "future";
		   } else {
			   post_data.post_status = $("#post_status > :checked").val();
		   }

		   var time = ['aa', 'mm', 'jj', 'hh', 'mn', 'ss'];
		   for (var i = 0; i < time.length; i++) {

			   post_data[time[i]] = $("#" + time[i]).val();
			   post_data['hidden_' + time[i]] = $("#hidden_" + time[i]).val();
		   }

		}
		

		if (doBackup) {
			backupLast = post_data.post_title + post_data.content;

			if (list.indexOf(post_data.post_ID) == '-1') {
				list.push(post_data.post_ID);
			}

			toSync = true;
			a.publish('aboutToSave', action, post_data);
			a.store(post_data.post_ID + '-' + action, post_data);
			a.store(action, list);
			$(document).triggerHandler('wpcountwords', [post_data.content]);
			$('.autosave-message').html(lsl10.autosave_saved);

		} else {
			post_data.backup = 0;
		}


	};


	//taken from post.js - needed to do this as it isn't globally exposed, 
	//being in an auto-executing function & all;
	function updateText() {
		var attemptedDate, originalDate, currentDate, publishOn,
			postStatus = $('#post_status'),
			optPublish = $('option[value="publish"]', postStatus),
		   	aa = $('#aa').val(), mm = $('#mm').val(), jj = $('#jj').val(), 
			hh = $('#hh').val(), mn = $('#mn').val(), sticky,
			pvSelect = $('#post-visibility-select');

		attemptedDate = new Date( aa, mm - 1, jj, hh, mn );
		originalDate = new Date( $('#hidden_aa').val(), $('#hidden_mm').val()
			   	-1, $('#hidden_jj').val(), $('#hidden_hh').val(),
			   	$('#hidden_mn').val() );
		currentDate = new Date( $('#cur_aa').val(), $('#cur_mm').val() -1,
			   	$('#cur_jj').val(), $('#cur_hh').val(), $('#cur_mn').val() );

		if ( attemptedDate.getFullYear() != aa 
		|| (1 + attemptedDate.getMonth()) != mm 
		|| attemptedDate.getDate() != jj || attemptedDate.getMinutes() != mn ) {
			$('.timestamp-wrap', '#timestampdiv').addClass('form-invalid');
			return false;
		} else {
			$('.timestamp-wrap', '#timestampdiv').removeClass('form-invalid');
		}

		if ( attemptedDate > currentDate 
		&& $('#original_post_status').val() != 'future' ) {
			publishOn = postL10n.publishOnFuture;
			$('#publish').val( postL10n.schedule );
		} else if ( attemptedDate <= currentDate 
				&& $('#original_post_status').val() != 'publish' ) {
			publishOn = postL10n.publishOn;
			$('#publish').val( postL10n.publish );
		} else {
			publishOn = postL10n.publishOnPast;
			$('#publish').val( postL10n.update );
		}
		if ( originalDate.toUTCString() == attemptedDate.toUTCString() ) { //hack
			$('#timestamp').html($('#timestamp').html());
		} else {
			$('#timestamp').html(
					publishOn + ' <b>' +
					$('option[value="' + $('#mm').val() + '"]', '#mm').text() 
					+ ' ' +
					jj + ', ' +
					aa + ' @ ' +
					hh + ':' +
					mn + '</b> '
					);
		}

		if ( $('input:radio:checked', '#post-visibility-select').val() == 'private' ) {
			$('#publish').val( postL10n.update );
			if ( optPublish.length == 0 ) {
				postStatus.append('<option value="publish">' 
				+ postL10n.privatelyPublished + '</option>');
			} else {
				optPublish.html( postL10n.privatelyPublished );
			}
			$('option[value="publish"]', postStatus).prop('selected', true);
			$('.edit-post-status', '#misc-publishing-actions').hide();
		} else {
			if ( $('#original_post_status').val() == 'future' 
			|| $('#original_post_status').val() == 'draft' ) {
				if ( optPublish.length ) {
					optPublish.remove();
					postStatus.val($('#hidden_post_status').val());
				}
			} else {
				optPublish.html( postL10n.published );
			}
			if ( postStatus.is(':hidden') )
				$('.edit-post-status', '#misc-publishing-actions').show();
		}
		$('#post-status-display').html($('option:selected', postStatus).text());
		if ( $('option:selected', postStatus).val() == 'private' 
		|| $('option:selected', postStatus).val() == 'publish' ) {
			$('#save-post').hide();
		} else {
			$('#save-post').show();
			if ( $('option:selected', postStatus).val() == 'pending' ) {
				$('#save-post').show().val( postL10n.savePending );
			} else {
				$('#save-post').show().val( postL10n.saveDraft );
			}
		}
		if ( true == $('#sticky').prop('checked') ) {
			sticky = 'Sticky';
		} else {
			sticky = '';
		}

		$('#post-visibility-display')
			.html(	postL10n[$('input:radio:checked', pvSelect).val() + sticky]	);

		a.publish("updatingText", action, post_data);

		return true;
	}

	stopClick = function (e) {

		e.preventDefault();
	};

	lsEnablePreview = function () {

		$("#post-preview").removeClass("disabled").unbind('click',stopClick);
	};

	lsDisablePreview = function () {

		$("#post-preview").addClass("disabled").click(stopClick);
	};

}(jQuery));
