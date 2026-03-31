// Prevents additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;
mod tray;

use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // ── 1. Set up system tray ────────────────────────────────────────
            tray::setup_tray(&app.handle())?;

            // ── 2. Resolve runtime paths ─────────────────────────────────────
            let db_path = server::resolve_db_path();
            let db_path_str = db_path
                .to_str()
                .expect("DB path must be valid UTF-8")
                .to_owned();

            let api_key = std::env::var("COMPANION_API_KEY").unwrap_or_default();

            log::info!("DB path: {}", db_path_str);

            // ── 3. Spawn the Bun sidecar ──────────────────────────────────────
            let sidecar_cmd = app
                .shell()
                .sidecar("binaries/bun-server")
                .map_err(|e| {
                    log::error!("Failed to resolve sidecar: {}", e);
                    e
                })?
                .env("DB_PATH", &db_path_str)
                .env("PORT", "3579")
                .env("API_KEY", &api_key)
                .env("NODE_ENV", "production");

            let (mut _rx, sidecar_child) = sidecar_cmd.spawn().map_err(|e| {
                log::error!("Failed to spawn sidecar: {}", e);
                e
            })?;

            // Keep child handle alive for the entire app lifetime
            let child_arc = Arc::new(tokio::sync::Mutex::new(sidecar_child));
            app.manage(child_arc.clone());

            // ── 4. Wait for server to be healthy, then show window ────────────
            let app_handle = app.handle().clone();
            tokio::spawn(async move {
                const MAX_ATTEMPTS: u32 = 30;
                const INTERVAL_MS: u64 = 500;

                if server::wait_for_server(MAX_ATTEMPTS, INTERVAL_MS).await {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        window
                            .show()
                            .unwrap_or_else(|e| log::warn!("Failed to show window: {}", e));
                        window
                            .set_focus()
                            .unwrap_or_else(|e| log::warn!("Failed to focus window: {}", e));
                    }
                } else {
                    log::error!("Bun server failed to start — showing error and quitting");
                    // Surface the error to the user via the webview before quitting
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.eval(
                            r#"document.body.innerHTML =
                                '<div style="font-family:sans-serif;padding:40px;color:#ff6b6b">\
                                  <h2>Companion failed to start</h2>\
                                  <p>The background server did not respond. \
                                     Check that no other process is using port 3579.</p>\
                                </div>';"#,
                        );
                        window.show().unwrap_or_default();
                    }
                    // Give the user a moment to read the message
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    app_handle.exit(1);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide to tray instead of closing when the user clicks the X button
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    window
                        .hide()
                        .unwrap_or_else(|e| log::warn!("Failed to hide window: {}", e));
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // Kill the Bun sidecar when the app actually exits
                if let Some(child_arc) = app
                    .try_state::<Arc<tokio::sync::Mutex<tauri_plugin_shell::process::CommandChild>>>()
                {
                    let child_arc = child_arc.inner().clone();
                    // Attempt a graceful kill; ignore errors (process may have already exited)
                    let rt = tokio::runtime::Handle::try_current();
                    match rt {
                        Ok(handle) => {
                            handle.spawn(async move {
                                let mut child = child_arc.lock().await;
                                if let Err(e) = child.kill() {
                                    log::warn!("Failed to kill sidecar on exit: {}", e);
                                } else {
                                    log::info!("Sidecar killed successfully");
                                }
                            });
                        }
                        Err(_) => {
                            // We're outside an async context — best effort sync kill
                            log::warn!("No async runtime available for graceful sidecar shutdown");
                        }
                    }
                }
            }
        });
}
