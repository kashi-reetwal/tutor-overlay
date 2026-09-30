import { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import {
  X,
  Send,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  Settings,
  Key,
  Shield,
  ExternalLink,
  Zap,
  CheckCircle2,
  XCircle,
  Monitor,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
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

interface ParsedQuizAnswer {
  option: string;
  text: string;
  confidence?: string;
  why: string;
  raw: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  provider: "gemini",
  model: "gemini-2.0-flash",
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

// Parse AI output into structured instant quiz answer format
function parseQuizResponse(fullText: string): ParsedQuizAnswer {
  if (!fullText) {
    return { option: "", text: "", why: "", raw: "" };
  }

  let option = "";
  let text = "";
  let confidence = "";
  let why = "";

  const optionMatch = fullText.match(/OPTION:\s*([^\n\r]+)/i);
  if (optionMatch) {
    option = optionMatch[1].trim();
  }

  const textMatch = fullText.match(/TEXT:\s*([^\n\r]+)/i);
  if (textMatch) {
    text = textMatch[1].trim();
  }

  const confMatch = fullText.match(/CONFIDENCE:\s*([^\n\r]+)/i);
  if (confMatch) {
    confidence = confMatch[1].trim();
  }

  const whyMatch = fullText.match(/WHY:\s*([^\n\r]+)/i);
  if (whyMatch) {
    why = whyMatch[1].trim();
  }

  // Fallback heuristics if the LLM answered conversationally without explicit labels
  if (!option) {
    const letterMatch = fullText.match(/\b([A-D])[\).\:\s]/) || fullText.match(/\(([A-D])\)/);
    if (letterMatch) {
      option = `(${letterMatch[1].toUpperCase()})`;
    } else {
      option = "ANSWER";
    }
  }

  if (!text) {
    const cleanLines = fullText
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !l.startsWith("OPTION:") &&
          !l.startsWith("CONFIDENCE:") &&
          !l.startsWith("WHY:")
      );
    text = cleanLines[0] || "Correct option identified.";
  }

  if (!why) {
    const cleanLines = fullText
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !l.startsWith("OPTION:") &&
          !l.startsWith("TEXT:") &&
          !l.startsWith("CONFIDENCE:")
      );
    if (cleanLines.length > 1) {
      why = cleanLines.slice(1).join(" ").slice(0, 160);
    }
  }

  return { option, text, confidence, why, raw: fullText };
}

