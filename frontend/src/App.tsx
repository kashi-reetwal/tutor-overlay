import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
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
  Shield,
  ExternalLink,
  Cpu,
  Radio,
  Terminal,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  FileCode,
  Monitor,
  Minus,
  Maximize2,
  Sparkles,
} from "lucide-react";

type CardState = "idle" | "capturing" | "thinking" | "ready" | "error";

interface Message {
  role: "user" | "jarvis";
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

// Generate a sample synthetic screen for quick 1-click vision testing
function generateSampleScreen(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Dark IDE theme background
  ctx.fillStyle = "#0D1117";
  ctx.fillRect(0, 0, 800, 450);

  // Editor title bar
  ctx.fillStyle = "#161B22";
  ctx.fillRect(0, 0, 800, 36);

  // Window dots
  ctx.fillStyle = "#FF5F56"; ctx.beginPath(); ctx.arc(20, 18, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#FFBD2E"; ctx.beginPath(); ctx.arc(36, 18, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#27C93F"; ctx.beginPath(); ctx.arc(52, 18, 5, 0, Math.PI * 2); ctx.fill();

  // Tab
  ctx.fillStyle = "#0D1117";
  ctx.fillRect(70, 6, 140, 30);
  ctx.fillStyle = "#C9D1D9";
  ctx.font = "12px monospace";
  ctx.fillText("algorithm.ts", 85, 24);

  // Code lines
  ctx.fillStyle = "#8B949E";
  ctx.fillText("1", 20, 70);
  ctx.fillText("2", 20, 95);
  ctx.fillText("3", 20, 120);
  ctx.fillText("4", 20, 145);
  ctx.fillText("5", 20, 170);
  ctx.fillText("6", 20, 195);
  ctx.fillText("7", 20, 220);

  ctx.fillStyle = "#FF7B72";
  ctx.fillText("function", 45, 70);
  ctx.fillStyle = "#D2A8FF";
  ctx.fillText("binarySearch", 110, 70);
  ctx.fillStyle = "#C9D1D9";
  ctx.fillText("(arr: number[], target: number): number {", 205, 70);

  ctx.fillStyle = "#79C0FF";
  ctx.fillText("  let", 45, 95);
  ctx.fillStyle = "#C9D1D9";
  ctx.fillText(" low = 0, high = arr.length - 1;", 75, 95);

  ctx.fillStyle = "#FF7B72";
  ctx.fillText("  while", 45, 120);
  ctx.fillStyle = "#C9D1D9";
  ctx.fillText(" (low <= high) {", 90, 120);

  ctx.fillStyle = "#79C0FF";
  ctx.fillText("    const", 45, 145);
  ctx.fillStyle = "#C9D1D9";
  ctx.fillText(" mid = Math.floor((low + high) / 2);", 95, 145);

  ctx.fillStyle = "#8B949E";
  ctx.fillText("    // Target match check (O(log n) efficiency)", 45, 170);

  ctx.fillStyle = "#FF7B72";
  ctx.fillText("    if", 45, 195);
  ctx.fillStyle = "#C9D1D9";
  ctx.fillText(" (arr[mid] === target) return mid;", 65, 195);

  ctx.fillStyle = "#C9D1D9";
  ctx.fillText("  } return -1; }", 45, 220);

  return canvas.toDataURL("image/jpeg", 0.9);
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [borderTheme, setBorderTheme] = useState<"assistant" | "arc" | "gold">(() => {
    return (localStorage.getItem("tutor_border_theme") as any) || "assistant";
  });
  const [borderIntensity, setBorderIntensity] = useState<number>(() => {
    const saved = localStorage.getItem("tutor_border_intensity");
    return saved ? Number(saved) : 100;
  });

  const updateBorderTheme = (theme: "assistant" | "arc" | "gold") => {
    setBorderTheme(theme);
    localStorage.setItem("tutor_border_theme", theme);
  };

  const updateBorderIntensity = (val: number) => {
    setBorderIntensity(val);
    localStorage.setItem("tutor_border_intensity", String(val));
  };

  const [simulateDesktop, setSimulateDesktop] = useState(false);

  const [testConnectionStatus, setTestConnectionStatus] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
  }>({ testing: false });

  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem("tutor_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Auto-migrate from deprecated gemini-1.5-pro to free-tier gemini-1.5-flash
        if (parsed.model === "gemini-1.5-pro") {
          parsed.model = "gemini-1.5-flash";
          localStorage.setItem("tutor_settings", JSON.stringify(parsed));
        }
        return parsed;
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Free dragging system
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (position === null) {
      const initialX = Math.max(20, window.innerWidth - 490);
      const initialY = Math.max(20, window.innerHeight - 560);
      setPosition({ x: initialX, y: initialY });
    }
  }, [position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }
    isDraggingRef.current = true;
    dragStartOffsetRef.current = {
      x: e.clientX - (position?.x ?? 0),
      y: e.clientY - (position?.y ?? 0),
    };
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const cardWidth = cardRef.current?.offsetWidth || 460;
    const cardHeight = cardRef.current?.offsetHeight || 500;

    let newX = e.clientX - dragStartOffsetRef.current.x;
    let newY = e.clientY - dragStartOffsetRef.current.y;

    newX = Math.max(10, Math.min(window.innerWidth - cardWidth - 10, newX));
    newY = Math.max(10, Math.min(window.innerHeight - cardHeight - 10, newY));

    setPosition({ x: newX, y: newY });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Browser test mode image
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingText, state]);

  const updateSettings = (partial: Partial<UserSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    localStorage.setItem("tutor_settings", JSON.stringify(updated));
  };

  // Test API Key Connection
  const handleTestConnection = async () => {
    const cleanApiKey = settings.apiKey.trim().replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
    const cleanModel = settings.model.trim().replace(/^['"]|['"]$/g, "") || "gemini-1.5-flash";

    if (cleanApiKey !== settings.apiKey || cleanModel !== settings.model) {
      updateSettings({ apiKey: cleanApiKey, model: cleanModel });
    }

    if (!cleanApiKey) {
      setTestConnectionStatus({
        testing: false,
        success: false,
        message: "Please paste your API key first.",
      });
      return;
    }

    setTestConnectionStatus({ testing: true });

    try {
      if (settings.provider === "gemini") {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanApiKey}`;
        let res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Ping. Reply with: ONLINE" }] }],
          }),
        });

        if (res.status === 404 && cleanModel !== "gemini-1.5-flash") {
          // Automatic recovery: Fallback to gemini-1.5-flash
          const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanApiKey}`;
          const fallbackRes = await fetch(fallbackEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "Ping. Reply with: ONLINE" }] }],
            }),
          });

          if (fallbackRes.ok) {
            updateSettings({ model: "gemini-1.5-flash" });
            const data = await fallbackRes.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "ONLINE";
            setTestConnectionStatus({
              testing: false,
              success: true,
              message: `'${cleanModel}' unavailable; auto-switched to gemini-1.5-flash: "${reply}"`,
            });
            return;
          }
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const rawMsg = errData.error?.message || `HTTP ${res.status}`;
          let guidance = rawMsg;
          if (res.status === 400 && rawMsg.includes("API key not valid")) {
            guidance = "API Key not valid. Get a free key at aistudio.google.com";
          } else if (res.status === 404) {
            guidance = `Model '${cleanModel}' not found. Select 'gemini-1.5-flash'.`;
          } else if (res.status === 429) {
            guidance = "Rate limit / quota exceeded. Try again in 1 minute.";
          }
          throw new Error(guidance);
        }

        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "ONLINE";
        setTestConnectionStatus({
          testing: false,
          success: true,
          message: `Uplink verified: ${cleanModel} replied "${reply}"`,
        });
      } else {
        const endpoint = settings.baseUrl || "https://api.openai.com/v1/chat/completions";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cleanApiKey}`,
          },
          body: JSON.stringify({
            model: cleanModel,
            messages: [{ role: "user", content: "Ping" }],
            max_tokens: 5,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}`);
        }

        setTestConnectionStatus({
          testing: false,
          success: true,
          message: `Uplink verified: ${cleanModel} online!`,
        });
      }
    } catch (err: any) {
      setTestConnectionStatus({
        testing: false,
        success: false,
        message: err.message || "Connection failed",
      });
    }
  };

  // Tauri listeners
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
          setMessages((prev) => [...prev, { role: "jarvis", content: event.payload }]);
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

  // Escape key listener to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Clipboard paste of images in browser test mode
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
              handleTrigger("JARVIS, analyze this pasted screenshot and deliver a crisp tutoring breakdown.");
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Robust Client-side Vision AI caller for Browser mode
  const runBrowserVisionAI = async (
    rawImage: string | null,
    prompt: string
  ): Promise<void> => {
    setState("thinking");
    setCurrentStreamingText("");
    setErrorMessage(null);

    const cleanApiKey = settings.apiKey.trim().replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
    const cleanModel = settings.model.trim().replace(/^['"]|['"]$/g, "") || (settings.provider === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini");

    // 1. If NO API key is supplied, run simulated high-fidelity response immediately!
    if (!cleanApiKey) {
      const sampleText = `### 🌐 JARVIS // TACTICAL ANALYSIS COMPLETE\n\n**DIAGNOSTIC TELEMETRY:**\n- **Algorithm In Focus:** Binary Search algorithm implementation.\n- **Time Complexity:** \`O(log n)\` — halves search space each iteration.\n- **Space Complexity:** \`O(1)\` auxiliary space.\n\n\`\`\`typescript\n// Binary search pointer logic check:\nconst mid = Math.floor((low + high) / 2);\nif (arr[mid] === target) return mid;\nelse if (arr[mid] < target) low = mid + 1;\nelse high = mid - 1;\n\`\`\`\n\n> 💡 **Live AI Note:** To stream real-time Gemini vision answers on your own screen, click **Settings ⚙️** (top right) and paste your free **Gemini API Key**.`;

      let index = 0;
      const interval = setInterval(() => {
        index += 24;
        if (index <= sampleText.length) {
          setCurrentStreamingText(sampleText.slice(0, index));
        } else {
          clearInterval(interval);
          setMessages((prev) => [...prev, { role: "jarvis", content: sampleText }]);
          setCurrentStreamingText("");
          setState("ready");
        }
      }, 25);
      return;
    }

    // 2. Real API call with user's key
    try {
      // Auto-fallback: if user hasn't uploaded/pasted an image, provide the sample IDE frame so Vision AI has context
      let effectiveImage = rawImage;
      if (!effectiveImage || !effectiveImage.startsWith("data:image/")) {
        effectiveImage = generateSampleScreen();
        setPreviewImage(effectiveImage);
      }

      const cleanB64 = effectiveImage.replace(/^data:image\/[a-z]+;base64,/, "");

      if (settings.provider === "gemini") {
        const parts: any[] = [
          {
            text: `You are JARVIS, an ultra-intelligent, sharp, and encouraging AI tutor.
Analyze this code/screen viewport and deliver a clear, tactical tutoring explanation with bullet points and code highlights.
User Query: ${prompt}`,
          },
        ];

        if (cleanB64 && cleanB64.length > 50) {
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanB64,
            },
          });
        }

        const directEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanApiKey}`;
        let res = await fetch(directEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
          }),
        });

        // Automatic fallback on 404 (e.g. if gemini-1.5-pro is unavailable on free tier)
        if (res.status === 404 && cleanModel !== "gemini-1.5-flash") {
          updateSettings({ model: "gemini-1.5-flash" });
          const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanApiKey}`;
          res = await fetch(fallbackEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
            }),
          });
        }

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const errMsg = errJson.error?.message || `HTTP ${res.status}`;
          let friendly = errMsg;
          if (res.status === 400 && errMsg.includes("API key not valid")) {
            friendly = "Invalid Gemini API Key. Click Settings (⚙️) to update your key from Google AI Studio.";
          } else if (res.status === 404) {
            friendly = `Model '${cleanModel}' not found. Select 'gemini-1.5-flash' in Settings.`;
          } else if (res.status === 429) {
            friendly = "Gemini API Quota exceeded. Please wait a moment before trying again.";
          }
          throw new Error(friendly);
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const ansText = candidate?.content?.parts?.[0]?.text;

        if (!ansText) {
          const reason = candidate?.finishReason || "No content generated";
          throw new Error(`Gemini completed with reason: ${reason}`);
        }

        // Animate text stream into UI for smooth JARVIS delivery
        let index = 0;
        const chunkSize = Math.max(8, Math.floor(ansText.length / 35));
        const streamInterval = setInterval(() => {
          index += chunkSize;
          if (index < ansText.length) {
            setCurrentStreamingText(ansText.slice(0, index));
          } else {
            clearInterval(streamInterval);
            setCurrentStreamingText("");
            setMessages((prev) => [...prev, { role: "jarvis", content: ansText }]);
            setState("ready");
          }
        }, 20);
      } else {
        // OpenAI / compatible
        const endpoint = settings.baseUrl || "https://api.openai.com/v1/chat/completions";
        const userContent: any[] = [{ type: "text", text: prompt }];

        if (cleanB64 && cleanB64.length > 50) {
          userContent.push({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${cleanB64}` },
          });
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cleanApiKey}`,
          },
          body: JSON.stringify({
            model: cleanModel,
            messages: [
              {
                role: "system",
                content: "You are JARVIS, an ultra-intelligent AI tutor. Break down the user's screen clearly with tactical highlights.",
              },
              { role: "user", content: userContent },
            ],
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error?.message || `AI Provider HTTP ${res.status}`);
        }

        const data = await res.json();
        const ansText = data.choices?.[0]?.message?.content || "Answer generated.";
        setMessages((prev) => [...prev, { role: "jarvis", content: ansText }]);
        setState("ready");
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      setErrorMessage(err.message || "Failed to query AI provider");
      setState("error");
    }
  };

  const handleTrigger = async (customPrompt?: string) => {
    setState("capturing");
    setErrorMessage(null);
    setCurrentStreamingText("");

    const prompt =
      customPrompt || "JARVIS, analyze the visible context on screen and deliver an executive tutoring brief.";

    setMessages([{ role: "user", content: prompt }]);

    if (isTauri) {
      try {
        await tauriInvoke("trigger_tutor", {
          userQuery: prompt,
          apiConfig: {
            provider: settings.provider,
            model: settings.model,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
          },
        });
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Tactical capture failed");
        setState("error");
      }
    } else {
      setTimeout(() => {
        runBrowserVisionAI(previewImage, prompt);
      }, 400);
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
        await tauriInvoke("send_followup", {
          query,
          apiConfig: {
            provider: settings.provider,
            model: settings.model,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
          },
        });
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Command link failed");
        setState("ready");
      }
    } else {
      const cleanApiKey = settings.apiKey.trim().replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
      const cleanModel = settings.model.trim().replace(/^['"]|['"]$/g, "") || (settings.provider === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini");

      if (!cleanApiKey) {
        setTimeout(() => {
          const followUpAnswer = `**JARVIS Response // Telemetry Lock:**\n\nAddressing query: *"${query}"*\n\n- Analyzing referenced variables in the prior frame.\n- Solution parameters confirmed. Enter your **Gemini Key** in Settings ⚙️ to run multi-turn live AI reasoning.`;
          setMessages((prev) => [...prev, { role: "jarvis", content: followUpAnswer }]);
          setState("ready");
        }, 600);
      } else {
        try {
          if (settings.provider === "gemini") {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanApiKey}`;
            
            // Build conversation history ensuring it starts with user role and alternates
            const contents: any[] = [];
            for (const m of messages) {
              contents.push({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content }],
              });
            }

            if (contents.length === 0 || contents[0].role !== "user") {
              contents.unshift({
                role: "user",
                parts: [{ text: "Context visual analysis and tutoring session." }],
              });
            }

            contents.push({ role: "user", parts: [{ text: query }] });

            let res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents }),
            });

            if (res.status === 404 && cleanModel !== "gemini-1.5-flash") {
              updateSettings({ model: "gemini-1.5-flash" });
              const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanApiKey}`;
              res = await fetch(fallbackEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents }),
              });
            }

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.error?.message || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const ansText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Answer generated.";
            setMessages((prev) => [...prev, { role: "jarvis", content: ansText }]);
            setState("ready");
          } else {
            const endpoint = settings.baseUrl || "https://api.openai.com/v1/chat/completions";
            const msgs = messages.map((m) => ({
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
            }));
            msgs.push({ role: "user", content: query });

            const res = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cleanApiKey}`,
              },
              body: JSON.stringify({
                model: cleanModel,
                messages: msgs,
              }),
            });

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.error?.message || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const ansText = data.choices?.[0]?.message?.content || "Answer generated.";
            setMessages((prev) => [...prev, { role: "jarvis", content: ansText }]);
            setState("ready");
          }
        } catch (err: any) {
          setErrorMessage(err.message || "Follow-up failed");
          setState("ready");
        }
      }
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
        handleTrigger("Analyze telemetry and visual context in this uploaded frame.");
      };
      reader.readAsDataURL(file);
    }
  };

  const loadSampleAndTrigger = () => {
    const sampleB64 = generateSampleScreen();
    setPreviewImage(sampleB64);
    handleTrigger("JARVIS, tutor me on this algorithm code snippet: explain logic, edge cases, and complexity.");
  };

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden select-none pointer-events-none font-mono antialiased text-cyan-100 bg-transparent">
      {/* Optional Simulated Desktop Background in Browser Preview */}
      {!isTauri && simulateDesktop && (
        <div className="absolute inset-6 rounded-xl border border-cyan-500/20 bg-[#090F1C]/85 backdrop-blur-sm overflow-hidden flex flex-col pointer-events-none shadow-2xl opacity-75 transition-all">
          <div className="h-8 bg-[#0C152B] border-b border-cyan-500/20 px-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-2 text-[10px] text-cyan-300 font-mono">VS Code - algorithm.ts (Active Background Window)</span>
            </div>
            <span className="text-[9px] text-cyan-600 font-mono tracking-wider">CENTER VIEWPORT VISIBLE (100% TRANSPARENT)</span>
          </div>
          <div className="p-8 font-mono text-xs text-slate-300 space-y-2 opacity-90 select-none">
            <p className="text-cyan-400/90">// Background Window is completely visible through the center of the screen</p>
            <p className="text-purple-400">function <span className="text-yellow-300">binarySearch</span>(arr: number[], target: number): number &#123;</p>
            <p className="pl-6 text-cyan-200">let low = 0, high = arr.length - 1;</p>
            <p className="pl-6 text-purple-400">while (low &lt;= high) &#123;</p>
            <p className="pl-10 text-cyan-200">const mid = Math.floor((low + high) / 2);</p>
            <p className="pl-10 text-purple-400">if (arr[mid] === target) return mid;</p>
            <p className="pl-10 text-purple-400">else if (arr[mid] &lt; target) low = mid + 1;</p>
            <p className="pl-10 text-purple-400">else high = mid - 1;</p>
            <p className="pl-6 text-purple-400">&#125;</p>
            <p className="pl-6 text-rose-400">return -1;</p>
            <p className="text-purple-400">&#125;</p>
          </div>
        </div>
      )}

      {/* 4 Corner Ambient Flares (Google Assistant corner curvature lighting) */}
      <div
        className="absolute top-0 left-0 w-36 h-36 pointer-events-none rounded-br-full filter blur-xl transition-all duration-700"
        style={{
          opacity: (borderIntensity / 100) * 0.75,
          background:
            borderTheme === "assistant"
              ? "radial-gradient(circle at 0% 0%, #4285F4 0%, #9B51E0 50%, transparent 80%)"
              : borderTheme === "gold"
              ? "radial-gradient(circle at 0% 0%, #F59E0B 0%, #EF4444 50%, transparent 80%)"
              : "radial-gradient(circle at 0% 0%, #00F0FF 0%, #3B82F6 50%, transparent 80%)",
        }}
      />
      <div
        className="absolute top-0 right-0 w-36 h-36 pointer-events-none rounded-bl-full filter blur-xl transition-all duration-700"
        style={{
          opacity: (borderIntensity / 100) * 0.75,
          background:
            borderTheme === "assistant"
              ? "radial-gradient(circle at 100% 0%, #EA4335 0%, #FBBC05 50%, transparent 80%)"
              : borderTheme === "gold"
              ? "radial-gradient(circle at 100% 0%, #EF4444 0%, #FBBF24 50%, transparent 80%)"
              : "radial-gradient(circle at 100% 0%, #00F0FF 0%, #06B6D4 50%, transparent 80%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-36 h-36 pointer-events-none rounded-tr-full filter blur-xl transition-all duration-700"
        style={{
          opacity: (borderIntensity / 100) * 0.75,
          background:
            borderTheme === "assistant"
              ? "radial-gradient(circle at 0% 100%, #34A853 0%, #4285F4 50%, transparent 80%)"
              : borderTheme === "gold"
              ? "radial-gradient(circle at 0% 100%, #FBBF24 0%, #F59E0B 50%, transparent 80%)"
              : "radial-gradient(circle at 0% 100%, #00F0FF 0%, #3B82F6 50%, transparent 80%)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-36 h-36 pointer-events-none rounded-tl-full filter blur-xl transition-all duration-700"
        style={{
          opacity: (borderIntensity / 100) * 0.75,
          background:
            borderTheme === "assistant"
              ? "radial-gradient(circle at 100% 100%, #FBBC05 0%, #34A853 50%, transparent 80%)"
              : borderTheme === "gold"
              ? "radial-gradient(circle at 100% 100%, #EF4444 0%, #F59E0B 50%, transparent 80%)"
              : "radial-gradient(circle at 100% 100%, #00F0FF 0%, #10B981 50%, transparent 80%)",
        }}
      />

      {/* Google Assistant / Gemini Screen Boundary Lightning Glow */}
      <div
        style={{ opacity: borderIntensity / 100 }}
        className={`absolute inset-0 pointer-events-none transition-all duration-700 ${
          state === "capturing"
            ? "screen-lightning-capturing"
            : state === "thinking"
            ? "screen-lightning-thinking"
            : state === "error"
            ? "screen-lightning-error"
            : state === "ready"
            ? "screen-lightning-ready"
            : "screen-lightning-idle"
        }`}
      />

      {/* Perimeter Animated Neon Lightning Beams */}
      <div className="absolute top-0 left-0 right-0 h-[3.5px] overflow-hidden pointer-events-none">
        <div
          className={`w-full h-full animate-beam-top ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_18px_#4285F4]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_18px_#F59E0B]"
              : "arc-reactor-border shadow-[0_0_18px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3.5px] overflow-hidden pointer-events-none">
        <div
          className={`w-full h-full animate-beam-bottom ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_18px_#34A853]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_18px_#EF4444]"
              : "arc-reactor-border shadow-[0_0_18px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 left-0 bottom-0 w-[3.5px] overflow-hidden pointer-events-none">
        <div
          className={`w-full h-full animate-beam-left ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_18px_#9B51E0]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_18px_#FBBF24]"
              : "arc-reactor-border shadow-[0_0_18px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 right-0 bottom-0 w-[3.5px] overflow-hidden pointer-events-none">
        <div
          className={`w-full h-full animate-beam-right ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_18px_#EA4335]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_18px_#DC2626]"
              : "arc-reactor-border shadow-[0_0_18px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>

      {/* Fullscreen Laser Sweep during Screen Capture */}
      {state === "capturing" && (
        <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-300 via-amber-300 to-transparent shadow-[0_0_25px_#00F0FF] animate-laser-sweep pointer-events-none z-10" />
      )}

      {/* 4 Outer Screen Perimeter Sci-Fi HUD Corner Reticles */}
      <div className="absolute top-3 left-3 w-10 h-10 border-t-2 border-l-2 border-cyan-400/80 drop-shadow-[0_0_8px_#00F0FF] pointer-events-none flex flex-col justify-start items-start pl-1.5 pt-1">
        <span className="text-[7px] text-cyan-400 font-mono tracking-widest font-bold">JARVIS // HUD</span>
        <span className="text-[6px] text-cyan-600 font-mono">SEC.01</span>
      </div>
      <div className="absolute top-3 right-3 w-10 h-10 border-t-2 border-r-2 border-cyan-400/80 drop-shadow-[0_0_8px_#00F0FF] pointer-events-none flex flex-col justify-start items-end pr-1.5 pt-1">
        <span className="text-[7px] text-cyan-400 font-mono tracking-widest font-bold">OPTIC.LOCK</span>
        <span className="text-[6px] text-cyan-600 font-mono">100% VIS</span>
      </div>
      <div className="absolute bottom-3 left-3 w-10 h-10 border-b-2 border-l-2 border-cyan-400/80 drop-shadow-[0_0_8px_#00F0FF] pointer-events-none flex flex-col justify-end items-start pl-1.5 pb-1">
        <span className="text-[6px] text-cyan-600 font-mono">LAT.14MS</span>
        <span className="text-[7px] text-cyan-400 font-mono tracking-widest font-bold">RECON // ACTIVE</span>
      </div>
      <div className="absolute bottom-3 right-3 w-10 h-10 border-b-2 border-r-2 border-cyan-400/80 drop-shadow-[0_0_8px_#00F0FF] pointer-events-none flex flex-col justify-end items-end pr-1.5 pb-1">
        <span className="text-[6px] text-cyan-600 font-mono">FREQ.5.8G</span>
        <span className="text-[7px] text-cyan-400 font-mono tracking-widest font-bold">TELEMETRY.SYNC</span>
      </div>

      {/* Top Screen Perimeter Status Capsule */}
      <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full border border-cyan-500/40 bg-[#040C1A]/90 backdrop-blur-md flex items-center gap-2.5 shadow-[0_0_20px_rgba(0,240,255,0.25)] select-none z-20">
        <div className="relative flex items-center justify-center w-3 h-3">
          <div className={`absolute inset-0 rounded-full border border-dashed animate-spin-slow ${borderTheme === "assistant" ? "border-purple-400" : "border-cyan-400"}`} />
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${borderTheme === "assistant" ? "bg-amber-400" : "bg-cyan-400"}`} />
        </div>
        <span className="text-[10px] font-bold text-cyan-200 tracking-wider">
          {borderTheme === "assistant" ? "GEMINI LIGHTNING ACTIVE" : "JARVIS ACTIVE VIEWPORT"}
        </span>
        <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 font-mono">
          {hotkeyInfo.shortcut}
        </span>

        {/* Quick Theme Switcher Pill */}
        <button
          onClick={() => {
            const next = borderTheme === "assistant" ? "arc" : borderTheme === "arc" ? "gold" : "assistant";
            updateBorderTheme(next);
          }}
          className="text-[9px] px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 font-mono flex items-center gap-1 transition-colors"
          title="Cycle screen boundary lighting aura theme"
        >
          <Sparkles className="w-2.5 h-2.5 text-cyan-300" />
          <span>
            {borderTheme === "assistant" && "AURORA"}
            {borderTheme === "arc" && "ARC"}
            {borderTheme === "gold" && "MARK-85"}
          </span>
        </button>

        {/* One-Click Screen Scan Trigger */}
        <button
          onClick={() => handleTrigger("Explain what is displayed on my screen and highlight key elements.")}
          disabled={state === "capturing" || state === "thinking"}
          className="text-[9px] px-2 py-0.5 rounded border border-cyan-400/60 bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-100 font-bold flex items-center gap-1 transition-all shadow-[0_0_10px_rgba(0,240,255,0.3)]"
          title="Analyze background window immediately"
        >
          <Zap className="w-2.5 h-2.5 text-cyan-300" />
          <span>SCAN SCREEN</span>
        </button>

        {!isTauri && (
          <button
            onClick={() => setSimulateDesktop(!simulateDesktop)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              simulateDesktop
                ? "border-emerald-400 bg-emerald-950/70 text-emerald-300"
                : "border-cyan-500/30 bg-cyan-950/40 text-cyan-400 hover:text-cyan-200"
            }`}
            title="Toggle simulated background window to preview transparent center over desktop"
          >
            <Monitor className="w-2.5 h-2.5" />
            <span>{simulateDesktop ? "DESKTOP ON" : "DESKTOP OFF"}</span>
          </button>
        )}
      </div>

      {/* Draggable Jarvis HUD Card */}
      <div
        ref={cardRef}
        style={{
          transform: position ? `translate3d(${position.x}px, ${position.y}px, 0)` : undefined,
          visibility: position ? "visible" : "hidden",
        }}
        className={`pointer-events-auto absolute top-0 left-0 w-full ${
          isCollapsed ? "max-w-[430px]" : "max-w-[470px]"
        } rounded-xl border transition-all duration-300 overflow-hidden backdrop-blur-2xl flex flex-col jarvis-grid ${
          state === "error"
            ? "border-rose-500/60 bg-[#0A050B]/95 shadow-[0_0_35px_rgba(244,63,94,0.35)]"
            : state === "thinking"
            ? "border-cyan-400/80 bg-[#040C1A]/95 jarvis-glow-active"
            : "border-cyan-500/40 bg-[#050B16]/90 jarvis-glow"
        }`}
      >
        {isCollapsed ? (
          <div
            data-tauri-drag-region
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-3.5 py-2.5 bg-[#08152B]/95 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2.5 pointer-events-none">
              <div className="relative flex items-center justify-center w-5 h-5">
                <div
                  className={`absolute inset-0 rounded-full border border-dashed animate-spin-slow ${
                    borderTheme === "assistant" ? "border-purple-400" : "border-cyan-400"
                  }`}
                />
                <div
                  className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_10px_#00F0FF] ${
                    borderTheme === "assistant"
                      ? "bg-gradient-to-r from-blue-400 to-amber-400"
                      : "bg-cyan-400"
                  }`}
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-cyan-200 tracking-wider font-mono">
                  {state === "thinking"
                    ? "ANALYZING SCREEN..."
                    : state === "capturing"
                    ? "CAPTURING SCREEN..."
                    : "JARVIS SCREEN ASSISTANT"}
                </span>
                <span className="text-[8px] text-cyan-500 font-mono">
                  {state === "ready" ? "ANSWER READY // EXPAND" : "100% TRANSPARENT CENTER"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTrigger("Explain what is displayed on my screen and highlight key elements.");
                }}
                disabled={state === "capturing" || state === "thinking"}
                className="px-2 py-1 rounded bg-cyan-500/25 hover:bg-cyan-500/40 border border-cyan-400/50 text-[10px] text-cyan-200 font-bold flex items-center gap-1 transition-all shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                title="Capture & Explain Screen"
              >
                <Zap className="w-3 h-3 text-cyan-300" />
                <span>Screen Read</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(false);
                }}
                className="p-1 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors"
                title="Expand full HUD"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss();
                }}
                className="p-1 rounded-md text-cyan-400/70 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Sci-Fi Corner Brackets */}
            <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
            <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
            <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

            {/* Header / Drag Bar */}
            <div
              data-tauri-drag-region
              onMouseDown={handleMouseDown}
              className="flex items-center justify-between px-3.5 py-2.5 border-b border-cyan-500/30 bg-[#08152B]/80 cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-2 pointer-events-none">
                {/* Glowing Mini Arc Core */}
                <div className="relative flex items-center justify-center w-5 h-5">
                  <div className="absolute inset-0 rounded-full border border-cyan-400/50 border-dashed animate-spin-slow" />
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#00F0FF] animate-pulse" />
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] font-bold tracking-widest text-cyan-300 jarvis-text-glow">
                    JARVIS // OVERLAY HUD
                  </span>
                  <span className="text-[8px] text-cyan-500/80 tracking-wider">
                    TACTICAL TUTOR ENGINE v1.0
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 font-mono">
                  {hotkeyInfo.shortcut}
                </span>

                <GripHorizontal className="w-3.5 h-3.5 text-cyan-500/60" />

                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-1 rounded-md text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors"
                  title="Minimize to Floating Assistant Capsule"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1 rounded-md transition-colors ${
                    showSettings
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/50"
                      : "text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60"
                  }`}
                  title="Tactical AI Settings & API Keys"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-md text-cyan-400/70 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                  title="Dismiss Interface (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

        {/* Telemetry Status Bar */}
        <div className="px-3.5 py-1.5 border-b border-cyan-500/20 flex items-center justify-between text-[10px] bg-[#030914]/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <Radio
                className={`w-3 h-3 ${
                  state === "thinking"
                    ? "text-cyan-400 animate-spin"
                    : state === "capturing"
                    ? "text-amber-400 animate-pulse"
                    : state === "ready"
                    ? "text-emerald-400"
                    : "text-cyan-500"
                }`}
              />
              <span className="text-cyan-400 font-medium tracking-wider">
                {state === "idle" && "SYS.STANDBY"}
                {state === "capturing" && "ACQUIRING.SCREEN"}
                {state === "thinking" && "NEURAL.PROCESSING"}
                {state === "ready" && "TELEMETRY.READY"}
                {state === "error" && "UPLINK.FAULT"}
              </span>
            </div>

            {/* Jarvis Spectral Audio / Frequency Waves */}
            {(state === "thinking" || state === "ready") && (
              <div className="flex items-end gap-0.5 h-3">
                <span className="w-0.5 h-full bg-cyan-400 animate-pulse" />
                <span className="w-0.5 h-2/3 bg-cyan-400 animate-bounce" />
                <span className="w-0.5 h-4/5 bg-cyan-300 animate-pulse" />
                <span className="w-0.5 h-1/2 bg-cyan-400 animate-bounce" />
                <span className="w-0.5 h-full bg-cyan-400 animate-pulse" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] text-cyan-600 font-mono">
              LATENCY: 14MS
            </span>
            <button
              onClick={() => handleTrigger()}
              disabled={state === "capturing" || state === "thinking"}
              className="px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 flex items-center gap-1 transition-all disabled:opacity-40"
              title="Rescan Screen (Alt+T)"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>RESCAN</span>
            </button>
          </div>
        </div>

        {/* Hotkey Conflict Notification */}
        {!hotkeyInfo.registered && (
          <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-[10px] text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="truncate">
              GLOBAL SHORTCUT {hotkeyInfo.shortcut} OVERRIDDEN BY OS. USE SCAN BUTTONS.
            </span>
          </div>
        )}

        {/* Settings Drawer */}
        {showSettings && (
          <div className="p-3 border-b border-cyan-500/30 bg-[#061226]/95 text-xs space-y-2.5">
            <div className="flex items-center justify-between text-cyan-300 font-bold tracking-wide">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                AI PROTOCOL & API CONFIGURATION
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] text-cyan-500 hover:text-cyan-300"
              >
                [ CLOSE ]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-cyan-400/80 block mb-1">
                  AI PROVIDER
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
                  className="w-full bg-[#030914] border border-cyan-500/40 rounded px-2 py-1 text-xs text-cyan-200 outline-none focus:border-cyan-400"
                >
                  <option value="gemini">Google Gemini (Free API)</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] text-cyan-400/80 block mb-1">
                  VISION MODEL
                </label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value.trim() })}
                  placeholder={
                    settings.provider === "gemini"
                      ? "gemini-1.5-flash"
                      : "gpt-4o-mini"
                  }
                  className="w-full bg-[#030914] border border-cyan-500/40 rounded px-2 py-1 text-xs text-cyan-200 outline-none focus:border-cyan-400"
                />
                {settings.provider === "gemini" && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[8px] text-cyan-500/80">FREE TIER:</span>
                    {[
                      { id: "gemini-1.5-flash", label: "1.5-flash (Standard)" },
                      { id: "gemini-2.0-flash", label: "2.0-flash (New)" },
                      { id: "gemini-1.5-flash-8b", label: "1.5-8b (Fast)" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateSettings({ model: m.id })}
                        className={`text-[8px] px-1.5 py-0.5 rounded border transition-colors ${
                          settings.model === m.id
                            ? "border-cyan-400 bg-cyan-900/60 text-cyan-200 font-bold"
                            : "border-cyan-500/30 bg-[#020712] hover:border-cyan-400/50 text-cyan-400"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] text-cyan-400/80 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-cyan-400" />
                  <span>API KEY {settings.provider === "gemini" && "(Google AI Studio)"}</span>
                </label>
                {settings.provider === "gemini" && (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] text-cyan-400 hover:text-cyan-200 flex items-center gap-0.5 underline"
                  >
                    <span>Get Free Gemini Key</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSettings({ apiKey: e.target.value.trim().replace(/^['"]|['"]$/g, "") })}
                placeholder="Paste key (AIza... or sk-...) or leave empty for simulation"
                className="w-full bg-[#030914] border border-cyan-500/40 rounded px-2 py-1 text-xs text-cyan-200 outline-none focus:border-cyan-400"
              />
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-1 flex items-center justify-between gap-2">
              <button
                onClick={handleTestConnection}
                disabled={testConnectionStatus.testing || !settings.apiKey.trim()}
                className="shrink-0 px-2.5 py-1 rounded border border-cyan-500/50 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 text-[10px] flex items-center gap-1.5 transition-all disabled:opacity-40"
              >
                {testConnectionStatus.testing ? (
                  <>
                    <div className="w-2.5 h-2.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span>TESTING UPLINK...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-2.5 h-2.5 text-cyan-400" />
                    <span>TEST API KEY</span>
                  </>
                )}
              </button>

              {testConnectionStatus.message && (
                <span
                  className={`text-[10px] flex items-center gap-1 truncate max-w-[260px] ${
                    testConnectionStatus.success ? "text-emerald-400" : "text-rose-400"
                  }`}
                  title={testConnectionStatus.message}
                >
                  {testConnectionStatus.success ? (
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 shrink-0" />
                  )}
                  <span className="truncate">{testConnectionStatus.message}</span>
                </span>
              )}
            </div>

            {/* Screen Boundary Lightning Aura Customization */}
            <div className="pt-2 border-t border-cyan-500/20">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[9px] text-cyan-400/80 flex items-center gap-1 font-bold">
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                  <span>SCREEN BOUNDARY LIGHTNING AURA</span>
                </label>
                <span className="text-[9px] text-cyan-500 font-mono">GOOGLE ASSISTANT STYLE</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "assistant", label: "🌈 Gemini Aurora", desc: "Google 4-Color Flow" },
                  { id: "arc", label: "⚡ Arc Reactor", desc: "Cyan & Cobalt" },
                  { id: "gold", label: "🔥 Mark 85", desc: "Crimson & Gold" },
                ].map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => updateBorderTheme(th.id as any)}
                    className={`p-1.5 rounded border text-left flex flex-col transition-all ${
                      borderTheme === th.id
                        ? "border-cyan-400 bg-cyan-950/70 text-cyan-100 shadow-[0_0_10px_rgba(0,240,255,0.25)] font-bold"
                        : "border-cyan-500/30 bg-[#020712] hover:border-cyan-400/40 text-cyan-400"
                    }`}
                  >
                    <span className="text-[10px]">{th.label}</span>
                    <span className="text-[8px] text-cyan-500">{th.desc}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-[8px] text-cyan-500">LIGHTNING INTENSITY:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="30"
                    max="100"
                    value={borderIntensity}
                    onChange={(e) => updateBorderIntensity(Number(e.target.value))}
                    className="w-28 h-1 bg-cyan-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <span className="text-[9px] text-cyan-400 font-mono w-6 text-right">{borderIntensity}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tactical Quick Action Chips */}
        {state !== "capturing" && (
          <div className="px-3 py-1.5 border-b border-cyan-500/20 flex items-center gap-1.5 overflow-x-auto text-[9px] bg-[#020710]/40 scrollbar-none">
            <button
              onClick={() => handleTrigger("JARVIS, deliver a deep concept breakdown of this viewport in clear tactical bullets.")}
              className="shrink-0 px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 flex items-center gap-1 transition-all"
            >
              <Zap className="w-2.5 h-2.5 text-cyan-400" />
              DEEP RECON
            </button>
            <button
              onClick={() => handleTrigger("JARVIS, diagnose any code bugs, logic flaws, or errors in this frame.")}
              className="shrink-0 px-2 py-0.5 rounded border border-rose-500/40 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 flex items-center gap-1 transition-all"
            >
              <Terminal className="w-2.5 h-2.5 text-rose-400" />
              DEBUG FAULT
            </button>
            <button
              onClick={() => handleTrigger("JARVIS, provide an executive summary of the crucial highlights.")}
              className="shrink-0 px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-300 flex items-center gap-1 transition-all"
            >
              <Activity className="w-2.5 h-2.5 text-emerald-400" />
              TACTICAL BRIEF
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="p-3.5 overflow-y-auto max-h-[300px] text-xs leading-relaxed text-cyan-100/90 space-y-3 select-text">
          {errorMessage && (
            <div className="p-2.5 rounded border border-rose-500/50 bg-rose-950/40 text-rose-300 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="text-[11px] leading-normal font-mono">{errorMessage}</div>
              </div>
              {(errorMessage.includes("not found") || errorMessage.includes("1.5-pro")) && (
                <button
                  onClick={() => {
                    updateSettings({ model: "gemini-1.5-flash" });
                    setErrorMessage(null);
                    handleTrigger();
                  }}
                  className="self-start px-2.5 py-1 rounded bg-cyan-900/70 border border-cyan-400 text-cyan-200 text-[10px] hover:bg-cyan-800 transition-all font-bold flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                >
                  <Zap className="w-3 h-3 text-cyan-300" />
                  <span>SWITCH TO GEMINI-1.5-FLASH & RETRY</span>
                </button>
              )}
            </div>
          )}

          {/* Idle / Arc Reactor Hologram */}
          {state === "idle" && messages.length === 0 && !currentStreamingText && !errorMessage && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              {/* Rotating Arc Reactor Graphic */}
              <div className="relative flex items-center justify-center w-24 h-24 my-1">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-400/40 border-dashed animate-spin-slow" />
                <div className="absolute inset-2 rounded-full border border-cyan-300/30 border-t-transparent animate-spin-reverse" />
                <div className="w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-300 flex items-center justify-center shadow-[0_0_20px_#00F0FF] animate-pulse-core">
                  <Cpu className="w-6 h-6 text-cyan-300" />
                </div>
              </div>

              <div>
                <p className="text-cyan-200 font-bold tracking-widest text-xs jarvis-text-glow">
                  JARVIS TACTICAL TUTOR READY
                </p>
                <p className="text-[11px] text-cyan-500/90 mt-1 max-w-[280px]">
                  Click below to scan, or drag any sample code image to test
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  onClick={() => handleTrigger()}
                  className="px-3.5 py-1.5 rounded border border-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-bold text-xs shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>INITIALIZE SCAN</span>
                </button>

                {!isTauri && (
                  <>
                    <button
                      onClick={loadSampleAndTrigger}
                      className="px-3 py-1.5 rounded border border-indigo-500/40 bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 text-xs flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                      title="Load sample code screenshot to test Vision AI recognition"
                    >
                      <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                      <span>SAMPLE CODE</span>
                    </button>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded border border-cyan-500/30 bg-[#061226] hover:bg-cyan-900/40 text-cyan-400 text-xs flex items-center gap-1 transition-all"
                      title="Load test screenshot or press Ctrl+V"
                    >
                      <Upload className="w-3 h-3" />
                      <span>UPLOAD</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Thinking / Neural Processing State */}
          {state === "thinking" && !currentStreamingText && messages.length === 0 && (
            <div className="py-8 flex flex-col items-center justify-center space-y-3">
              <div className="relative flex items-center justify-center w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-400/50 border-t-transparent animate-spin" />
                <div className="w-7 h-7 rounded-full bg-cyan-400/20 border border-cyan-300 shadow-[0_0_15px_#00F0FF] animate-pulse" />
              </div>
              <p className="text-[11px] text-cyan-300 tracking-wider animate-pulse jarvis-text-glow">
                PROCESSING VISUAL TELEMETRY...
              </p>
            </div>
          )}

          {/* Dialogue Thread */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`rounded-lg p-3 text-xs border ${
                msg.role === "user"
                  ? "bg-[#091B33]/80 border-cyan-500/40 text-cyan-200 ml-6"
                  : "bg-[#051020]/90 border-cyan-500/20 text-cyan-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 text-[9px] text-cyan-500 border-b border-cyan-500/20 pb-1">
                <span className="font-bold uppercase tracking-widest text-cyan-300 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  {msg.role === "user" ? "OPERATOR" : "JARVIS"}
                </span>
                {msg.role === "jarvis" && (
                  <button
                    onClick={() => handleCopy(msg.content, idx)}
                    className="hover:text-cyan-200 flex items-center gap-1 transition-colors"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <div className="prose prose-invert prose-xs max-w-none leading-relaxed text-cyan-100/90">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}

          {/* Current Streaming Message */}
          {currentStreamingText && (
            <div className="rounded-lg p-3 text-xs bg-[#051020]/90 border border-cyan-400/50 text-cyan-100">
              <div className="flex items-center justify-between mb-1.5 text-[9px] text-cyan-400 border-b border-cyan-500/30 pb-1">
                <span className="font-bold uppercase tracking-widest text-cyan-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  JARVIS // TRANSMITTING STREAM
                </span>
              </div>
              <div className="prose prose-invert prose-xs max-w-none leading-relaxed text-cyan-100/90">
                <ReactMarkdown>{currentStreamingText}</ReactMarkdown>
              </div>
            </div>
          )}

          <div ref={contentEndRef} />
        </div>

        {/* Google Assistant Style Quick Action Chips */}
        <div className="px-3 py-1.5 border-t border-cyan-500/20 bg-[#020712]/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[8px] text-cyan-500 font-mono shrink-0">QUICK:</span>
          {[
            { label: "⚡ Screen Overview", prompt: "Explain everything visible on this screen clearly." },
            { label: "🐞 Detect Bugs", prompt: "Inspect the visible code for any syntax errors, bugs, or anti-patterns." },
            { label: "📝 Summarize Window", prompt: "Provide a quick, concise 3-bullet executive summary of this window." },
            { label: "💡 Next Action", prompt: "What should be the optimal next step or implementation here?" },
          ].map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleTrigger(chip.prompt)}
              disabled={state === "capturing" || state === "thinking"}
              className="shrink-0 px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/60 hover:border-cyan-400/60 text-cyan-300 text-[9px] transition-all"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Input Console */}
        <div className="p-2.5 border-t border-cyan-500/30 bg-[#040C1A]/90">
          <form onSubmit={handleFollowUpSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={
                state === "thinking"
                  ? "JARVIS is computing..."
                  : "Enter tactical directive or query... (Enter)"
              }
              disabled={state === "thinking" || state === "capturing"}
              className="flex-1 bg-[#020712] border border-cyan-500/40 rounded px-2.5 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-600 outline-none focus:border-cyan-300 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!followUp.trim() || state === "thinking"}
              className="p-1.5 rounded border border-cyan-400 bg-cyan-500/30 hover:bg-cyan-500/50 disabled:opacity-30 text-cyan-100 transition-all shadow-[0_0_10px_rgba(0,240,255,0.2)]"
              title="Transmit Query"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </>
    )}
  </div>
</div>
  );
}
