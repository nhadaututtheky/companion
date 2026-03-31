use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

/// Build and register the system tray icon with its context menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Companion", true, None::<&str>)?;
    let new_session_item =
        MenuItem::with_id(app, "new_session", "New Session", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_item, &new_session_item, &separator, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .tooltip("Companion")
        .on_menu_event(move |app_handle, event| match event.id.as_ref() {
            "open" => show_main_window(app_handle),
            "new_session" => open_new_session(app_handle),
            "quit" => {
                log::info!("Quit requested from tray");
                app_handle.exit(0);
            }
            other => log::warn!("Unknown tray menu event: {}", other),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        window.show().unwrap_or_else(|e| log::warn!("show: {}", e));
        window
            .set_focus()
            .unwrap_or_else(|e| log::warn!("focus: {}", e));
    }
}

fn open_new_session<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        window.show().unwrap_or_else(|e| log::warn!("show: {}", e));
        window
            .set_focus()
            .unwrap_or_else(|e| log::warn!("focus: {}", e));
        // Navigate the webview to the new-session flow
        window
            .eval("window.location.href = 'http://localhost:3579';")
            .unwrap_or_else(|e| log::warn!("eval: {}", e));
    }
}