// Generate realistic synthetic screen for instant 1-click vision testing
function generateSampleScreen(mode: string = "quiz"): string {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 500;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  if (mode === "quiz") {
    ctx.fillStyle = "#0B1329";
    ctx.fillRect(0, 0, 900, 500);

    // Card background
    ctx.fillStyle = "#111E38";
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(40, 30, 820, 440, 16);
      ctx.fill();
    } else {
      ctx.fillRect(40, 30, 820, 440);
    }

    // Header Tag
    ctx.fillStyle = "#38BDF8";
    ctx.font = "bold 13px monospace";
    ctx.fillText("DATA STRUCTURES & ALGORITHMS // EXAM QUESTION 14", 70, 75);

    // Question
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(
      "What is the worst-case time complexity of Binary Search on a sorted array?",
      70,
      120
    );

    const opts = [
      { tag: "(A)", text: "O(n) — Linear traversal of all elements" },
      { tag: "(B)", text: "O(log n) — Logarithmic division of search range" },
      { tag: "(C)", text: "O(n log n) — Divide and merge sort complexity" },
      { tag: "(D)", text: "O(1) — Direct indexed memory access" },
    ];

    opts.forEach((o, i) => {
      const y = 160 + i * 65;
      ctx.fillStyle = "#1E293B";
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).roundRect(70, y, 760, 48, 10);
        ctx.fill();
      } else {
        ctx.fillRect(70, y, 760, 48);
      }

      ctx.fillStyle = "#38BDF8";
      ctx.font = "bold 16px monospace";
      ctx.fillText(o.tag, 95, y + 30);

      ctx.fillStyle = "#E2E8F0";
      ctx.font = "15px sans-serif";
      ctx.fillText(o.text, 140, y + 30);
    });

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  // Code editor preview fallback
  ctx.fillStyle = "#0D1117";
  ctx.fillRect(0, 0, 900, 500);
  ctx.fillStyle = "#161B22";
  ctx.fillRect(0, 0, 900, 40);
  ctx.fillStyle = "#C9D1D9";
  ctx.font = "13px monospace";
  ctx.fillText("algorithm.ts — TypeScript", 85, 25);
  ctx.fillStyle = "#FF7B72";
  ctx.fillText("function binarySearch(arr: number[], target: number) {", 45, 80);
  ctx.fillStyle = "#79C0FF";
  ctx.fillText("  let low = 0, high = arr.length - 1;", 45, 110);
  ctx.fillStyle = "#FF7B72";
  ctx.fillText("  while (low <= high) {", 45, 140);
  ctx.fillStyle = "#C9D1D9";
  ctx.fillText("    const mid = Math.floor((low + high) / 2);", 45, 170);
  ctx.fillText("    if (arr[mid] === target) return mid;", 45, 200);
  ctx.fillText("  } return -1; }", 45, 230);

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

  const [solverMode, setSolverMode] = useState<"quiz" | "code" | "summary">(() => {
    return (localStorage.getItem("tutor_solver_mode") as any) || "quiz";
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);

  const [borderTheme, setBorderTheme] = useState<"assistant" | "arc" | "gold">(() => {
    return (localStorage.getItem("tutor_border_theme") as any) || "assistant";
  });
  const [borderIntensity, setBorderIntensity] = useState<number>(() => {
    const saved = localStorage.getItem("tutor_border_intensity");
    return saved ? Number(saved) : 100;
  });

  const [simulateDesktop, setSimulateDesktop] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
        if (parsed.model === "gemini-1.5-pro") {
          parsed.model = "gemini-2.0-flash";
          localStorage.setItem("tutor_settings", JSON.stringify(parsed));
        }
        return parsed;
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = (partial: Partial<UserSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    localStorage.setItem("tutor_settings", JSON.stringify(updated));
  };

  const updateSolverMode = (mode: "quiz" | "code" | "summary") => {
    setSolverMode(mode);
    localStorage.setItem("tutor_solver_mode", mode);
  };

  const updateBorderTheme = (theme: "assistant" | "arc" | "gold") => {
    setBorderTheme(theme);
    localStorage.setItem("tutor_border_theme", theme);
  };

  // Derive latest AI answer and parse into option format
  const latestJarvisText = useMemo(() => {
    const lastJarvis = messages.slice().reverse().find((m) => m.role === "jarvis");
    return lastJarvis?.content || currentStreamingText;
  }, [messages, currentStreamingText]);

  const parsedAnswer = useMemo(() => {
    if (!latestJarvisText) return null;
    return parseQuizResponse(latestJarvisText);
  }, [latestJarvisText]);

  // Resilient multi-tier Gemini query engine with auto-discovery and multi-model fallback
  const executeGemini = async (
    apiKey: string,
    preferredModel: string,
    contents: any[],
    onModelSwitched?: (model: string) => void
  ): Promise<{ text: string; modelUsed: string }> => {
    const cleanKey = apiKey.trim().replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
    const normalizedPreferred =
      preferredModel.trim().replace(/^['"]|['"]$/g, "").replace(/^models\//, "") ||
      "gemini-2.0-flash";

    if (!cleanKey) {
      throw new Error("No Gemini API key provided. Please enter your key in Settings.");
    }

    let lastError = "";

    // Step 1: Probe Google AI Studio's model registry to get exact list of enabled models for this key
    let candidateList: string[] = [];
    try {
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        const available = (listData.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m: any) => m.name.replace(/^models\//, ""));

        if (available.length > 0) {
          if (available.includes(normalizedPreferred)) {
            candidateList = [
              normalizedPreferred,
              ...available.filter((m: string) => m !== normalizedPreferred),
            ];
          } else {
            const standardOrder = [
              "gemini-2.0-flash",
              "gemini-1.5-flash",
              "gemini-1.5-flash-latest",
              "gemini-1.5-flash-8b",
              "gemini-2.0-flash-exp",
              "gemini-1.5-pro",
              "gemini-1.5-pro-latest",
            ];
            const foundStandard = standardOrder.find((s) => available.includes(s));
            if (foundStandard) {
              candidateList = [
                foundStandard,
                ...available.filter((m: string) => m !== foundStandard),
              ];
            } else {
              candidateList = available;
            }
          }
        }
      } else {
        const listErr = await listRes.json().catch(() => ({}));
        const errMsg = listErr.error?.message || `HTTP ${listRes.status}`;
        if (listRes.status === 400 || listRes.status === 403) {
          throw new Error(errMsg);
        }
        lastError = errMsg;
      }
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes("API key not valid") ||
          err.message.includes("API_KEY_INVALID") ||
          err.message.includes("has not been used in project") ||
          err.message.includes("disabled") ||
          err.message.includes("location is not supported"))
      ) {
        throw err;
      }
    }

    // Step 2: Fallback candidates if listModels was blocked or restricted
    if (candidateList.length === 0) {
      candidateList = Array.from(
        new Set([
          normalizedPreferred,
          "gemini-2.0-flash",
          "gemini-1.5-flash",
          "gemini-1.5-flash-latest",
          "gemini-1.5-flash-8b",
          "gemini-2.0-flash-exp",
          "gemini-1.5-flash-001",
          "gemini-1.5-flash-002",
          "gemini-1.5-pro",
        ])
      );
    }

    // Step 3: Iterate through candidate models across v1beta and v1 until generation succeeds
    for (const model of candidateList) {
      for (const apiVersion of ["v1beta", "v1"]) {
        const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${cleanKey}`;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              if (model !== normalizedPreferred && onModelSwitched) {
                onModelSwitched(model);
              }
              return { text, modelUsed: model };
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${res.status}`;
            lastError = errMsg;
            if (res.status === 400 && errMsg.includes("API key not valid")) {
              throw new Error("Invalid Gemini API Key. Please verify key at aistudio.google.com");
            }
          }
        } catch (err: any) {
          if (
            err.message &&
            (err.message.includes("Invalid Gemini API Key") ||
              err.message.includes("API key not valid") ||
              err.message.includes("API_KEY_INVALID"))
          ) {
            throw err;
          }
          lastError = err.message || "Network error";
        }
      }
    }

    throw new Error(
      lastError ||
        `Unable to reach Gemini models with your key. Please verify key permissions at aistudio.google.com.`
    );
  };

  // Test API Key Connection
  const handleTestConnection = async () => {
    const cleanApiKey = settings.apiKey.trim().replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
    const cleanModel =
      settings.model.trim().replace(/^['"]|['"]$/g, "").replace(/^models\//, "") ||
      "gemini-2.0-flash";

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
        const result = await executeGemini(
          cleanApiKey,
          cleanModel,
          [{ role: "user", parts: [{ text: "Ping test. Reply with: ONLINE" }] }],
          (newModel) => updateSettings({ model: newModel })
        );

        setTestConnectionStatus({
          testing: false,
          success: true,
          message: `✅ Uplink verified: ${result.modelUsed} is online (replied: "${result.text.trim().slice(0, 25)}")`,
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
            messages: [{ role: "user", content: "Ping. Reply with: ONLINE" }],
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || "ONLINE";
        setTestConnectionStatus({
          testing: false,
          success: true,
          message: `✅ Uplink verified: ${cleanModel} replied "${reply}"`,
        });
      }
    } catch (err: any) {
      setTestConnectionStatus({
        testing: false,
        success: false,
        message: err.message || "Connection failed.",
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

        unlistenState = await listen<string>("tutor:state", (event) => {
          setState(event.payload as CardState);
          if (event.payload === "capturing" || event.payload === "thinking") {
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

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        handleTrigger();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [solverMode, settings]);

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
              handleTrigger();
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [solverMode, settings]);

  // Client-side Vision AI caller for browser mode & in-place solving
  const runBrowserVisionAI = async (
    rawImage: string | null,
    customPrompt?: string
  ): Promise<void> => {
    setState("thinking");
    setCurrentStreamingText("");
    setErrorMessage(null);

    const cleanApiKey = settings.apiKey.trim().replace(/\s+/g, "").replace(/^['"]|['"]$/g, "");
    const cleanModel =
      settings.model.trim().replace(/^['"]|['"]$/g, "") ||
      (settings.provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

    // 1. Simulation mode when no key is supplied
    if (!cleanApiKey) {
      let sampleText = "";
      if (solverMode === "quiz") {
        sampleText = `OPTION: (B)\nTEXT: O(log n) — Logarithmic division of search range\nCONFIDENCE: 99%\nWHY: Binary search cuts the search space in half at each step, ensuring logarithmic time complexity.`;
      } else if (solverMode === "code") {
        sampleText = `OPTION: LINE 6\nTEXT: Fix pointer logic: low = mid + 1 and high = mid - 1\nCONFIDENCE: 95%\nWHY: Prevents infinite while-loop when target is in the upper half.`;
      } else {
        sampleText = `OPTION: SUMMARY\nTEXT: Binary Search Implementation in TypeScript\nCONFIDENCE: 98%\nWHY: Efficient divide-and-conquer algorithm with O(1) auxiliary space.`;
      }

      let index = 0;
      const interval = setInterval(() => {
        index += 28;
        if (index <= sampleText.length) {
          setCurrentStreamingText(sampleText.slice(0, index));
        } else {
          clearInterval(interval);
          setMessages((prev) => [...prev, { role: "jarvis", content: sampleText }]);
          setCurrentStreamingText("");
          setState("ready");
        }
      }, 20);
      return;
    }

    // 2. Real API Vision Call
    try {
      let effectiveImage = rawImage;
      if (!effectiveImage || !effectiveImage.startsWith("data:image/")) {
        effectiveImage = generateSampleScreen(solverMode);
        setPreviewImage(effectiveImage);
      }

      const cleanB64 = effectiveImage.replace(/^data:image\/[a-z]+;base64,/, "");

      let systemPrompt = "";
      if (solverMode === "quiz") {
        systemPrompt = `You are an instant AI Exam & Quiz Solver.
Look at this screen capture. Find the active question and multiple-choice options (A, B, C, D, etc.).
Determine the correct option with high accuracy.
YOU MUST RESPOND IN THIS EXACT 4-LINE FORMAT:
OPTION: [Winning option letter, e.g. (A), (B), (C), or (D) or Direct Answer]
TEXT: [Exact brief text of the winning option]
CONFIDENCE: [e.g. 98%]
WHY: [1 concise sentence explaining why this option is correct]

If the screen is not a quiz, provide:
OPTION: DIRECT ANSWER
TEXT: [Direct solution to the question on screen]
CONFIDENCE: 95%
WHY: [1 concise sentence rationale]`;
      } else if (solverMode === "code") {
        systemPrompt = `You are an instant AI Code Debugger. Inspect the code on screen.
YOU MUST RESPOND IN THIS EXACT 4-LINE FORMAT:
OPTION: [BUG LOCATION / LINE]
TEXT: [Exact code fix]
CONFIDENCE: [e.g. 95%]
WHY: [1 concise sentence explaining the cause and fix]`;
      } else {
        systemPrompt = `You are a concise AI Tutor. Summarize what is on screen.
YOU MUST RESPOND IN THIS EXACT 4-LINE FORMAT:
OPTION: SUMMARY
TEXT: [Core takeaway]
CONFIDENCE: [e.g. 95%]
WHY: [Practical application or core concept]`;
      }

      const finalPrompt = customPrompt ? `${systemPrompt}\nUser Follow-up: ${customPrompt}` : systemPrompt;

      if (settings.provider === "gemini") {
        const parts: any[] = [{ text: finalPrompt }];

        if (cleanB64 && cleanB64.length > 50) {
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanB64,
            },
          });
        }

        const result = await executeGemini(
          cleanApiKey,
          cleanModel,
          [{ role: "user", parts }],
          (newModel) => updateSettings({ model: newModel })
        );

        const ansText = result.text;
        setMessages((prev) => [...prev, { role: "jarvis", content: ansText }]);
        setCurrentStreamingText("");
        setState("ready");
      } else {
        const endpoint = settings.baseUrl || "https://api.openai.com/v1/chat/completions";
        const userContent: any[] = [{ type: "text", text: finalPrompt }];

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
            messages: [{ role: "user", content: userContent }],
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

    const promptText =
      customPrompt ||
      (solverMode === "quiz"
        ? "Solve active quiz question on screen and output winning option letter."
        : solverMode === "code"
        ? "Inspect visible code for bugs and output fix."
        : "Summarize screen contents concisely.");

    setMessages([{ role: "user", content: promptText }]);

    if (isTauri) {
      try {
        await tauriInvoke("trigger_tutor", {
          userQuery: promptText,
          apiConfig: {
            provider: settings.provider,
            model: settings.model,
            apiKey: settings.apiKey,
            baseUrl: settings.baseUrl,
          },
        });
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Screen capture failed");
        setState("error");
      }
    } else {
      setTimeout(() => {
        runBrowserVisionAI(previewImage, customPrompt);
      }, 400);
    }
  };

  const handleDismiss = async () => {
    setState("idle");
    setErrorMessage(null);
    setShowDetails(false);
    if (isTauri) {
      try {
        await tauriInvoke("dismiss_tutor");
      } catch (err) {
        console.warn("Tauri dismiss notice:", err);
      }
    }
  };

  const handleCopyAnswer = () => {
    if (!parsedAnswer) return;
    const textToCopy = `${parsedAnswer.option} ${parsedAnswer.text ? "- " + parsedAnswer.text : ""}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || state === "thinking") return;
    const q = followUp.trim();
    setFollowUp("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    runBrowserVisionAI(previewImage, q);
  };

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden select-none pointer-events-none font-mono antialiased text-cyan-100 bg-transparent">
      {/* Simulated Background Quiz Window in Browser Preview */}
      {!isTauri && simulateDesktop && (
        <div className="absolute inset-8 rounded-2xl border border-cyan-500/20 bg-[#070D1E]/90 backdrop-blur-sm overflow-hidden flex flex-col pointer-events-none shadow-2xl opacity-80 transition-all z-0">
          <div className="h-9 bg-[#0C152B] border-b border-cyan-500/20 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs text-cyan-300 font-sans font-bold">
                Online Quiz Portal // Computer Science Examination
              </span>
            </div>
            <span className="text-[10px] text-cyan-500 font-mono tracking-wider">
              100% TRANSPARENT CENTER VIEWPORT
            </span>
          </div>

          <div className="p-8 font-sans space-y-5 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <span className="text-xs text-cyan-400 font-mono font-bold tracking-widest uppercase">
                Question 14 of 30 • Multiple Choice
              </span>
              <span className="text-xs text-amber-400 font-mono">Time Left: 24:18</span>
            </div>

            <p className="text-lg font-semibold text-white">
              What is the worst-case time complexity of Binary Search on a sorted array of N elements?
            </p>

            <div className="grid grid-cols-1 gap-2.5 max-w-2xl font-mono text-sm">
              {[
                { k: "(A)", t: "O(n) — Linear scan through all elements" },
                { k: "(B)", t: "O(log n) — Logarithmic halving of search space" },
                { k: "(C)", t: "O(n log n) — Divide and conquer partition sorting" },
                { k: "(D)", t: "O(1) — Direct constant index memory lookup" },
              ].map((opt) => (
                <div
                  key={opt.k}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                    parsedAnswer?.option.includes(opt.k[1]) && state === "ready"
                      ? "border-emerald-400 bg-emerald-950/40 text-emerald-200 font-bold"
                      : "border-slate-700/70 bg-slate-900/60 text-slate-300"
                  }`}
                >
                  <span className="text-cyan-400 font-bold">{opt.k}</span>
                  <span>{opt.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Perimeter Animated Colorful Neon Boundary (Continuous 3px Line Around the Entire Window) */}
      <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-top ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#4285F4]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_12px_#F59E0B]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-bottom ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#34A853]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_12px_#EF4444]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 left-0 bottom-0 w-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-left ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#9B51E0]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_12px_#FBBF24]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 right-0 bottom-0 w-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-right ${
            borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#EA4335]"
              : borderTheme === "gold"
              ? "stark-gold-border shadow-[0_0_12px_#DC2626]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>

      {/* Laser sweep animation during screen capture */}
      {state === "capturing" && (
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 via-amber-300 to-transparent shadow-[0_0_20px_#00F0FF] animate-laser-sweep pointer-events-none z-50" />
      )}

      {/* THE TWO-LINED TOP PANEL HUD (Unified In-Place Interface) */}
      <div className="pointer-events-auto absolute top-2.5 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl rounded-2xl border border-cyan-500/40 bg-[#040C1A]/95 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] select-none z-50 flex flex-col overflow-hidden transition-all duration-300">
        {/* LINE 1: Options & Controls Bar */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-cyan-500/25 bg-[#08152B]/90 text-xs">
          {/* Identity & Status */}
          <div className="flex items-center gap-2.5 shrink-0">
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
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-cyan-200 tracking-wider font-mono text-[11px]">
                AI TUTOR // IN-PLACE
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  state === "thinking"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-400/40 animate-pulse"
                    : state === "capturing"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 animate-pulse"
                    : state === "ready"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                    : state === "error"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-400/40"
                    : "bg-cyan-950/70 text-cyan-400 border border-cyan-500/30"
                }`}
              >
                {state === "thinking"
                  ? "SOLVING..."
                  : state === "capturing"
                  ? "SCANNING..."
                  : state === "ready"
                  ? "ANSWER READY"
                  : state === "error"
                  ? "FAULT"
                  : "IDLE"}
              </span>
            </div>
          </div>

          {/* Center: Primary Trigger & Mode Selector */}
          <div className="flex items-center gap-2">
            {/* Primary Glowing Solve Trigger */}
            <button
              onClick={() => handleTrigger()}
              disabled={state === "capturing" || state === "thinking"}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-extrabold text-[11px] flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.45)] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Capture screen and get instant in-place answer"
            >
              <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
              <span>READ & SOLVE SCREEN</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/40 font-mono text-cyan-200">
                {hotkeyInfo.shortcut}
              </span>
            </button>

            {/* Mode Pills */}
            <div className="flex items-center bg-[#020712] p-0.5 rounded-lg border border-cyan-500/30">
              {[
                { id: "quiz", label: "🎯 Quiz Option (A/B/C/D)", desc: "Direct MCQ letter answer" },
                { id: "code", label: "🐞 Code Bug Fix", desc: "Line-by-line syntax & logic fix" },
                { id: "summary", label: "📝 Summary", desc: "Concise summary" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateSolverMode(m.id as any)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    solverMode === m.id
                      ? "bg-cyan-500/30 text-cyan-200 font-bold border border-cyan-400/50 shadow-[0_0_8px_rgba(0,240,255,0.25)]"
                      : "text-cyan-400/70 hover:text-cyan-200"
                  }`}
                  title={m.desc}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Theme, Settings, Simulation & Dismiss */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Theme Cycler */}
            <button
              onClick={() => {
                const next =
                  borderTheme === "assistant" ? "arc" : borderTheme === "arc" ? "gold" : "assistant";
                updateBorderTheme(next);
              }}
              className="text-[10px] px-2 py-1 rounded border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 font-mono flex items-center gap-1 transition-colors"
              title="Cycle colorful boundary border theme"
            >
              <Sparkles className="w-2.5 h-2.5 text-cyan-300" />
              <span>
                {borderTheme === "assistant" && "AURORA"}
                {borderTheme === "arc" && "ARC"}
                {borderTheme === "gold" && "MARK-85"}
              </span>
            </button>

            {/* Settings Drawer Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 font-mono ${
                showSettings
                  ? "border-cyan-400 bg-cyan-900/60 text-cyan-100 font-bold shadow-[0_0_10px_rgba(0,240,255,0.3)]"
                  : "border-cyan-500/30 bg-cyan-950/40 text-cyan-400 hover:text-cyan-200"
              }`}
              title="API Key & Model Configuration"
            >
              <Settings className="w-3 h-3" />
              <span>SETTINGS</span>
            </button>

            {/* Simulated Desktop Preview Toggle (Browser mode only) */}
            {!isTauri && (
              <button
                onClick={() => setSimulateDesktop(!simulateDesktop)}
                className={`text-[9px] px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                  simulateDesktop
                    ? "border-emerald-400 bg-emerald-950/70 text-emerald-300 font-bold"
                    : "border-cyan-500/30 bg-cyan-950/40 text-cyan-400 hover:text-cyan-200"
                }`}
                title="Toggle simulated quiz window to test in-place answering"
              >
                <Monitor className="w-2.5 h-2.5" />
                <span>{simulateDesktop ? "DESKTOP ON" : "DESKTOP OFF"}</span>
              </button>
            )}

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1 rounded text-cyan-400/70 hover:text-rose-300 hover:bg-rose-950/50 transition-colors"
              title="Dismiss / Minimize Overlay"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LINE 2: Instant Results Bar */}
        <div className="flex items-center px-4 py-2 bg-[#020712]/95 min-h-[46px] text-xs">
          {state === "idle" && (
            <div className="flex items-center justify-between w-full text-cyan-400/80 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400/80 animate-pulse" />
                <span>
                  AI Tutor ready. Navigate to your quiz/window and click{" "}
                  <strong className="text-cyan-200">READ & SOLVE SCREEN</strong> (or press{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold">
                    {hotkeyInfo.shortcut}
                  </kbd>
                  ) for instant in-place answer.
                </span>
              </div>
              <span className="text-[10px] text-cyan-500/70 hidden sm:inline">
                ⚡ Zero Copy-Paste • Direct In-Place Answer
              </span>
            </div>
          )}

          {(state === "capturing" || state === "thinking") && (
            <div className="flex items-center justify-between w-full text-xs font-mono text-cyan-200">
              <div className="flex items-center gap-2.5">
                <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="animate-pulse font-bold text-cyan-100">
                  {state === "capturing"
                    ? "Capturing screen viewport..."
                    : "Analyzing active question & identifying winning option..."}
                </span>
              </div>
              <span className="text-[10px] text-cyan-500 font-mono">
                {settings.model} // Vision Processing
              </span>
            </div>
          )}

          {state === "ready" && parsedAnswer && (
            <div className="flex items-center justify-between w-full gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Big Prominent Option Badge */}
                <div className="shrink-0 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-extrabold text-sm shadow-[0_0_14px_rgba(16,185,129,0.35)] flex items-center gap-1.5 font-mono">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{parsedAnswer.option}</span>
                </div>

                {/* Option Text */}
                {parsedAnswer.text && (
                  <span className="text-xs font-bold text-white truncate max-w-sm">
                    {parsedAnswer.text}
                  </span>
                )}

                {/* Confidence Pill */}
                {parsedAnswer.confidence && (
                  <span className="shrink-0 text-[9px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono">
                    {parsedAnswer.confidence}
                  </span>
                )}

                {/* 1-Sentence Rationale */}
                {parsedAnswer.why && (
                  <span className="text-[11px] text-cyan-200/90 truncate max-w-md hidden lg:inline">
                    <strong className="text-cyan-400">Why:</strong> {parsedAnswer.why}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  onClick={handleCopyAnswer}
                  className="px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] flex items-center gap-1 transition-all font-mono font-bold"
                  title="Copy option to clipboard"
                >
                  {copiedAnswer ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">COPIED!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-cyan-400" />
                      <span>COPY</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`px-2.5 py-1 rounded border text-[10px] flex items-center gap-1 transition-all font-mono ${
                    showDetails
                      ? "border-cyan-400 bg-cyan-900/60 text-cyan-100 font-bold"
                      : "border-cyan-500/40 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300"
                  }`}
                  title="Toggle detailed rationale drawer"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span>{showDetails ? "HIDE INFO" : "DETAILS"}</span>
                </button>

                <button
                  onClick={() => handleTrigger()}
                  className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-400/50 text-cyan-200 text-[10px] flex items-center gap-1 transition-all font-mono"
                  title="Re-scan current screen"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RESCAN</span>
                </button>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center justify-between w-full gap-3 text-rose-300 text-xs font-mono">
              <div className="flex items-center gap-2 truncate">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate font-bold">
                  {errorMessage || "Error processing screen question."}
                </span>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  onClick={() => {
                    updateSettings({ model: "gemini-2.0-flash" });
                    setErrorMessage(null);
                    handleTrigger();
                  }}
                  className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-400 text-rose-200 text-[10px] font-bold hover:bg-rose-900 transition-all flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>TRY 2.0-FLASH</span>
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-2 py-1 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px]"
                >
                  CONFIG
                </button>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-400 hover:text-white px-1.5 py-0.5"
                  title="Dismiss error"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        {/* EXPANDABLE DRAWER: Detailed Explanation & Follow-up Q&A */}
        {showDetails && parsedAnswer && (
          <div className="p-4 border-t border-cyan-500/30 bg-[#050D1E]/98 max-h-[340px] overflow-y-auto space-y-3 select-text">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>EXECUTIVE TUTORING BREAKDOWN</span>
              </span>
              <button
                onClick={() => setShowDetails(false)}
                className="text-[10px] text-cyan-500 hover:text-cyan-300"
              >
                [ CLOSE DETAILS ]
              </button>
            </div>

            <div className="text-xs leading-relaxed text-cyan-100/90 font-sans prose prose-invert max-w-none">
              <ReactMarkdown>{parsedAnswer.raw}</ReactMarkdown>
            </div>

            {/* Quick Follow-up Question Input */}
            <form onSubmit={handleFollowUpSubmit} className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask follow-up (e.g. 'Why not option C?')..."
                className="flex-1 bg-[#020712] border border-cyan-500/40 rounded-lg px-3 py-1.5 text-xs text-cyan-200 outline-none focus:border-cyan-400 font-mono"
              />
              <button
                type="submit"
                disabled={!followUp.trim() || state === "thinking"}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/30 hover:bg-cyan-500/50 border border-cyan-400/50 text-cyan-200 text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1 font-mono"
              >
                <Send className="w-3 h-3" />
                <span>ASK</span>
              </button>
            </form>
          </div>
        )}

        {/* EXPANDABLE DRAWER: Settings / API Configuration */}
        {showSettings && (
          <div className="p-4 border-t border-cyan-500/30 bg-[#050D1E]/98 text-xs space-y-3">
            <div className="flex items-center justify-between text-cyan-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                <span>AI PROTOCOL & API CONFIGURATION</span>
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] text-cyan-500 hover:text-cyan-300"
              >
                [ CLOSE ]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-cyan-400/80 block mb-1">AI PROVIDER</label>
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const prov = e.target.value as "gemini" | "openai";
                    updateSettings({
                      provider: prov,
                      model: prov === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini",
                    });
                  }}
                  className="w-full bg-[#020712] border border-cyan-500/40 rounded px-2.5 py-1.5 text-xs text-cyan-200 outline-none focus:border-cyan-400"
                >
                  <option value="gemini">Google Gemini (Free API)</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] text-cyan-400/80 block mb-1">VISION MODEL</label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value.trim() })}
                  placeholder={settings.provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini"}
                  className="w-full bg-[#020712] border border-cyan-500/40 rounded px-2.5 py-1.5 text-xs text-cyan-200 outline-none focus:border-cyan-400"
                />
                {settings.provider === "gemini" && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[8px] text-cyan-500/80">RECOMMENDED:</span>
                    {[
                      { id: "gemini-2.0-flash", label: "2.0-flash (Recommended)" },
                      { id: "gemini-1.5-flash", label: "1.5-flash (Standard)" },
                      { id: "gemini-1.5-flash-8b", label: "1.5-8b (Fast)" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateSettings({ model: m.id })}
                        className={`text-[8px] px-2 py-0.5 rounded border transition-colors ${
                          settings.model === m.id
                            ? "border-cyan-400 bg-cyan-900/70 text-cyan-100 font-bold shadow-[0_0_8px_rgba(0,240,255,0.3)]"
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
                onChange={(e) =>
                  updateSettings({
                    apiKey: e.target.value.trim().replace(/^['"]|['"]$/g, ""),
                  })
                }
                placeholder="Paste key (AIza... or sk-...) or leave empty for simulation"
                className="w-full bg-[#020712] border border-cyan-500/40 rounded px-2.5 py-1.5 text-xs text-cyan-200 outline-none focus:border-cyan-400"
              />
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-1 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testConnectionStatus.testing || !settings.apiKey.trim()}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-cyan-500/50 bg-cyan-950/70 hover:bg-cyan-900/70 text-cyan-300 text-[10px] flex items-center gap-1.5 transition-all disabled:opacity-40 font-bold shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                >
                  {testConnectionStatus.testing ? (
                    <>
                      <div className="w-2.5 h-2.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <span>PROBING GOOGLE CLOUD...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-2.5 h-2.5 text-cyan-400" />
                      <span>TEST & AUTO-DISCOVER MODEL</span>
                    </>
                  )}
                </button>
                <span className="text-[8px] text-cyan-500/70 font-mono">
                  {settings.apiKey.trim() ? "KEY ENTERED" : "SIMULATION MODE"}
                </span>
              </div>

              {testConnectionStatus.message && (
                <div
                  className={`text-[10px] p-2 rounded-lg border leading-relaxed flex items-start gap-1.5 break-words ${
                    testConnectionStatus.success
                      ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-300 font-mono shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : "border-rose-500/50 bg-rose-950/40 text-rose-300 font-mono shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                  }`}
                >
                  {testConnectionStatus.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <span className="break-all">{testConnectionStatus.message}</span>
                </div>
              )}
            </div>

            {/* Boundary Lightning Intensity Slider */}
            <div className="pt-2 border-t border-cyan-500/20 flex items-center justify-between">
              <span className="text-[9px] text-cyan-400/80 font-bold">
                PERIMETER BORDER INTENSITY:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={borderIntensity}
                  onChange={(e) => {
                    setBorderIntensity(Number(e.target.value));
                    localStorage.setItem("tutor_border_intensity", e.target.value);
                  }}
                  className="w-28 h-1 bg-cyan-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <span className="text-[9px] text-cyan-400 font-mono w-6 text-right">
                  {borderIntensity}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
