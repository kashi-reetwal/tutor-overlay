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
  Camera,
} from "lucide-react";

type CardState = "idle" | "capturing" | "thinking" | "ready" | "error";
type BorderTheme = "amber" | "phosphor" | "typewriter" | "assistant" | "arc";

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

// Clean surrounding quotes, backticks, asterisks, and trailing punctuation
function cleanValue(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .replace(/^["'`*#\s]+|["'`*#\s]+$/g, "")
    .replace(/[."';,]+$/, "")
    .trim();
}

// Downscale and compress image for lightning-fast visual OCR upload (~100-150KB)
async function compressImageForVision(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Generate uniform prompt for both Tauri native capture and browser preview
function getSolverPrompt(mode: "quiz" | "code" | "summary", customPrompt?: string): string {
  let basePrompt = "";
  if (mode === "quiz") {
    basePrompt = `You are an ultra-fast, high-precision AI Exam & Quiz Solver.
Examine this screen capture. Identify the active question and multiple-choice options (A, B, C, D, etc.).
Determine the single correct winning option with absolute certainty.

YOU MUST STRICTLY RESPOND IN EXACTLY THIS 4-LINE FORMAT (DO NOT ADD EXTRA TEXT, MARKDOWN QUOTES, OR COMMENTARY):
OPTION: (A)
TEXT: [Winning option text without repeating letter or quotes]
CONFIDENCE: 98%
WHY: [1 concise sentence explaining why this option is correct]

CRITICAL RULES:
1. "OPTION:" MUST strictly be the option letter in parentheses, e.g. (A), (B), (C), (D), or (E). Never write "DIRECT ANSWER" or full sentences in OPTION.
2. "TEXT:" must be the option text without repeating the letter or surrounding quotes.
3. "CONFIDENCE:" must strictly be a percentage like 95% or 99% without commentary or parentheses.
4. "WHY:" must be 1 clear, punchy sentence explaining the rationale.`;
  } else if (mode === "code") {
    basePrompt = `You are an instant AI Code Debugger. Inspect the visible code for errors or bugs.
YOU MUST RESPOND IN THIS EXACT 4-LINE FORMAT:
OPTION: [BUG LOCATION / LINE]
TEXT: [Exact code fix]
CONFIDENCE: 95%
WHY: [1 concise sentence explaining the cause and fix]`;
  } else {
    basePrompt = `You are a concise AI Tutor. Summarize what is on screen.
YOU MUST RESPOND IN THIS EXACT 4-LINE FORMAT:
OPTION: SUMMARY
TEXT: [Core takeaway]
CONFIDENCE: 95%
WHY: [Practical application or core concept]`;
  }

  return customPrompt ? `${basePrompt}\nUser Follow-up: ${customPrompt}` : basePrompt;
}

// Parse AI output into structured instant quiz answer format with robust heuristics
function parseQuizResponse(fullText: string): ParsedQuizAnswer {
  if (!fullText) {
    return { option: "", text: "", why: "", raw: "" };
  }

  // Extract raw labeled lines if present
  const optionMatch = fullText.match(/(?:^|\n)\s*OPTION:\s*([^\n\r]+)/i);
  const textMatch = fullText.match(/(?:^|\n)\s*TEXT:\s*([^\n\r]+)/i);
  const confMatch = fullText.match(/(?:^|\n)\s*CONFIDENCE:\s*([^\n\r]+)/i);
  const whyMatch = fullText.match(/(?:^|\n)\s*WHY:\s*([^\n\r]+)/i);

  let rawOption = cleanValue(optionMatch ? optionMatch[1] : "");
  let rawText = cleanValue(textMatch ? textMatch[1] : "");
  let rawConf = cleanValue(confMatch ? confMatch[1] : "");
  let rawWhy = cleanValue(whyMatch ? whyMatch[1] : "");

  // 1. Extract clean percentage for confidence (strictly \d{1,3}%)
  let confidence = "";
  const confPercent =
    rawConf.match(/(\d{1,3}%)/) ||
    fullText.match(/CONFIDENCE:.*?(\d{1,3}%)/i) ||
    fullText.match(/(\d{2,3}%)/);
  if (confPercent) {
    confidence = confPercent[1];
  } else if (rawConf) {
    const digits = rawConf.match(/\b\d{2,3}\b/);
    if (digits) confidence = `${digits[0]}%`;
  }

  // 2. Extract Option Letter ((A), (B), (C), (D), (E))
  let option = "";
  let detectedLetter: string | null = null;

  // Check if rawOption is a letter or contains (A)/(B)/(C)/(D)/(E)
  const optionLetterMatch =
    rawOption.match(/\(([A-E])\)/i) ||
    rawOption.match(/^\(?([A-E])\)?$/i) ||
    rawOption.match(/\b([A-E])\b/i);

  if (optionLetterMatch) {
    detectedLetter = optionLetterMatch[1].toUpperCase();
  }

  // If rawOption was "DIRECT ANSWER" or something generic, check rawText or fullText
  if (!detectedLetter || rawOption.toUpperCase().includes("DIRECT ANSWER")) {
    const textLetterMatch =
      rawText.match(/\(([A-E])\)/i) ||
      rawText.match(/^\(?([A-E])\)?[\.\:\-\)\s]/i) ||
      fullText.match(/\(([A-E])\)/i) ||
      fullText.match(/\b(?:option|choice|answer)\s*(?:is\s*)?[:\*\s]*\b([A-E])\b/i);

    if (textLetterMatch) {
      detectedLetter = textLetterMatch[1].toUpperCase();
    }
  }

  if (detectedLetter) {
    option = `(${detectedLetter})`;
    // Strip leading option letter from text so it doesn't repeat next to the badge
    const prefixRegex = new RegExp(`^\\(?${detectedLetter}\\)?[\\.\\:\\-\\)\\s]*`, "i");
    rawText = cleanValue(rawText.replace(prefixRegex, ""));
  } else if (rawOption && !rawOption.toUpperCase().includes("DIRECT ANSWER")) {
    option = rawOption;
  } else {
    // Check fallback for any letter in the full text
    const genericLetterMatch =
      fullText.match(/\(([A-E])\)/i) ||
      fullText.match(/\b([A-E])[\.\)]\s/i);
    if (genericLetterMatch) {
      option = `(${genericLetterMatch[1].toUpperCase()})`;
    } else {
      option = "DIRECT ANSWER";
    }
  }

  // 3. Clean Text
  let text = cleanValue(rawText);
  if (!text) {
    const cleanLines = fullText
      .split("\n")
      .map((l) => cleanValue(l))
      .filter(
        (l) =>
          l.length > 0 &&
          !l.toUpperCase().startsWith("OPTION:") &&
          !l.toUpperCase().startsWith("CONFIDENCE:") &&
          !l.toUpperCase().startsWith("WHY:")
      );
    text = cleanLines[0] || "Correct option identified.";
  }

  // Further strip any remaining leading quotes or duplicated (A)/(B) from text
  text = text.replace(/^["'`\s]+|["'`\s]+$/g, "");
  if (detectedLetter) {
    const prefixRegex = new RegExp(`^\\(?${detectedLetter}\\)?[\\.\\:\\-\\)\\s]*`, "i");
    text = text.replace(prefixRegex, "").trim();
  }

  // 4. Clean Why
  let why = cleanValue(rawWhy);
  if (why) {
    why = why.replace(/^(?:why|reason|explanation|because)[\s\:\-]+/i, "").trim();
  } else {
    const cleanLines = fullText
      .split("\n")
      .map((l) => cleanValue(l))
      .filter(
        (l) =>
          l.length > 0 &&
          !l.toUpperCase().startsWith("OPTION:") &&
          !l.toUpperCase().startsWith("TEXT:") &&
          !l.toUpperCase().startsWith("CONFIDENCE:") &&
          !l.toUpperCase().startsWith("WHY:")
      );
    if (cleanLines.length > 1) {
      why = cleanLines.slice(1).join(" ").slice(0, 200);
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
    ctx.fillStyle = "#141210";
    ctx.fillRect(0, 0, 900, 500);

    // Card background
    ctx.fillStyle = "#1C1917";
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(40, 30, 820, 440, 12);
      ctx.fill();
    } else {
      ctx.fillRect(40, 30, 820, 440);
    }

    // Header Tag
    ctx.fillStyle = "#F59E0B";
    ctx.font = "bold 13px monospace";
    ctx.fillText("DATA STRUCTURES & ALGORITHMS // EXAM QUESTION 14", 70, 75);

    // Question
    ctx.fillStyle = "#F5F5F4";
    ctx.font = "bold 17px monospace";
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
      ctx.fillStyle = "#262220";
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).roundRect(70, y, 760, 48, 8);
        ctx.fill();
      } else {
        ctx.fillRect(70, y, 760, 48);
      }

      ctx.fillStyle = "#F59E0B";
      ctx.font = "bold 16px monospace";
      ctx.fillText(o.tag, 95, y + 30);

      ctx.fillStyle = "#E7E5E4";
      ctx.font = "14px monospace";
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

  const [borderTheme, setBorderTheme] = useState<BorderTheme>(() => {
    const saved = localStorage.getItem("tutor_border_theme") as BorderTheme;
    if (saved && ["amber", "phosphor", "typewriter", "assistant", "arc"].includes(saved)) {
      return saved;
    }
    return "amber";
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

  const updateBorderTheme = (theme: BorderTheme) => {
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

  // High-speed direct Gemini query engine with sub-second fast path (~350ms)
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

    // High-speed generation config: cap tokens to 180 and temperature to 0.0 for instant output
    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: 180,
        temperature: 0.0,
      },
    };

    // Priority models list: try preferred model immediately on fast path
    const candidateList = Array.from(
      new Set([
        normalizedPreferred,
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-2.0-flash-exp",
      ])
    );

    let lastError = "";

    for (const model of candidateList) {
      for (const apiVersion of ["v1beta", "v1"]) {
        const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${cleanKey}`;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
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
            if (
              res.status === 400 &&
              (errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID"))
            ) {
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
      lastError || `Unable to reach Gemini models with your key. Please verify key at aistudio.google.com.`
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
        index += 45;
        if (index <= sampleText.length) {
          setCurrentStreamingText(sampleText.slice(0, index));
        } else {
          clearInterval(interval);
          setMessages((prev) => [...prev, { role: "jarvis", content: sampleText }]);
          setCurrentStreamingText("");
          setState("ready");
        }
      }, 10);
      return;
    }

    // 2. Real API Vision Call
    try {
      let effectiveImage = rawImage;
      if (!effectiveImage || !effectiveImage.startsWith("data:image/")) {
        effectiveImage = generateSampleScreen(solverMode);
        setPreviewImage(effectiveImage);
      }

      // Fast image compression and downscaling (~120KB) for instant upload & inference
      const compressedImage = await compressImageForVision(effectiveImage);
      const cleanB64 = compressedImage.replace(/^data:image\/[a-z]+;base64,/, "");

      const finalPrompt = getSolverPrompt(solverMode, customPrompt);

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

  // Capture active window or full screen from user's display in browser mode
  const captureUserScreen = async () => {
    try {
      setState("capturing");
      setErrorMessage(null);
      setCurrentStreamingText("");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error(
          "Display capture API not supported in this browser. Please use Chrome, Edge, or Brave, or press Ctrl+V to paste a screenshot."
        );
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      // Brief moment for screen frame to render
      await new Promise((r) => setTimeout(r, 120));

      const canvas = document.createElement("canvas");
      const maxDim = 1280;
      let w = video.videoWidth || 1280;
      let h = video.videoHeight || 720;
      if (w > maxDim) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      }
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
      }

      // Terminate all stream tracks immediately after snapshot
      stream.getTracks().forEach((track) => track.stop());

      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      setPreviewImage(dataUrl);
      runBrowserVisionAI(dataUrl);
    } catch (err: any) {
      setState("idle");
      if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
        setErrorMessage("Screen capture error: " + (err.message || err.toString()));
      }
    }
  };

  const handleTrigger = async (customPrompt?: string) => {
    setState("capturing");
    setErrorMessage(null);
    setCurrentStreamingText("");

    const promptText = getSolverPrompt(solverMode, customPrompt);

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
      runBrowserVisionAI(previewImage, customPrompt);
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
    <div className="fixed inset-0 w-screen h-screen overflow-hidden select-none pointer-events-none font-mono antialiased text-stone-100 bg-transparent">
      {/* Simulated Background Quiz Window in Browser Preview */}
      {!isTauri && simulateDesktop && (
        <div className="absolute inset-8 rounded-xl border border-stone-800 bg-[#141210]/95 backdrop-blur-sm overflow-hidden flex flex-col pointer-events-none shadow-2xl opacity-85 transition-all z-0">
          <div className="h-9 bg-[#1C1917] border-b border-stone-800 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs text-amber-300 font-mono font-bold">
                EXAMINATION PARCHMENT // COMPUTER SCIENCE 101
              </span>
            </div>
            <span className="text-[10px] text-stone-500 font-mono tracking-wider">
              100% TRANSPARENT CENTER VIEWPORT
            </span>
          </div>

          <div className="p-8 font-mono space-y-5 text-stone-200">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <span className="text-xs text-amber-400 font-mono font-bold tracking-widest uppercase">
                QUESTION 14 OF 30 • MULTIPLE CHOICE
              </span>
              <span className="text-xs text-amber-300 font-mono">TIME REMAINING: 24:18</span>
            </div>

            <p className="text-lg font-bold text-stone-100">
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
                  className={`p-3 rounded-lg border flex items-center gap-3 transition-colors ${
                    parsedAnswer?.option.includes(opt.k[1]) && state === "ready"
                      ? "border-emerald-500 bg-emerald-950/70 text-emerald-200 font-bold shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                      : "border-stone-800 bg-[#181614] text-stone-300"
                  }`}
                >
                  <span className="text-amber-400 font-bold">{opt.k}</span>
                  <span>{opt.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Perimeter Animated Boundary (Continuous 3px Line Around the Entire Window) */}
      <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-top ${
            borderTheme === "amber"
              ? "vintage-amber-border shadow-[0_0_12px_#F59E0B]"
              : borderTheme === "phosphor"
              ? "phosphor-green-border shadow-[0_0_12px_#10B981]"
              : borderTheme === "typewriter"
              ? "retro-typewriter-border shadow-[0_0_10px_#E7E5E4]"
              : borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#4285F4]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-bottom ${
            borderTheme === "amber"
              ? "vintage-amber-border shadow-[0_0_12px_#D97706]"
              : borderTheme === "phosphor"
              ? "phosphor-green-border shadow-[0_0_12px_#059669]"
              : borderTheme === "typewriter"
              ? "retro-typewriter-border shadow-[0_0_10px_#A8A29E]"
              : borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#34A853]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 left-0 bottom-0 w-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-left ${
            borderTheme === "amber"
              ? "vintage-amber-border shadow-[0_0_12px_#B45309]"
              : borderTheme === "phosphor"
              ? "phosphor-green-border shadow-[0_0_12px_#34D399]"
              : borderTheme === "typewriter"
              ? "retro-typewriter-border shadow-[0_0_10px_#78716C]"
              : borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#9B51E0]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 right-0 bottom-0 w-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-right ${
            borderTheme === "amber"
              ? "vintage-amber-border shadow-[0_0_12px_#F59E0B]"
              : borderTheme === "phosphor"
              ? "phosphor-green-border shadow-[0_0_12px_#10B981]"
              : borderTheme === "typewriter"
              ? "retro-typewriter-border shadow-[0_0_10px_#E7E5E4]"
              : borderTheme === "assistant"
              ? "google-assistant-border shadow-[0_0_12px_#EA4335]"
              : "arc-reactor-border shadow-[0_0_12px_#00F0FF]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>

      {/* Sweep animation during screen capture */}
      {state === "capturing" && (
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_20px_#F59E0B] animate-laser-sweep pointer-events-none z-50" />
      )}

      {/* THE TWO-LINED TOP PANEL HUD (Old-School Typewriter & Vintage Terminal Interface) */}
      <div className="pointer-events-auto absolute top-2.5 left-1/2 -translate-x-1/2 w-[96%] max-w-5xl rounded-xl border border-stone-700/80 bg-[#121110]/98 backdrop-blur-2xl shadow-[0_16px_50px_rgba(0,0,0,0.92)] select-none z-50 flex flex-col overflow-hidden transition-all duration-300">
        {/* LINE 1: Options & Controls Bar (Clean Non-Overlapping Layout) */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-stone-800 bg-[#1A1816]/95 text-xs gap-2 overflow-x-auto no-scrollbar">
          {/* Left: Brand Identity & Status Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shadow-[0_0_8px_#F59E0B]" />
            <span className="font-mono font-black text-amber-300 tracking-wider text-[11px]">
              TYPE // TUTOR
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                state === "thinking"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse"
                  : state === "capturing"
                  ? "bg-stone-800 text-stone-200 border border-stone-600 animate-pulse"
                  : state === "ready"
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50"
                  : state === "error"
                  ? "bg-rose-950/80 text-rose-300 border border-rose-500/50"
                  : "bg-stone-900 text-stone-400 border border-stone-800"
              }`}
            >
              {state === "thinking"
                ? "COMPUTING"
                : state === "capturing"
                ? "SCANNING"
                : state === "ready"
                ? "READY"
                : state === "error"
                ? "FAULT"
                : "STANDBY"}
            </span>
          </div>

          {/* Center: Primary Actions & Compact Mode Keycaps */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Primary Typewriter Solve Keycap */}
            <button
              onClick={() => handleTrigger()}
              disabled={state === "capturing" || state === "thinking"}
              className="px-3 py-1.5 rounded bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-mono font-black text-[11px] flex items-center gap-1.5 shadow-[0_2px_0_#78350F] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 cursor-pointer border border-amber-300/40"
              title="Read & solve active viewport question with sub-second AI inference"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-stone-950" />
              <span>SOLVE SCREEN</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-stone-950/30 font-mono font-bold text-amber-100">
                {hotkeyInfo.shortcut}
              </span>
            </button>

            {/* Real Screen Capture Keycap (Live user screen in browser) */}
            {!isTauri && (
              <button
                onClick={captureUserScreen}
                disabled={state === "capturing" || state === "thinking"}
                className="px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-200 font-mono font-bold text-[10px] flex items-center gap-1.5 border border-stone-700 shadow-[0_2px_0_#0C0A09] active:translate-y-0.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Select and capture your real window or screen, or paste with Ctrl+V"
              >
                <Camera className="w-3 h-3 text-amber-400" />
                <span>REAL SCREEN</span>
              </button>
            )}

            {/* Compact Mode Selector Keycaps */}
            <div className="flex items-center bg-[#0C0A09] p-0.5 rounded border border-stone-800">
              {[
                { id: "quiz", label: "🎯 QUIZ", short: "🎯", title: "Direct multiple choice letter" },
                { id: "code", label: "🐞 CODE", short: "🐞", title: "Code bug and syntax fix" },
                { id: "summary", label: "📝 MEMO", short: "📝", title: "Executive summary memo" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateSolverMode(m.id as any)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                    solverMode === m.id
                      ? "bg-amber-950 text-amber-300 border border-amber-500/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                      : "text-stone-400 hover:text-stone-200"
                  }`}
                  title={m.title}
                >
                  <span className="hidden sm:inline">{m.label}</span>
                  <span className="inline sm:hidden">{m.short}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Theme Cycler, Config, Demo Screen & Dismiss */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Retro Theme Cycler */}
            <button
              onClick={() => {
                const order: BorderTheme[] = ["amber", "phosphor", "typewriter", "assistant", "arc"];
                const idx = order.indexOf(borderTheme);
                const next = order[(idx + 1) % order.length];
                updateBorderTheme(next);
              }}
              className="text-[10px] px-2 py-1 rounded border border-stone-700/80 bg-stone-900 hover:bg-stone-800 text-amber-300 font-mono flex items-center gap-1 transition-colors"
              title="Cycle old-school typewriter and CRT border styles"
            >
              <span>
                {borderTheme === "amber" && "🖮 AMBER CRT"}
                {borderTheme === "phosphor" && "📟 VT-100"}
                {borderTheme === "typewriter" && "📄 TYPEWRITER"}
                {borderTheme === "assistant" && "AURORA"}
                {borderTheme === "arc" && "ARC"}
              </span>
            </button>

            {/* Config / Settings Drawer */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 font-mono ${
                showSettings
                  ? "border-amber-400 bg-amber-950 text-amber-200 font-bold"
                  : "border-stone-700/80 bg-stone-900 text-stone-300 hover:text-amber-200"
              }`}
              title="API configuration & model settings"
            >
              <Settings className="w-3 h-3" />
              <span className="hidden sm:inline">CONFIG</span>
            </button>

            {/* Simulated Desktop Preview Toggle (Browser mode only) */}
            {!isTauri && (
              <button
                onClick={() => setSimulateDesktop(!simulateDesktop)}
                className={`text-[9px] px-2 py-1 rounded border transition-colors flex items-center gap-1 font-mono ${
                  simulateDesktop
                    ? "border-emerald-600 bg-emerald-950 text-emerald-300 font-bold"
                    : "border-stone-800 bg-stone-900 text-stone-400 hover:text-stone-200"
                }`}
                title="Toggle simulated quiz window to test in-place answering"
              >
                <Monitor className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">{simulateDesktop ? "DEMO ON" : "DEMO OFF"}</span>
              </button>
            )}

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1 rounded text-stone-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
              title="Dismiss / Minimize Overlay"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LINE 2: Instant Results Bar (Spacious, Uncrowded Layout) */}
        <div className="flex items-center px-4 py-2.5 bg-[#0C0A09]/95 min-h-[46px] text-xs border-t border-stone-800/80 font-mono">
          {state === "idle" && (
            <div className="flex items-center justify-between w-full text-stone-400 font-mono text-[11px] gap-2">
              <div className="flex items-center gap-2 truncate min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-500/80 animate-pulse shrink-0" />
                <span className="truncate">
                  Ready. Click <strong className="text-amber-300 font-bold">SOLVE SCREEN</strong> (or press{" "}
                  <kbd className="px-1 py-0.5 rounded bg-stone-900 border border-stone-700 text-amber-200 font-bold">
                    {hotkeyInfo.shortcut}
                  </kbd>
                  ) or <strong className="text-amber-300 font-bold">REAL SCREEN</strong> to capture your window.
                </span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono shrink-0 hidden md:inline">
                ⚡ Sub-Second Direct Output
              </span>
            </div>
          )}

          {(state === "capturing" || state === "thinking") && (
            <div className="flex items-center justify-between w-full text-xs font-mono text-amber-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="animate-pulse font-bold text-amber-100 truncate">
                  {state === "capturing"
                    ? "Capturing screen frame..."
                    : "Executing visual OCR & identifying winning option..."}
                </span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono shrink-0">
                {settings.model} // FAST-PATH
              </span>
            </div>
          )}

          {state === "ready" && parsedAnswer && (
            <div className="flex items-center justify-between w-full gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                {/* Typewriter Stamp Badge */}
                {/^\([A-E]\)$/i.test(parsedAnswer.option) ? (
                  <div className="shrink-0 px-3.5 py-1 rounded bg-emerald-950/90 border-2 border-emerald-500 text-emerald-300 font-black text-sm tracking-wider font-mono shadow-[0_0_12px_rgba(16,185,129,0.3)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-[15px]">{parsedAnswer.option}</span>
                  </div>
                ) : (
                  <div className="shrink-0 px-2.5 py-1 rounded bg-amber-950/90 border-2 border-amber-500 text-amber-300 font-extrabold text-xs tracking-wider font-mono shadow-[0_0_10px_rgba(245,158,11,0.25)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{parsedAnswer.option}</span>
                  </div>
                )}

                {/* Option Text: allows shrinking and truncating so it never pushes the right side */}
                {parsedAnswer.text && (
                  <span
                    className="text-xs font-bold text-stone-100 shrink min-w-0 max-w-sm lg:max-w-md truncate font-mono"
                    title={parsedAnswer.text}
                  >
                    {parsedAnswer.text}
                  </span>
                )}

                {/* Confidence Pill */}
                {parsedAnswer.confidence && (
                  <span className="shrink-0 text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-950/80 border border-amber-600/70 text-amber-300">
                    {parsedAnswer.confidence}
                  </span>
                )}

                {/* 1-Sentence Rationale */}
                {parsedAnswer.why && (
                  <span
                    className="text-[11px] text-stone-300 font-mono truncate min-w-0 flex-1 hidden lg:inline"
                    title={parsedAnswer.why}
                  >
                    <strong className="text-amber-400 font-mono">NOTE:</strong> {parsedAnswer.why}
                  </span>
                )}
              </div>

              {/* Action Buttons: anchored on the right, never squeezed */}
              <div className="shrink-0 flex items-center gap-1.5 font-mono ml-auto">
                <button
                  onClick={handleCopyAnswer}
                  className="px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-amber-300 text-[10px] flex items-center gap-1 transition-all font-mono font-bold shadow-[0_1px_0_#000]"
                  title="Copy option to clipboard"
                >
                  {copiedAnswer ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">COPIED!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-amber-400" />
                      <span>COPY</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`px-2.5 py-1 rounded border text-[10px] flex items-center gap-1 transition-all font-mono shadow-[0_1px_0_#000] ${
                    showDetails
                      ? "border-amber-400 bg-amber-950 text-amber-200 font-bold"
                      : "border-stone-700 bg-stone-900 hover:bg-stone-800 text-stone-300"
                  }`}
                  title="Toggle detailed rationale drawer"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span>{showDetails ? "HIDE INFO" : "DETAILS"}</span>
                </button>

                <button
                  onClick={() => handleTrigger()}
                  className="px-2.5 py-1 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-amber-200 text-[10px] flex items-center gap-1 transition-all font-mono shadow-[0_1px_0_#000]"
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
                  className="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-amber-300 text-[10px]"
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

        {/* EXPANDABLE DRAWER: Detailed Explanation & Follow-up Q&A (Typewriter Memo Style) */}
        {showDetails && parsedAnswer && (
          <div className="p-4 border-t border-stone-800 bg-[#161412] max-h-[340px] overflow-y-auto space-y-3 select-text font-mono">
            <div className="flex items-center justify-between border-b border-stone-800 pb-2">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>EXECUTIVE TUTORING MEMO</span>
              </span>
              <button
                onClick={() => setShowDetails(false)}
                className="text-[10px] text-stone-500 hover:text-amber-300"
              >
                [ CLOSE MEMO ]
              </button>
            </div>

            <div className="text-xs leading-relaxed text-stone-200 font-mono prose prose-invert max-w-none">
              <ReactMarkdown>{parsedAnswer.raw}</ReactMarkdown>
            </div>

            {/* Quick Follow-up Question Input */}
            <form onSubmit={handleFollowUpSubmit} className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask follow-up (e.g. 'Why not option C?')..."
                className="flex-1 bg-[#0C0A09] border border-stone-700 rounded px-3 py-1.5 text-xs text-amber-100 outline-none focus:border-amber-400 font-mono"
              />
              <button
                type="submit"
                disabled={!followUp.trim() || state === "thinking"}
                className="px-3 py-1.5 rounded bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-200 text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1 font-mono"
              >
                <Send className="w-3 h-3" />
                <span>ASK</span>
              </button>
            </form>
          </div>
        )}

        {/* EXPANDABLE DRAWER: Settings / API Configuration (Mechanical Vintage Panel) */}
        {showSettings && (
          <div className="p-4 border-t border-stone-800 bg-[#161412] text-xs space-y-3 font-mono">
            <div className="flex items-center justify-between text-amber-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>AI PROTOCOL & API CONFIGURATION</span>
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] text-stone-500 hover:text-amber-300"
              >
                [ CLOSE ]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-stone-400 block mb-1">AI PROVIDER</label>
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const prov = e.target.value as "gemini" | "openai";
                    updateSettings({
                      provider: prov,
                      model: prov === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini",
                    });
                  }}
                  className="w-full bg-[#0C0A09] border border-stone-700 rounded px-2.5 py-1.5 text-xs text-amber-100 outline-none focus:border-amber-400"
                >
                  <option value="gemini">Google Gemini (Free API)</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] text-stone-400 block mb-1">VISION MODEL</label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value.trim() })}
                  placeholder={settings.provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini"}
                  className="w-full bg-[#0C0A09] border border-stone-700 rounded px-2.5 py-1.5 text-xs text-amber-100 outline-none focus:border-amber-400"
                />
                {settings.provider === "gemini" && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[8px] text-stone-500">SPEED PRESETS:</span>
                    {[
                      { id: "gemini-2.0-flash", label: "2.0-flash (Ultra Fast)" },
                      { id: "gemini-1.5-flash", label: "1.5-flash (Standard)" },
                      { id: "gemini-1.5-flash-8b", label: "1.5-8b (Fast)" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateSettings({ model: m.id })}
                        className={`text-[8px] px-2 py-0.5 rounded border transition-colors ${
                          settings.model === m.id
                            ? "border-amber-400 bg-amber-950 text-amber-100 font-bold"
                            : "border-stone-800 bg-[#0C0A09] hover:border-stone-700 text-stone-400"
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
                <label className="text-[9px] text-stone-400 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-amber-400" />
                  <span>API KEY {settings.provider === "gemini" && "(Google AI Studio)"}</span>
                </label>
                {settings.provider === "gemini" && (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] text-amber-400 hover:text-amber-200 flex items-center gap-0.5 underline"
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
                className="w-full bg-[#0C0A09] border border-stone-700 rounded px-2.5 py-1.5 text-xs text-amber-100 outline-none focus:border-amber-400"
              />
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-1 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testConnectionStatus.testing || !settings.apiKey.trim()}
                  className="shrink-0 px-3 py-1.5 rounded border border-amber-600/70 bg-amber-950/70 hover:bg-amber-900/70 text-amber-300 text-[10px] flex items-center gap-1.5 transition-all disabled:opacity-40 font-bold"
                >
                  {testConnectionStatus.testing ? (
                    <>
                      <div className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <span>PROBING GOOGLE CLOUD...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-2.5 h-2.5 text-amber-400" />
                      <span>TEST & AUTO-DISCOVER MODEL</span>
                    </>
                  )}
                </button>
                <span className="text-[8px] text-stone-500 font-mono">
                  {settings.apiKey.trim() ? "KEY ENTERED" : "SIMULATION MODE"}
                </span>
              </div>

              {testConnectionStatus.message && (
                <div
                  className={`text-[10px] p-2 rounded border leading-relaxed flex items-start gap-1.5 break-words ${
                    testConnectionStatus.success
                      ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-300 font-mono"
                      : "border-rose-500/50 bg-rose-950/40 text-rose-300 font-mono"
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

            {/* Boundary CRT Intensity Slider */}
            <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
              <span className="text-[9px] text-stone-400 font-bold">
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
                  className="w-28 h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-[9px] text-amber-400 font-mono w-6 text-right">
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
