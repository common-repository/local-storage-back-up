<?php 
/**
 *  
 *  Plugin Name: LocalStorage back-up
 *  Description: This plugin will automatically backup your posts when you edit them and your connection fails on you. Developed as part of GSoC 2011.
 *  Author: Mihai Chereji
 *  Version: 0.9.2
 *  Author URI: http://cronco.me
 *  Plugin URI: http://wordpress.org/extend/plugins/local-storage-back-up/
 */

function ls_add_nonces(){
	global $post;
	
	wp_nonce_field("ls_backup_autosave_" . $post->post_type . "_" . $post->ID, "ls_backup_autosave_" . $post->post_type . "_" . $post->ID, false);
	wp_nonce_field("ls_backup_publish_" . $post->post_type . "_" . $post->ID, "ls_backup_publish_" . $post->post_type . "_" . $post->ID, false);
	do_action("ls_add_nonces");
}


function local_storage_add_scripts()
{

	if( SCRIPT_DEBUG == true ) {
		wp_enqueue_script('amplify', plugins_url('amplify.js', __FILE__ ), array('jquery'));
	} else {
		wp_enqueue_script('amplify', plugins_url('amplify.min.js', __FILE__ ), array('jquery'));
	}
	wp_enqueue_script('local-storage-general', plugins_url('local-storage-general.js', __FILE__), array('jquery','amplify','wp-ajax-response'));

	wp_localize_script('local-storage-general', 'lsl10', array(

		'post_edit_url'		=> admin_url('post.php'),
		'connection_down'	=> __("Connection seems to be down. Keep calm and write.", 'local-storage'),
		'post_saved'		=> __("Connection seems to be down. It's safe to close your browser, it will be published next time you visit your site.", 'local-storage'),
		'curr_post'			=> __("Last time you were connected you tried to publish this post. Do you want to publish it, show that version or delete it? ", 'local-storage'),
		'curr_autosave'		=> __("There is an autosave of the post you are currently editing in the browser cache. Do you want to publish it, show that version, or delete it? ", 'local-storage'),
		'autosave_saved'	=> __("Connection seems to be down. Locally backed up autosave.", 'local-storage'),
		'publish_post'		=> __("Last time you were connected you tried to publish a post(%s) but the connection was down. Do you want to publish it now?", 'local-storage'),
		'show'				=> __("Show", 'local-storage'),
		'publish'				=> __("Publish", 'local-storage'),
		'del'			=> __("Delete", 'local-storage')	
	));

	do_action("ls_add_scripts");
		
}

function local_storage_add_editor_scripts()
{
	
	wp_enqueue_script('local-storage', plugins_url('local-storage.js', __FILE__ ), array('local-storage-general'));
	wp_enqueue_script('local-storage-plugin-example', plugins_url('local-storage-plugin-example.js', __FILE__), array('local-storage'));
	do_action("ls_add_editor_scripts");
}


/**
 * mostly copied from the case: 'autosave' branch in admin-ajax.php in wordpress core 
 */

function local_storage_ajax_autosave_response()
{
	define('DOING_AUTOSAVE', true);

	$nonce_age = check_ajax_referer( 'ls_backup_autosave_' . $_POST["post_type"] . "_" . $_POST["post_ID"], 'ls_backup_autosave_nonce' );

	$_POST['post_category'] = explode(",", $_POST['catslist']);
	if ( $_POST['post_type'] == 'page' || empty($_POST['post_category']) )
		unset($_POST['post_category']);

	$do_autosave = (bool) $_POST['ls_backup_autosave'];
	$do_lock = true;

	$data = $alert = '';
	/* translators: draft saved date format, see http://php.net/date */
	$draft_saved_date_format = __('g:i:s a');
	/* translators: %s: date and time */
	$message = sprintf( __('Local autosaves synced at %s.','local-storage'), date_i18n( $draft_saved_date_format ) );

	$supplemental = array();
	$id = $revision_id = 0;

	$post_ID = (int) $_POST['post_ID'];
	$_POST['ID'] = $post_ID;
	$post = get_post($post_ID);

	if ( !$post || is_wp_error($post) )
		die('-1');

	$supplemental['dates'] = $_POST['post_save_date'] . ' ' . strtotime($post->post_modified_gmt);
	$supplemental['old_id'] = $post_ID;

	if( $_POST['post_save_date'] < strtotime($post->post_modified_gmt) ) {

		$x = new WP_Ajax_Response ( array(
			'what' => "ls_backup_autosave",
			'id' => 0,
			'data' => __('There is a newer autosave on the server for your post.','local-storage'),
			'supplemental' => $supplemental
			)
		);
		$x->send();
		wp_die();
	}

	if ( 'auto-draft' == $post->post_status )
		$_POST['post_status'] = 'draft';

	if ( $last = wp_check_post_lock( $post->ID ) ) {
		
		$do_autosave = $do_lock = false;
		$last_user = get_userdata( $last );
		$last_user_name = $last_user ? $last_user->display_name : __( 'Someone' );
		$data = __( 'Autosave disabled.' );

		$supplemental['disable_autosave'] = 'disable';
		$alert .= sprintf( __( '%s is currently editing this article. If you update it, you will overwrite the changes.' ), esc_html( $last_user_name ) );
	}

	if ( 'page' == $post->post_type ) {
		if ( !current_user_can('edit_page', $post_ID) )
			wp_die(__('You are not allowed to edit this page.'));
	} elseif ( !current_user_can('edit_post', $post_ID) ) {
			wp_die(__('You are not allowed to edit this post.'));
	}

	if ( $do_autosave ) {
		// Drafts and auto-drafts are just overwritten by autosave
		if ( 'auto-draft' == $post->post_status || 'draft' == $post->post_status ) {
			$id = edit_post();
		} else { // Non drafts are not overwritten.  The autosave is stored in a special post revision.
			$revision_id = wp_create_post_autosave( $post->ID );
			if ( is_wp_error($revision_id) )
				$id = $revision_id;
			else
				$id = $post->ID;
		}
		$data = $message;
	} else {
		if ( isset( $_POST['auto_draft'] ) && '1' == $_POST['auto_draft'] )
			$id = 0; // This tells us it didn't actually save
		else
			$id = $post->ID;
	}

	if ( $do_lock && ( isset( $_POST['auto_draft'] ) && ( $_POST['auto_draft'] != '1' ) ) && $id && is_numeric($id) )
		wp_set_post_lock( $id );

	if ( ! empty($alert) )
		$supplemental['alert'] = $alert;

	$x = new WP_Ajax_Response( array(
		'what' => 'ls_backup_autosave',
		'id' => $id,
		'data' => $id ? $data : '',
		'supplemental' => $supplemental
	) );
	$x->send();
	wp_die();
}


