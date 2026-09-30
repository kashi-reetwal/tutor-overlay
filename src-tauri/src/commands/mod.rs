use crate::ai;
use crate::capture;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HotkeyStatus {
    pub shortcut: String,
    pub registered: bool,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct AppState {
    pub hotkey_status: Mutex<Option<HotkeyStatus>>,
    pub last_answer: Mutex<String>,
}

#[tauri::command]
pub async fn get_hotkey_status(state: State<'_, AppState>) -> Result<HotkeyStatus, String> {
    let status = state.hotkey_status.lock().unwrap();
    status.clone().ok_or_else(|| "Hotkey status not yet initialized".to_string())
}

#[tauri::command]
pub async fn trigger_tutor(
    app: AppHandle,
    state: State<'_, AppState>,
    user_query: Option<String>,
) -> Result<(), String> {
    info!("Triggering tutor explanation pipeline");

    // 1. Notify frontend state is capturing
    let _ = app.emit("tutor:state", "capturing");

    // 2. Perform screen capture
    let captured = match capture::capture_active_or_fullscreen() {
        Ok(c) => c,
        Err(e) => {
            error!("Capture failed: {}", e);
            let _ = app.emit("tutor:error", format!("Screen capture failed: {}", e));
            let _ = app.emit("tutor:state", "idle");
            return Err(e);
        }
    };

    // 3. Make sure window is shown and focused so user sees the card
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }

    // 4. Notify frontend state is thinking
    let _ = app.emit("tutor:state", "thinking");

    // 5. Query AI vision model with streaming
    match ai::query_vision_model_stream(&app, &captured.base64, user_query.as_deref()).await {
        Ok(final_answer) => {
            let mut last = state.last_answer.lock().unwrap();
            *last = final_answer;
            let _ = app.emit("tutor:state", "ready");
            Ok(())
        }
        Err(e) => {
            error!("AI query failed: {}", e);
            let _ = app.emit("tutor:error", format!("AI tutor error: {}", e));
            let _ = app.emit("tutor:state", "idle");
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn send_followup(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
) -> Result<(), String> {
    info!("Sending follow-up tutor question: {}", query);
    let prior_answer = {
        let last = state.last_answer.lock().unwrap();
        last.clone()
    };

    let _ = app.emit("tutor:state", "thinking");

    match ai::query_followup_stream(&app, &prior_answer, &query).await {
        Ok(final_answer) => {
            let mut last = state.last_answer.lock().unwrap();
            *last = final_answer;
            let _ = app.emit("tutor:state", "ready");
            Ok(())
        }
        Err(e) => {
            error!("Follow-up query failed: {}", e);
            let _ = app.emit("tutor:error", format!("Follow-up error: {}", e));
            let _ = app.emit("tutor:state", "ready");
            Err(e)
        }
    }
}

#[tauri::command]
pub fn set_card_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        if visible {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        } else {
            win.hide().map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
pub fn dismiss_card(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    let _ = app.emit("tutor:state", "idle");
    Ok(())
}
