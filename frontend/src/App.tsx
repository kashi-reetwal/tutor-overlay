import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  X,
  Send,
  Camera,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  GripHorizontal,
  Settings,
  Upload,
  Key,
  HelpCircle,
  Bug,
  BookOpen,
} from "lucide-react";

type CardState = "idle" | "capturing" | "thinking" | "ready" | "error";

interface Message {
  role: "user" | "tutor";
  content: string;
}

interface HotkeyStatus {
  shortcut: string;
  registered: boolean;
  error?: string | null;
}

interface UserSettings {
  provider: "gemini" | "openai";
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  provider: "gemini",
  model: "gemini-1.5-flash",
  apiKey: "",
  baseUrl: "",
};

const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return {} as T;
}

export default function App() {
  const [state, setState] = useState<CardState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStreamingText, setCurrentStreamingText] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hotkeyInfo, setHotkeyInfo] = useState<HotkeyStatus>({
    shortcut: "Alt+T",
    registered: true,
  });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem("tutor_settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Browser test mode image upload
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when messages or streaming text updates
  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingText, state]);

  // Persist settings
  const updateSettings = (partial: Partial<UserSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    localStorage.setItem("tutor_settings", JSON.stringify(updated));
  };

  // Set up Tauri event listeners and status check
  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenChunk: (() => void) | undefined;
    let unlistenEnd: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    async function initTauri() {
      if (!isTauri) return;

      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlistenState = await listen<CardState>("tutor:state", (event) => {
          setState(event.payload);
          if (event.payload === "capturing") {
            setCurrentStreamingText("");
            setErrorMessage(null);
          }
        });

        unlistenChunk = await listen<string>("tutor:stream_chunk", (event) => {
          setCurrentStreamingText((prev) => prev + event.payload);
        });

        unlistenEnd = await listen<string>("tutor:stream_end", (event) => {
          setMessages((prev) => [...prev, { role: "tutor", content: event.payload }]);
          setCurrentStreamingText("");
          setState("ready");
        });

        unlistenError = await listen<string>("tutor:error", (event) => {
          setErrorMessage(event.payload);
          setState("error");
        });

        const status = await tauriInvoke<HotkeyStatus>("get_hotkey_status");
        if (status) {
          setHotkeyInfo(status);
        }
      } catch (err) {
        console.warn("Tauri initialization notice:", err);
      }
    }

    initTauri();

    return () => {
      unlistenState?.();
      unlistenChunk?.();
      unlistenEnd?.();
      unlistenError?.();
    };
  }, []);

  // Global Escape key listener to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle clipboard paste of images in browser test mode
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isTauri) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const b64 = event.target?.result as string;
              setPreviewImage(b64);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Client-side Vision AI caller for Browser Preview mode
  const runBrowserVisionAI = async (
    imageBase64: string,
    prompt: string
  ): Promise<void> => {
    setState("thinking");
    setCurrentStreamingText("");

    if (!settings.apiKey) {
      // Simulate realistic streaming response if no API key is provided
      const sampleText = `### 🎓 Tutor Explanation: Screen Context\n\n- **Identified Element:** The focused window contains code structure and UI logic.\n- **Key Concept:** The active overlay listens globally for \`${hotkeyInfo.shortcut}\` and captures the foreground window using Win32 GDI.\n- **Suggested Action:** To run real AI analysis in browser preview, paste your **Gemini or OpenAI API key** in Settings ⚙️ above.\n\n\`\`\`typescript\n// Test follow-up queries or ask clarification questions below\nconsole.log("Ready for your questions!");\n\`\`\``;

      let index = 0;
      const interval = setInterval(() => {
        index += 25;
        if (index <= sampleText.length) {
          setCurrentStreamingText(sampleText.slice(0, index));
        } else {
          clearInterval(interval);
          setMessages((prev) => [...prev, { role: "tutor", content: sampleText }]);
          setCurrentStreamingText("");
          setState("ready");
        }
      }, 50);
      return;
    }

    try {
      const cleanB64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

      if (settings.provider === "gemini") {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?alt=sse&key=${settings.apiKey}`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "image/jpeg", data: cleanB64 } },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          throw new Error(`Gemini API error: ${await res.text()}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            for (const line of text.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const json = JSON.parse(line.slice(6));
                  const chunk =
                    json.candidates?.[0]?.content?.parts?.[0]?.text || "";
                  accumulated += chunk;
                  setCurrentStreamingText(accumulated);
                } catch {
                  // partial JSON
                }
              }
            }
          }
        }
        setMessages((prev) => [...prev, { role: "tutor", content: accumulated }]);
        setCurrentStreamingText("");
        setState("ready");
      } else {
        // OpenAI-compatible
        const endpoint =
          settings.baseUrl || "https://api.openai.com/v1/chat/completions";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model,
            stream: true,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${cleanB64}` },
                  },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          throw new Error(`OpenAI API error: ${await res.text()}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            for (const line of text.split("\n")) {
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  const json = JSON.parse(line.slice(6));
                  const chunk = json.choices?.[0]?.delta?.content || "";
                  accumulated += chunk;
                  setCurrentStreamingText(accumulated);
                } catch {
                  // partial line
                }
              }
            }
          }
        }
        setMessages((prev) => [...prev, { role: "tutor", content: accumulated }]);
        setCurrentStreamingText("");
        setState("ready");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to query AI provider");
      setState("error");
    }
  };

  const handleTrigger = async (customPrompt?: string) => {
    setState("capturing");
    setErrorMessage(null);
    setCurrentStreamingText("");
    setMessages([]);

    const prompt =
      customPrompt || "Please explain the core concept or content shown on this screen concisely.";

    if (isTauri) {
      try {
        await tauriInvoke("trigger_tutor", { userQuery: prompt });
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Failed to trigger tutor capture");
        setState("error");
      }
    } else {
      // Browser preview mode
      setTimeout(() => {
        const dummyImg = previewImage || "placeholder";
        runBrowserVisionAI(dummyImg, prompt);
      }, 500);
    }
  };

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || state === "thinking" || state === "capturing") return;

    const query = followUp.trim();
    setFollowUp("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setState("thinking");

    if (isTauri) {
      try {
        await tauriInvoke("send_followup", { query });
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Follow-up failed");
        setState("ready");
      }
    } else {
      // Browser preview follow-up simulation or live call
      setTimeout(() => {
        const followUpAnswer = `**Response to:** "${query}"\n\n- The explanation considers prior context.\n- When running natively, Windows active-window capture feeds directly into your chosen vision model.`;
        setMessages((prev) => [...prev, { role: "tutor", content: followUpAnswer }]);
        setState("ready");
      }, 700);
    }
  };

  const handleDismiss = async () => {
    if (isTauri) {
      await tauriInvoke("dismiss_card");
    } else {
      setState("idle");
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const b64 = event.target?.result as string;
        setPreviewImage(b64);
        handleTrigger("Please tutor me on what is visible in this uploaded image.");
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full h-screen p-3 flex flex-col justify-end items-end select-none font-sans antialiased text-neutral-100 bg-transparent">
      {/* Floating Tutor Card */}
      <div
        className={`w-full max-w-[450px] rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xl backdrop-blur-2xl flex flex-col ${
          state === "error"
            ? "border-rose-500/50 bg-neutral-950/95 shadow-rose-950/40"
            : state === "thinking"
            ? "border-sky-500/50 bg-neutral-950/95 shadow-sky-950/40"
            : "border-neutral-700/60 bg-neutral-950/90 shadow-black/70"
        }`}
        style={{ maxHeight: "calc(100vh - 24px)" }}
      >
        {/* Header / Drag Bar */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-800/80 bg-neutral-900/70 cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <div className="p-1 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-neutral-100">
              AI Tutor Overlay
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800/80 text-sky-300">
              {hotkeyInfo.shortcut}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <GripHorizontal className="w-3.5 h-3.5 text-neutral-500 mr-1" />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 rounded-lg transition-colors ${
                showSettings
                  ? "bg-neutral-800 text-sky-400"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
              }`}
              title="Settings (API Key & Model)"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60 transition-colors"
              title="Dismiss (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Hotkey Collision Alert (ADR-008) */}
        {!hotkeyInfo.registered && (
          <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="truncate">
              Hotkey {hotkeyInfo.shortcut} collision. Use manual trigger buttons below.
            </span>
          </div>
        )}

        {/* Settings Drawer */}
        {showSettings && (
          <div className="p-3 border-b border-neutral-800 bg-neutral-900/90 text-xs space-y-2.5">
            <div className="flex items-center justify-between text-neutral-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-sky-400" />
                Vision AI Configuration
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] text-neutral-400 hover:text-neutral-200"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">
                  Provider
                </label>
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const prov = e.target.value as "gemini" | "openai";
                    updateSettings({
                      provider: prov,
                      model: prov === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini",
                    });
                  }}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 outline-none"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                  placeholder={
                    settings.provider === "gemini"
                      ? "gemini-1.5-flash"
                      : "gpt-4o-mini"
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">
                API Key
              </label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSettings({ apiKey: e.target.value })}
                placeholder="Paste Gemini (AIza...) or OpenAI (sk-...) API key"
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 outline-none focus:border-sky-500"
              />
            </div>
          </div>
        )}

        {/* Status Bar & Quick Actions */}
        <div className="px-3.5 py-1.5 border-b border-neutral-800/60 flex items-center justify-between text-xs bg-neutral-900/30">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                state === "capturing"
                  ? "bg-amber-400 animate-pulse"
                  : state === "thinking"
                  ? "bg-sky-400 animate-ping"
                  : state === "ready"
                  ? "bg-emerald-400"
                  : state === "error"
                  ? "bg-rose-400"
                  : "bg-neutral-500"
              }`}
            />
            <span className="text-[11px] font-medium text-neutral-300">
              {state === "idle" && "Ready (Alt+T)"}
              {state === "capturing" && "Capturing window..."}
              {state === "thinking" && "Vision AI thinking..."}
              {state === "ready" && "Explanation ready"}
              {state === "error" && "Error occurred"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleTrigger()}
              disabled={state === "capturing" || state === "thinking"}
              className="px-2 py-1 rounded text-[11px] font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Retake capture (Alt+T)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retake</span>
            </button>
          </div>
        </div>

        {/* Quick Topic Chips */}
        {state !== "capturing" && (
          <div className="px-3 py-1.5 border-b border-neutral-800/40 flex items-center gap-1.5 overflow-x-auto text-[10px] scrollbar-none">
            <button
              onClick={() => handleTrigger("Explain this concept in simple bullet points.")}
              className="shrink-0 px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 flex items-center gap-1 transition-colors"
            >
              <HelpCircle className="w-2.5 h-2.5 text-sky-400" />
              Explain Concept
            </button>
            <button
              onClick={() => handleTrigger("Find bugs, errors, or issues in this view.")}
              className="shrink-0 px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 flex items-center gap-1 transition-colors"
            >
              <Bug className="w-2.5 h-2.5 text-rose-400" />
              Find Bug / Error
            </button>
            <button
              onClick={() => handleTrigger("Summarize the main takeaways clearly.")}
              className="shrink-0 px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 flex items-center gap-1 transition-colors"
            >
              <BookOpen className="w-2.5 h-2.5 text-emerald-400" />
              Summarize
            </button>
          </div>
        )}

        {/* Content & Messages Area */}
        <div className="p-3.5 overflow-y-auto max-h-[320px] text-xs leading-relaxed text-neutral-200 space-y-3 select-text">
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="text-[11px] leading-normal">{errorMessage}</div>
            </div>
          )}

          {/* Empty / Idle State */}
          {state === "idle" && messages.length === 0 && !currentStreamingText && !errorMessage && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="p-3 rounded-2xl bg-neutral-900/90 border border-neutral-800 text-neutral-400 shadow-inner">
                <Camera className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <p className="text-neutral-200 font-medium text-xs">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono text-[11px] text-sky-300">Alt + T</kbd>
                </p>
                <p className="text-[11px] text-neutral-400 mt-1 max-w-[280px]">
                  Captures active window & delivers an instant tutor breakdown.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleTrigger()}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md shadow-sky-600/20 transition-all"
                >
                  Capture Active Window
                </button>

                {!isTauri && (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1 transition-colors"
                      title="Upload test screenshot (or Ctrl+V to paste)"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Test Image</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Thinking / Spinner State */}
          {state === "thinking" && !currentStreamingText && messages.length === 0 && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 text-neutral-400">
              <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <p className="text-[11px] text-neutral-300 animate-pulse">
                Analyzing screen with vision AI...
              </p>
            </div>
          )}

          {/* Multi-turn Messages Thread */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`rounded-xl p-3 text-xs ${
                msg.role === "user"
                  ? "bg-sky-950/40 border border-sky-800/40 text-sky-100 ml-6"
                  : "bg-neutral-900/60 border border-neutral-800/60 text-neutral-200"
              }`}
            >
              <div className="flex items-center justify-between mb-1 text-[10px] text-neutral-400">
                <span className="font-semibold uppercase tracking-wider text-sky-400">
                  {msg.role === "user" ? "You" : "Tutor"}
                </span>
                {msg.role === "tutor" && (
                  <button
                    onClick={() => handleCopy(msg.content, idx)}
                    className="hover:text-neutral-200 flex items-center gap-1 transition-colors"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <div className="prose prose-invert prose-xs max-w-none leading-relaxed">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}

          {/* Current Streaming Message */}
          {currentStreamingText && (
            <div className="rounded-xl p-3 text-xs bg-neutral-900/60 border border-neutral-800/60 text-neutral-200">
              <div className="flex items-center justify-between mb-1 text-[10px] text-neutral-400">
                <span className="font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                  Tutor (Streaming...)
                </span>
              </div>
              <div className="prose prose-invert prose-xs max-w-none leading-relaxed">
                <ReactMarkdown>{currentStreamingText}</ReactMarkdown>
              </div>
            </div>
          )}

          <div ref={contentEndRef} />
        </div>

        {/* Follow-up Question Input Form */}
        <div className="p-2.5 border-t border-neutral-800/80 bg-neutral-900/50">
          <form onSubmit={handleFollowUpSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={
                state === "thinking"
                  ? "Tutor is answering..."
                  : "Ask a follow-up question... (Enter)"
              }
              disabled={state === "thinking" || state === "capturing"}
              className="flex-1 bg-neutral-900/90 border border-neutral-700/80 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-sky-500 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!followUp.trim() || state === "thinking"}
              className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white transition-colors shadow-sm"
              title="Send follow-up"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