function local_storage_ajax_publish_response()
{
	$nonce_age = check_ajax_referer( 'ls_backup_publish_' . $_POST["post_type"] . "_" . $_POST["post_ID"], 'ls_backup_publish_nonce' );

	$_POST['post_category'] = explode(",", $_POST['catslist']);
	if ( $_POST['post_type'] == 'page' || empty($_POST['post_category']) )
		unset($_POST['post_category']);

	$do_lock = true;

	$data = $alert = '';
	/* translators: draft saved date format, see http://php.net/date */
	$draft_saved_date_format = __('g:i:s a');
	/* translators: %s: date and time */
	$message = sprintf( __('Local posts synced at %s.','local-storage'), date_i18n( $draft_saved_date_format ) );

	$supplemental = array();
	$id = $revision_id = 0;

	if( isset($_POST['post_ID']) )
		$post_ID = (int) $_POST['post_ID'];
	else $post_ID = 0;

	if(!isset($_POST['post_status']))
		$_POST['post_status'] = 'publish';

	if($post_ID) {
		$_POST['ID'] = $post_ID;
		$post = get_post($post_ID);

		if ( !$post || is_wp_error($post) )
			die('-1');

		if( ( $_POST['post_save_date'] < strtotime($post->post_modified_gmt) ) && ($post->post_status == 'publish') ) {
			$x = new WP_Ajax_Response ( array(
				'what' => "ls_backup_publish",
				'id' => 0,
				'data' => __('There is a newer version on the server for your post.','local-storage')
				)
			);

			$x->send();
			wp_die();
		}

		if ( isset($_POST['post_date']) && $_POST['post_date'] && isset($_POST['post_date_gmt']) && $_POST['post_date_gmt']) {
			$_POST['post_date'] = date("Y m d h:i:s", $_POST['post_date']);
			$_POST['post_date_gmt'] = date("Y m d h:i:s", $_POST['post_date_gmt']);
		}
		if ( $last = wp_check_post_lock( $post->ID ) ) {
			$do_lock = false;

			$last_user = get_userdata( $last );
			$last_user_name = $last_user ? $last_user->display_name : __( 'Someone' );
			$alert .= sprintf( __( '%s is currently editing this article. If you update it, you will overwrite the changes.' ), esc_html( $last_user_name ) );
		}

		if ( 'page' == $post->post_type ) {
			if ( !current_user_can('edit_page', $post_ID) )
				wp_die(__('You are not allowed to edit this page.'));
		} else {
			if ( !current_user_can('edit_post', $post_ID) )
				wp_die(__('You are not allowed to edit this post.'));
		}

		if ( $do_lock && $post ) {
					$id = edit_post();
		}
		if ( $do_lock && ( isset( $_POST['auto_draft'] ) && ( $_POST['auto_draft'] != '1' ) ) && $id && is_numeric($id) )
			wp_set_post_lock( $id );
	} else {
		if ( 'page' == $_POST['post_type'] ) {
			if ( !current_user_can('edit_page', $post_ID) )
				wp_die(__('You are not allowed to edit this page.'));
		} else {
			if ( !current_user_can('edit_post', $post_ID) )
				wp_die(__('You are not allowed to edit this post.'));
		}
		$id = wp_insert_post($_POST);
	}
		if ( ! empty($alert) )
			$supplemental['alert'] = $alert;

		$x = new WP_Ajax_Response( array(
			'what' => 'ls_backup_publish',
			'id' => $id,
			'data' => $id ? $data : '',
			'supplemental' => $supplemental
		) );
		$x->send();
		wp_die();	
}

function local_storage_ajax_ping()
{
	echo 1;
	wp_die();
}

add_action("edit_form_advanced", "ls_add_nonces");

add_action('wp_ajax_ls_check_connection','local_storage_ajax_ping');
add_action('wp_ajax_ls_backup_publish','local_storage_ajax_publish_response');
add_action('wp_ajax_ls_backup_autosave', 'local_storage_ajax_autosave_response');

add_action('admin_print_scripts-post-new.php', 'local_storage_add_editor_scripts');
add_action('admin_print_scripts-post.php', 'local_storage_add_editor_scripts');
add_action('admin_print_scripts', 'local_storage_add_scripts');


?>
