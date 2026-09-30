pub mod ai;
pub mod capture;
pub mod commands;

use commands::{AppState, HotkeyStatus};
use log::{error, info, warn};
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_filename(".env.local");

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    info!("tutor-overlay starting");

    let app_state = AppState::default();

    tauri::Builder::default()
        .manage(app_state)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        info!("Global shortcut triggered: {:?}", shortcut);
                        let app_clone = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_clone.state::<AppState>();
                            let _ = commands::trigger_tutor(app_clone.clone(), state, None, None).await;
                        });
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_hotkey_status,
            commands::trigger_tutor,
            commands::send_followup,
            commands::set_card_visible,
            commands::dismiss_card
        ])
        .setup(|app| {
            info!("Configuring global shortcut...");
            let hotkey_str = "Alt+T";
            let state = app.state::<AppState>();

            match hotkey_str.parse::<Shortcut>() {
                Ok(shortcut) => {
                    let global_shortcut = app.global_shortcut();
                    match global_shortcut.register(shortcut) {
                        Ok(_) => {
                            info!("Successfully registered global hotkey: {}", hotkey_str);
                            let mut status = state.hotkey_status.lock().unwrap();
                            *status = Some(HotkeyStatus {
                                shortcut: hotkey_str.to_string(),
                                registered: true,
                                error: None,
                            });
                        }
                        Err(e) => {
                            warn!("Failed to register global hotkey {}: {}", hotkey_str, e);
                            let mut status = state.hotkey_status.lock().unwrap();
                            *status = Some(HotkeyStatus {
                                shortcut: hotkey_str.to_string(),
                                registered: false,
                                error: Some(format!("Registration error: {}", e)),
                            });
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to parse hotkey shortcut {}: {}", hotkey_str, e);
                    let mut status = state.hotkey_status.lock().unwrap();
                    *status = Some(HotkeyStatus {
                        shortcut: hotkey_str.to_string(),
                        registered: false,
                        error: Some(format!("Parse error: {}", e)),
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tutor-overlay");
}
