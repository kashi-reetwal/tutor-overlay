pub mod commands;

use log::{info, warn};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    info!("tutor-overlay starting");

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(|invoke| {
            warn!("unhandled invoke: {:?}", invoke);
           Ok(tauri::Response::default())
        })
        .setup(|_app| {
            info!("tutor-overlay setup complete");
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(err) = result {
        warn!("tutor-overlay failed to run: {}", err);
    }
}
