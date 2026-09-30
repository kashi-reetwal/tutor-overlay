use futures_util::StreamExt;
use log::{error, info, warn};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

impl AiConfig {
    pub fn from_env() -> Result<Self, String> {
        let _ = dotenvy::dotenv();
        let _ = dotenvy::from_filename(".env.local");

        let api_key = std::env::var("AI_API_KEY")
            .or_else(|_| std::env::var("OPENAI_API_KEY"))
            .or_else(|_| std::env::var("GEMINI_API_KEY"))
            .map_err(|_| {
                "Missing AI_API_KEY. Please set AI_API_KEY in .env.local or your environment."
                    .to_string()
            })?;

        let provider = std::env::var("AI_PROVIDER")
            .unwrap_or_else(|_| {
                if api_key.starts_with("AIzaSy") {
                    "gemini".to_string()
                } else {
                    "openai".to_string()
                }
            })
            .to_lowercase();

        let model = std::env::var("AI_MODEL").unwrap_or_else(|_| {
            if provider == "gemini" {
                "gemini-1.5-flash".to_string()
            } else {
                "gpt-4o-mini".to_string()
            }
        });

        let base_url = std::env::var("AI_BASE_URL").ok();

        Ok(Self {
            provider,
            model,
            api_key,
            base_url,
        })
    }
}

const SYSTEM_TUTOR_PROMPT: &str = r#"You are an expert, encouraging tutor. The user invoked you while reading or studying content on their screen.
Analyze the provided screenshot and explain the core concept, error, math equation, code, or text clearly and concisely.
Guidelines:
- Explain what is in focus in simple, intuitive terms.
- Use clean Markdown with bullet points, bold key terms, and code blocks if applicable.
- Avoid unnecessary introductory filler like "In this image, I see..." — jump directly to the tutoring explanation.
- Keep the explanation digestible for someone reading quickly on an overlay card."#;

/// Ask AI about a captured screenshot and stream the answer into the Tauri frontend.
pub async fn query_vision_model_stream(
    app: &AppHandle,
    image_base64: &str,
    user_query: Option<&str>,
) -> Result<String, String> {
    let config = AiConfig::from_env()?;
    info!("Querying AI tutor using provider: {}, model: {}", config.provider, config.model);

    let client = reqwest::Client::new();

    let query_text = user_query.unwrap_or("Please tutor me on what is shown on my screen.");

    if config.provider == "gemini" {
        query_gemini_stream(app, &client, &config, image_base64, query_text).await
    } else {
        query_openai_stream(app, &client, &config, image_base64, query_text).await
    }
}

/// Ask follow-up question in existing conversation context
pub async fn query_followup_stream(
    app: &AppHandle,
    prior_answer: &str,
    followup_query: &str,
) -> Result<String, String> {
    let config = AiConfig::from_env()?;
    let client = reqwest::Client::new();

    if config.provider == "gemini" {
        query_gemini_followup_stream(app, &client, &config, prior_answer, followup_query).await
    } else {
        query_openai_followup_stream(app, &client, &config, prior_answer, followup_query).await
    }
}

async fn query_openai_stream(
    app: &AppHandle,
    client: &reqwest::Client,
    config: &AiConfig,
    image_base64: &str,
    user_query: &str,
) -> Result<String, String> {
    let endpoint = config
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com/v1/chat/completions");

    let payload = json!({
        "model": config.model,
        "stream": true,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_TUTOR_PROMPT
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": user_query
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/jpeg;base64,{}", image_base64),
                            "detail": "auto"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 1000
    });

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", config.api_key))
            .map_err(|e| format!("Invalid auth header: {}", e))?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let res = client
        .post(endpoint)
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("AI provider returned error: {}", err_text));
    }

    parse_sse_stream(app, res).await
}

async fn query_openai_followup_stream(
    app: &AppHandle,
    client: &reqwest::Client,
    config: &AiConfig,
    prior_answer: &str,
    followup_query: &str,
) -> Result<String, String> {
    let endpoint = config
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com/v1/chat/completions");

    let payload = json!({
        "model": config.model,
        "stream": true,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_TUTOR_PROMPT
            },
            {
                "role": "assistant",
                "content": prior_answer
            },
            {
                "role": "user",
                "content": followup_query
            }
        ],
        "max_tokens": 1000
    });

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", config.api_key))
            .map_err(|e| format!("Invalid auth header: {}", e))?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let res = client
        .post(endpoint)
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("AI provider returned error: {}", err_text));
    }

    parse_sse_stream(app, res).await
}

async fn query_gemini_stream(
    app: &AppHandle,
    client: &reqwest::Client,
    config: &AiConfig,
    image_base64: &str,
    user_query: &str,
) -> Result<String, String> {
    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
        config.model, config.api_key
    );

    let payload = json!({
        "systemInstruction": {
            "parts": [
                { "text": SYSTEM_TUTOR_PROMPT }
            ]
        },
        "contents": [
            {
                "parts": [
                    { "text": user_query },
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": image_base64
                        }
                    }
                ]
            }
        ]
    });

    let res = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Gemini HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {}", err_text));
    }

    parse_gemini_sse_stream(app, res).await
}

async fn query_gemini_followup_stream(
    app: &AppHandle,
    client: &reqwest::Client,
    config: &AiConfig,
    prior_answer: &str,
    followup_query: &str,
) -> Result<String, String> {
    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
        config.model, config.api_key
    );

    let payload = json!({
        "systemInstruction": {
            "parts": [
                { "text": SYSTEM_TUTOR_PROMPT }
            ]
        },
        "contents": [
            {
                "role": "model",
                "parts": [
                    { "text": prior_answer }
                ]
            },
            {
                "role": "user",
                "parts": [
                    { "text": followup_query }
                ]
            }
        ]
    });

    let res = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Gemini HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {}", err_text));
    }

    parse_gemini_sse_stream(app, res).await
}

/// Helper to parse standard OpenAI SSE stream and emit chunks to frontend
async fn parse_sse_stream(app: &AppHandle, res: reqwest::Response) -> Result<String, String> {
    let mut stream = res.bytes_stream();
    let mut accumulated = String::new();
    let mut buffer = String::new();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| format!("Stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&bytes);
        buffer.push_str(&text);

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if line == "data: [DONE]" {
                break;
            }

            if let Some(json_str) = line.strip_prefix("data: ") {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(delta) = val["choices"][0]["delta"]["content"].as_str() {
                        accumulated.push_str(delta);
                        let _ = app.emit("tutor:stream_chunk", delta);
                    }
                }
            }
        }
    }

    let _ = app.emit("tutor:stream_end", &accumulated);
    Ok(accumulated)
}

/// Helper to parse Gemini SSE stream and emit chunks to frontend
async fn parse_gemini_sse_stream(app: &AppHandle, res: reqwest::Response) -> Result<String, String> {
    let mut stream = res.bytes_stream();
    let mut accumulated = String::new();
    let mut buffer = String::new();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| format!("Gemini stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&bytes);
        buffer.push_str(&text);

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if let Some(json_str) = line.strip_prefix("data: ") {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(candidates) = val["candidates"].as_array() {
                        if let Some(candidate) = candidates.first() {
                            if let Some(parts) = candidate["content"]["parts"].as_array() {
                                for part in parts {
                                    if let Some(chunk) = part["text"].as_str() {
                                        accumulated.push_str(chunk);
                                        let _ = app.emit("tutor:stream_chunk", chunk);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let _ = app.emit("tutor:stream_end", &accumulated);
    Ok(accumulated)
}
