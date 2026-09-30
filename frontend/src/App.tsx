import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
  Camera,
  Lightbulb,
  Cpu,
  Layers,
  ShieldAlert,
  BookOpen,
} from "lucide-react";

type CardState = "idle" | "capturing" | "thinking" | "ready" | "error";
type BorderTheme = "classic-blue" | "classic-black";

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
  intuition?: string;
  coreRule?: string;
  comparison?: string;
  pitfall?: string;
  cheatSheet?: string[];
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
      const maxDim = 1440;
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
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Generate uniform Socratic visual teacher prompt
function getSolverPrompt(mode: "quiz" | "code" | "summary", customPrompt?: string): string {
  let basePrompt = "";
  if (mode === "quiz") {
    basePrompt = `You are a World-Class Master Exam Professor and Tutor using the Feynman visual learning method.
Examine this screen capture. Identify the active question and multiple-choice options (A, B, C, D, etc.).
Determine the winning correct option with certainty.

CRITICAL INSTRUCTION: STRICTLY FORBIDDEN FROM OUTPUTTING DENSE ESSAYS OR "BRAIN-ROT" TEXT DUMPS.
Students hate reading walls of text. Structure your entire output into these exact visual boxes:

OPTION: (B)
TEXT: [Winning option text without surrounding quotes or repeated letter]
CONFIDENCE: 98%
WHY: [1 concise, punchy sentence explaining the direct proof]

BOX_INTUITION: [A vivid real-world metaphor or mental picture in 1-2 sentences making the concept instantly click. E.g. "Think of flipping to the exact middle of a dictionary..."]
BOX_CORE_RULE: [The exact mathematical formula, algorithm law, or scientific mechanism governing this]
BOX_COMPARISON: [A sharp bulleted comparison contrasting the winning option against the incorrect options (e.g. why A, C, D are flawed)]
BOX_EXAM_TRAP: [The exact trick or misconception examiners designed into this question to bait students]
BOX_CHEAT_SHEET: [3 high-yield bullet points to memorize for exams]`;
  } else if (mode === "code") {
    basePrompt = `You are an elite Senior Staff Engineer and Teacher. Inspect the screen code for bugs, errors, and logic traps.
DO NOT OUTPUT UNSTRUCTURED DENSE TEXT. Structure your output into these exact visual cards:

OPTION: LINE [X] FIX
TEXT: [Exact 1-line code replacement]
CONFIDENCE: 98%
WHY: [1 concise sentence explaining the root cause]

BOX_INTUITION: [Plain English explanation of why the bug occurs]
BOX_CORE_RULE: [Underlying language specification, memory model, or typing rule violated]
BOX_COMPARISON: [Before vs After code comparison block]
BOX_EXAM_TRAP: [Subtle edge-cases that lead to silent failure or memory leaks]
BOX_CHEAT_SHEET: [3 best practices to prevent this class of bug]`;
  } else {
    basePrompt = `You are a Master Professor creating visual revision cards.
DO NOT OUTPUT DENSE TEXT WALLS OR ESSAY SUMMARIES. Break down the screen concepts into high-impact visual cards:

OPTION: CORE TAKEAWAY
TEXT: [1 punchy golden takeaway line]
CONFIDENCE: 95%
WHY: [The single most important practical insight]

BOX_INTUITION: [A crystal-clear real-world analogy or mental model]
BOX_CORE_RULE: [The foundational principle, theorem, or mechanism]
BOX_COMPARISON: [Key distinctions / Pros vs Cons table or bullets]
BOX_EXAM_TRAP: [Common misconceptions and what students get wrong]
BOX_CHEAT_SHEET: [3 rapid bullet points summarizing the entire concept for quick review]`;
  }

  return customPrompt ? `${basePrompt}\n\nSTUDENT QUESTION (Answer in visual concept boxes, NOT long text): ${customPrompt}` : basePrompt;
}

// Parse AI output into structured instant quiz answer format with visual concept cards
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

  const optionLetterMatch =
    rawOption.match(/\(([A-E])\)/i) ||
    rawOption.match(/^\(?([A-E])\)?$/i) ||
    rawOption.match(/\b([A-E])\b/i);

  if (optionLetterMatch) {
    detectedLetter = optionLetterMatch[1].toUpperCase();
  }

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
    const prefixRegex = new RegExp(`^\\(?${detectedLetter}\\)?[\\.\\:\\-\\)\\s]*`, "i");
    rawText = cleanValue(rawText.replace(prefixRegex, ""));
  } else if (rawOption && !rawOption.toUpperCase().includes("DIRECT ANSWER")) {
    option = rawOption;
  } else {
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
          !l.toUpperCase().startsWith("WHY:") &&
          !l.toUpperCase().startsWith("BOX_")
      );
    text = cleanLines[0] || "Correct option identified.";
  }

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
          !l.toUpperCase().startsWith("WHY:") &&
          !l.toUpperCase().startsWith("BOX_")
      );
    if (cleanLines.length > 1) {
      why = cleanLines.slice(1).join(" ").slice(0, 200);
    }
  }

  // 5. Extract Structured Pedagogical Boxes (Feynman Method)
  const intuitionMatch = fullText.match(
    /(?:BOX_INTUITION|INTUITION|MENTAL MODEL|ANALOGY):\s*([\s\S]*?)(?=(?:BOX_CORE_RULE|BOX_COMPARISON|BOX_EXAM_TRAP|BOX_CHEAT_SHEET|CORE RULE|RULE|COMPARISON|TRAP|CHEAT SHEET|$))/i
  );
  const intuition = cleanValue(intuitionMatch ? intuitionMatch[1] : "");

  const ruleMatch = fullText.match(
    /(?:BOX_CORE_RULE|CORE RULE|MECHANISM|FORMULA):\s*([\s\S]*?)(?=(?:BOX_COMPARISON|BOX_EXAM_TRAP|BOX_CHEAT_SHEET|COMPARISON|TRAP|CHEAT SHEET|$))/i
  );
  const coreRule = cleanValue(ruleMatch ? ruleMatch[1] : "");

  const comparisonMatch = fullText.match(
    /(?:BOX_COMPARISON|COMPARISON|WHY NOT OTHERS|OPTIONS BREAKDOWN):\s*([\s\S]*?)(?=(?:BOX_EXAM_TRAP|BOX_CHEAT_SHEET|TRAP|CHEAT SHEET|$))/i
  );
  const comparison = cleanValue(comparisonMatch ? comparisonMatch[1] : "");

  const trapMatch = fullText.match(
    /(?:BOX_EXAM_TRAP|EXAM TRAP|COMMON PITFALL|TRAP TO AVOID):\s*([\s\S]*?)(?=(?:BOX_CHEAT_SHEET|CHEAT SHEET|$))/i
  );
  const pitfall = cleanValue(trapMatch ? trapMatch[1] : "");

  const cheatMatch = fullText.match(
    /(?:BOX_CHEAT_SHEET|CHEAT SHEET|KEY TAKEAWAYS|SUMMARY POINTS):\s*([\s\S]*?)$/i
  );
  let cheatSheet: string[] = [];
  if (cheatMatch) {
    cheatSheet = cheatMatch[1]
      .split(/\n/)
      .map((l) => l.replace(/^[\*\-\d\.\s]+/, "").trim())
      .filter((l) => l.length > 3)
      .slice(0, 4);
  }

  return { option, text, confidence, why, raw: fullText, intuition, coreRule, comparison, pitfall, cheatSheet };
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
    if (saved && ["classic-blue", "classic-black"].includes(saved)) {
      return saved;
    }
    return "classic-blue";
  });
  const [borderIntensity, setBorderIntensity] = useState<number>(() => {
    const saved = localStorage.getItem("tutor_border_intensity");
    return saved ? Number(saved) : 100;
  });

  const [simulateDesktop, setSimulateDesktop] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hasActiveStream, setHasActiveStream] = useState(false);
  const [showRawProof, setShowRawProof] = useState(false);
  const [pipExpanded, setPipExpanded] = useState(false);

  // Persistent MediaStream refs for instant 1-click uncropped frame snapping
  const activeStreamRef = useRef<MediaStream | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  // Always-On-Top Document Picture-in-Picture window support
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  const togglePictureInPicture = async () => {
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setPipContainer(null);
      return;
    }

    if (typeof window !== "undefined" && "documentPictureInPicture" in window) {
      try {
        const pip = await (window as any).documentPictureInPicture.requestWindow({
          width: 760,
          height: 240,
        });
        pipWindowRef.current = pip;

        // Copy stylesheets for full CSS & Tailwind fidelity
        [...document.styleSheets].forEach((sheet) => {
          try {
            const cssRules = [...sheet.cssRules].map((r) => r.cssText).join("");
            const style = pip.document.createElement("style");
            style.textContent = cssRules;
            pip.document.head.appendChild(style);
          } catch {
            if (sheet.href) {
              const link = pip.document.createElement("link");
              link.rel = "stylesheet";
              link.href = sheet.href;
              pip.document.head.appendChild(link);
            }
          }
        });

        // Inject Times New Roman & classic dark styling with scrollbar styling
        const fontStyle = pip.document.createElement("style");
        fontStyle.textContent = `
          body {
            margin: 0;
            padding: 0;
            background: #0A0A0A;
            color: #FFFFFF;
            font-family: "Times New Roman", Times, Georgia, serif;
            overflow-y: auto;
            overflow-x: hidden;
          }
          ::-webkit-scrollbar {
            width: 4px;
          }
          ::-webkit-scrollbar-thumb {
            background: #1E3A8A;
            border-radius: 4px;
          }
        `;
        pip.document.head.appendChild(fontStyle);

        const root = pip.document.createElement("div");
        root.id = "pip-root";
        pip.document.body.appendChild(root);
        setPipContainer(root);

        pip.addEventListener("pagehide", () => {
          pipWindowRef.current = null;
          setPipContainer(null);
        });
      } catch (err) {
        console.warn("Document Picture-in-Picture failed:", err);
      }
    } else {
      alert(
        "Always-on-top Picture-in-Picture is supported in Google Chrome, Microsoft Edge, and modern Chromium browsers.\n\nTip: You can also run 'npm run tauri dev' for the system-wide transparent desktop overlay!"
      );
    }
  };

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

    // Structured Visual Bento Cards generation config: high speed with adequate tokens for all 5 cards
    const payload = {
      contents,
      generationConfig: {
        maxOutputTokens: 750,
        temperature: 0.1,
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
        sampleText = `OPTION: (B)
TEXT: O(log n) — Logarithmic division of search range
CONFIDENCE: 99%
WHY: Binary search cuts the candidate space in half at each step, ensuring logarithmic time complexity.

BOX_INTUITION: Think of finding a word in a 1,000-page dictionary. Instead of reading page by page, you open directly to page 500. If your word begins with 'S', you eliminate the entire first 500 pages in one second.

BOX_CORE_RULE: At each step k, the remaining search window is N / 2^k. The process terminates when 1 element remains: 2^k = N ⟹ k = log₂(N).

BOX_COMPARISON:
• (A) O(n) is the worst-case for unsorted linear scan.
• (B) O(log n) is the exact logarithmic bound for binary search.
• (C) O(n log n) is for sorting algorithms (e.g. Merge Sort), not searching.
• (D) O(1) only occurs if the target happens to be at the exact first midpoint checked.

BOX_EXAM_TRAP: The prerequisite trap: Binary Search strictly requires a SORTED array. If unsorted, it produces silent incorrect results or loops.

BOX_CHEAT_SHEET:
• Sorted array prerequisite is mandatory.
• Midpoint calculation should use low + (high - low) / 2 to prevent integer overflow.
• Worst-case comparisons = ⌊log₂(n)⌋ + 1.`;
      } else if (solverMode === "code") {
        sampleText = `OPTION: LINE 6 FIX
TEXT: low = mid + 1; and high = mid - 1;
CONFIDENCE: 98%
WHY: Failing to decrement or increment the boundaries causes an infinite loop when the target element is missing.

BOX_INTUITION: If you do not shrink the search boundary by at least 1 index past the midpoint, the window never closes and the while-loop gets stuck forever on the same midpoint.

BOX_CORE_RULE: Binary search requires strict monotonic reduction of the interval [low, high] so that high - low strictly decreases each cycle.

BOX_COMPARISON:
• Buggy Code: low = mid; (fails to terminate when high - low == 1).
• Fixed Code: low = mid + 1; (strictly advances the search space).

BOX_EXAM_TRAP: Off-by-one boundary traps: using while (low < high) instead of while (low <= high) fails on single-element arrays.

BOX_CHEAT_SHEET:
• Condition: while (low <= high).
• Recalibrate bounds: low = mid + 1 or high = mid - 1.
• Overflow prevention: mid = low + Math.floor((high - low) / 2).`;
      } else {
        sampleText = `OPTION: CORE TAKEAWAY
TEXT: Logarithmic Efficiency via Divide-and-Conquer
CONFIDENCE: 96%
WHY: Successively halving problem space yields exponential scalability across massive datasets.

BOX_INTUITION: Splitting a problem in half repeatedly turns a massive 1,000,000-item dataset into just 20 operations (2^20 ≈ 1,000,000).

BOX_CORE_RULE: Master Theorem recurrence: T(n) = aT(n/b) + f(n). When a=1, b=2, T(n) = O(log n).

BOX_COMPARISON:
• Linear O(n): 1,000,000 operations for 1M items.
• Logarithmic O(log n): 20 operations for 1M items (50,000x faster).

BOX_EXAM_TRAP: Conflating O(log n) search with O(n) preprocessing. If you must sort the array first, the total time is O(n log n) + O(log n) = O(n log n).

BOX_CHEAT_SHEET:
• Scales logarithmically with dataset size.
• Foundation of balanced trees, binary heaps, and bisection search.
• Golden rule: Whenever a search window halves each step, time complexity is O(log n).`;
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

  // Snap high-resolution uncropped frame from active stream
  const snapFrameFromActiveStream = async () => {
    const video = activeVideoRef.current;
    if (!video) return;

    setState("capturing");
    setErrorMessage(null);

    // Ensure video is actively playing frames
    if (video.paused) {
      await video.play().catch(() => {});
    }

    // Wait until video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          video.removeEventListener("loadeddata", handler);
          resolve();
        };
        video.addEventListener("loadeddata", handler);
        setTimeout(resolve, 300);
      });
    }

    const nw = video.videoWidth || 1920;
    const nh = video.videoHeight || 1080;

    // Preserve exact window aspect ratio without cropping
    const maxDim = 1920;
    let targetW = nw;
    let targetH = nh;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, 0, 0, targetW, targetH);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreviewImage(dataUrl);
    runBrowserVisionAI(dataUrl);
  };

  // Disconnect persistent window stream
  const disconnectActiveStream = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (activeVideoRef.current) {
      activeVideoRef.current.srcObject = null;
      activeVideoRef.current = null;
    }
    setHasActiveStream(false);
  };

  // Connect active window or full screen from user's display with persistent live stream
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

      // If already connected, snap immediately
      if (activeStreamRef.current && activeVideoRef.current) {
        await snapFrameFromActiveStream();
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "window", // hints window picker first
        } as any,
        audio: false,
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      // Wait for the video frame to actually load so videoWidth and videoHeight are authentic
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          resolve();
        } else {
          const onData = () => {
            video.removeEventListener("loadeddata", onData);
            resolve();
          };
          video.addEventListener("loadeddata", onData);
          setTimeout(resolve, 400);
        }
      });

      activeStreamRef.current = stream;
      activeVideoRef.current = video;
      setHasActiveStream(true);

      // Handle stream termination when user stops sharing via browser banner
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          disconnectActiveStream();
        };
      }

      await snapFrameFromActiveStream();
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
      // If we have an active stream connected to the user's window, snap fresh frame in 5ms!
      if (activeStreamRef.current && activeVideoRef.current) {
        await snapFrameFromActiveStream();
      } else {
        runBrowserVisionAI(previewImage, customPrompt);
      }
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
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden select-none pointer-events-none text-gray-100 bg-transparent"
      style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
    >
      {/* Captured Real Screen Projection Viewport (When real screen is captured) */}
      {!isTauri && previewImage && !simulateDesktop && (
        <div className="absolute inset-8 rounded-xl border border-blue-900/60 bg-[#0A0A0A]/95 overflow-hidden flex flex-col pointer-events-none shadow-2xl z-0">
          <div className="h-8 bg-[#111827] border-b border-blue-950 px-4 flex items-center justify-between text-xs text-blue-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="font-bold tracking-wide">CAPTURED TARGET WINDOW</span>
            </div>
            <span className="text-[11px] text-gray-400">
              Click <strong className="text-blue-300">[ ⚡ SOLVE SCREEN ]</strong> or{" "}
              <strong className="text-blue-300">[ 📌 FLOAT ON TOP ]</strong> to keep HUD over other windows
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center p-3 bg-[#050505]">
            <img
              src={previewImage}
              alt="Captured Window Target"
              className="max-h-full max-w-full object-contain rounded border border-blue-950 shadow-md"
            />
          </div>
        </div>
      )}

      {/* Simulated Background Quiz Window in Browser Preview */}
      {!isTauri && simulateDesktop && (
        <div className="absolute inset-8 rounded-xl border border-blue-900/50 bg-[#0A0A0A]/95 backdrop-blur-sm overflow-hidden flex flex-col pointer-events-none shadow-2xl opacity-90 transition-all z-0">
          <div className="h-9 bg-[#111827] border-b border-blue-950 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-xs text-blue-300 font-bold tracking-wide">
                EXAMINATION PARCHMENT // COMPUTER SCIENCE 101
              </span>
            </div>
            <span className="text-[10px] text-gray-500 tracking-wider">
              100% TRANSPARENT CENTER VIEWPORT
            </span>
          </div>

          <div className="p-8 space-y-5 text-gray-200">
            <div className="flex items-center justify-between border-b border-blue-950/80 pb-3">
              <span className="text-xs text-blue-400 font-bold tracking-widest uppercase">
                QUESTION 14 OF 30 • MULTIPLE CHOICE
              </span>
              <span className="text-xs text-gray-400">TIME REMAINING: 24:18</span>
            </div>

            <p className="text-lg font-bold text-white">
              What is the worst-case time complexity of Binary Search on a sorted array of N elements?
            </p>

            <div className="grid grid-cols-1 gap-2.5 max-w-2xl text-sm">
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
                      ? "border-blue-500 bg-blue-950/80 text-white font-bold shadow-[0_0_12px_rgba(37,99,235,0.3)]"
                      : "border-stone-800 bg-[#141414] text-gray-300"
                  }`}
                >
                  <span className="text-blue-400 font-bold">{opt.k}</span>
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
            borderTheme === "classic-blue"
              ? "classic-blue-border shadow-[0_0_12px_#2563EB]"
              : "classic-black-border shadow-[0_0_10px_#3F3F46]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-bottom ${
            borderTheme === "classic-blue"
              ? "classic-blue-border shadow-[0_0_12px_#1D4ED8]"
              : "classic-black-border shadow-[0_0_10px_#27272A]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 left-0 bottom-0 w-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-left ${
            borderTheme === "classic-blue"
              ? "classic-blue-border shadow-[0_0_12px_#1E40AF]"
              : "classic-black-border shadow-[0_0_10px_#18181B]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>
      <div className="absolute top-0 right-0 bottom-0 w-[3px] overflow-hidden pointer-events-none z-40">
        <div
          className={`w-full h-full animate-beam-right ${
            borderTheme === "classic-blue"
              ? "classic-blue-border shadow-[0_0_12px_#3B82F6]"
              : "classic-black-border shadow-[0_0_10px_#3F3F46]"
          }`}
          style={{ opacity: borderIntensity / 100 }}
        />
      </div>

      {/* Sweep animation during screen capture */}
      {state === "capturing" && (
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_20px_#2563EB] animate-laser-sweep pointer-events-none z-50" />
      )}

      {/* THE TWO-LINED TOP PANEL HUD (Classic Oxford Blue & Matte Black Interface) */}
      <div className="pointer-events-auto absolute top-2.5 left-1/2 -translate-x-1/2 w-[96%] max-w-5xl rounded-xl border border-blue-900/60 bg-[#0A0A0A]/98 backdrop-blur-2xl shadow-[0_16px_50px_rgba(0,0,0,0.95)] select-none z-50 flex flex-col overflow-hidden transition-all duration-300">
        {/* LINE 1: Options & Controls Bar (Clean Non-Overlapping Layout) */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-blue-950 bg-[#111111]/95 text-xs gap-2 overflow-x-auto no-scrollbar">
          {/* Left: Brand Identity & Status Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-[0_0_8px_#2563EB]" />
            <span className="font-bold text-white tracking-wide text-xs">
              THE ACADEMIC TUTOR
            </span>
            <span
              className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                state === "thinking"
                  ? "bg-blue-900/60 text-blue-200 border border-blue-500 animate-pulse"
                  : state === "capturing"
                  ? "bg-stone-800 text-gray-200 border border-stone-600 animate-pulse"
                  : state === "ready"
                  ? "bg-blue-950 text-blue-200 border border-blue-600"
                  : state === "error"
                  ? "bg-rose-950/80 text-rose-300 border border-rose-500/50"
                  : "bg-[#18181B] text-gray-400 border border-stone-800"
              }`}
            >
              {state === "thinking"
                ? "SOLVING"
                : state === "capturing"
                ? "SCANNING"
                : state === "ready"
                ? "READY"
                : state === "error"
                ? "ERROR"
                : "STANDBY"}
            </span>
          </div>

          {/* Center: Primary Actions & Mode Keycaps */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Primary Classic Solve Keycap */}
            <button
              onClick={() => handleTrigger()}
              disabled={state === "capturing" || state === "thinking"}
              className="px-3.5 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-[0_2px_0_#1E3A8A] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 cursor-pointer border border-blue-400"
              title="Read & solve active viewport question with sub-second AI inference"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-white" />
              <span>SOLVE SCREEN</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 font-bold text-blue-100 hidden sm:inline">
                {hotkeyInfo.shortcut}
              </span>
            </button>

            {/* Real Screen Capture Keycap / Live Stream Indicator */}
            {!isTauri && (
              <button
                onClick={captureUserScreen}
                disabled={state === "capturing" || state === "thinking"}
                className={`px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 border shadow-[0_2px_0_#000] active:translate-y-0.5 transition-all disabled:opacity-50 cursor-pointer ${
                  hasActiveStream
                    ? "bg-emerald-950 text-emerald-200 border-emerald-600/80 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                    : "bg-[#18181B] hover:bg-[#27272A] text-blue-200 border-blue-900/80"
                }`}
                title={
                  hasActiveStream
                    ? "Live window connected. Click to snap a fresh frame instantly without reopening window picker."
                    : "Connect your target window or screen for continuous 1-click live scanning."
                }
              >
                <Camera className={`w-3.5 h-3.5 ${hasActiveStream ? "text-emerald-400" : "text-blue-400"}`} />
                <span className="hidden sm:inline">
                  {hasActiveStream ? "● LIVE STREAM (SNAP)" : "CONNECT WINDOW"}
                </span>
                <span className="inline sm:hidden">
                  {hasActiveStream ? "● LIVE" : "WINDOW"}
                </span>
              </button>
            )}

            {/* Disconnect stream button if active */}
            {!isTauri && hasActiveStream && (
              <button
                onClick={disconnectActiveStream}
                className="px-2 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-bold text-xs border border-rose-800/60 cursor-pointer transition-all"
                title="Disconnect live window stream"
              >
                DISCONNECT
              </button>
            )}

            {/* Always-On-Top Floating Window Toggle (Document Picture-in-Picture) */}
            {!isTauri && (
              <button
                onClick={togglePictureInPicture}
                className={`px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 border shadow-[0_2px_0_#000] active:translate-y-0.5 transition-all cursor-pointer ${
                  pipContainer
                    ? "bg-blue-900 text-white border-blue-400"
                    : "bg-[#18181B] hover:bg-[#27272A] text-gray-200 border-stone-700"
                }`}
                title="Open always-on-top floating HUD that stays visible over your target window"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden md:inline">{pipContainer ? "FLOAT ACTIVE" : "FLOAT ON TOP"}</span>
                <span className="inline md:hidden">FLOAT</span>
              </button>
            )}

            {/* Mode Selector */}
            <div className="flex items-center bg-[#111111] p-0.5 rounded border border-blue-950">
              {[
                { id: "quiz", label: "I. Quiz", short: "Quiz", title: "Direct multiple choice letter" },
                { id: "code", label: "II. Code", short: "Code", title: "Code bug & syntax solver" },
                { id: "summary", label: "III. Memo", short: "Memo", title: "Scholarly summary memo" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateSolverMode(m.id as any)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                    solverMode === m.id
                      ? "bg-blue-900 text-white border border-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                      : "text-gray-400 hover:text-white"
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
            {/* Classic Border Theme Toggle */}
            <button
              onClick={() => {
                const next = borderTheme === "classic-blue" ? "classic-black" : "classic-blue";
                updateBorderTheme(next);
              }}
              className="text-xs px-2.5 py-1 rounded border border-blue-900/60 bg-[#141414] hover:bg-[#1E1E1E] text-blue-300 flex items-center gap-1 transition-colors"
              title="Toggle classic blue or black border"
            >
              <span>{borderTheme === "classic-blue" ? "CLASSIC BLUE" : "MATTE BLACK"}</span>
            </button>

            {/* Config / Settings Drawer */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                showSettings
                  ? "border-blue-400 bg-blue-950 text-white font-bold"
                  : "border-stone-800 bg-[#141414] text-gray-300 hover:text-white"
              }`}
              title="API configuration & model settings"
            >
              <Settings className="w-3 h-3 text-blue-400" />
              <span className="hidden sm:inline">SETTINGS</span>
            </button>

            {/* Simulated Desktop Preview Toggle (Browser mode only) */}
            {!isTauri && (
              <button
                onClick={() => setSimulateDesktop(!simulateDesktop)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                  simulateDesktop
                    ? "border-blue-600 bg-blue-950 text-blue-200 font-bold"
                    : "border-stone-800 bg-[#141414] text-gray-400 hover:text-gray-200"
                }`}
                title="Toggle simulated quiz window"
              >
                <Monitor className="w-2.5 h-2.5 text-blue-400" />
                <span className="hidden sm:inline">{simulateDesktop ? "DEMO ON" : "DEMO OFF"}</span>
              </button>
            )}

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1 rounded text-gray-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
              title="Dismiss / Minimize Overlay"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LINE 2: Instant Results Bar (Spacious, Uncrowded Layout) */}
        <div className="flex items-center px-4 py-2.5 bg-[#0A0A0A]/98 min-h-[46px] text-xs border-t border-blue-950/80">
          {state === "idle" && (
            <div className="flex items-center justify-between w-full text-gray-400 text-xs gap-2">
              <div className="flex items-center gap-2 truncate min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    hasActiveStream
                      ? "bg-emerald-500 shadow-[0_0_8px_#10B981] animate-pulse"
                      : "bg-blue-500 animate-pulse"
                  }`}
                />
                <span className="truncate">
                  {hasActiveStream ? (
                    <>
                      <strong className="text-emerald-300 font-bold">Live window linked.</strong> Click{" "}
                      <strong className="text-white font-bold">SOLVE SCREEN</strong> (or press{" "}
                      <kbd className="px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-200 font-bold">
                        {hotkeyInfo.shortcut}
                      </kbd>
                      ) to snap & answer fresh frames instantly without switching windows!
                    </>
                  ) : (
                    <>
                      Ready. Click <strong className="text-white font-bold">SOLVE SCREEN</strong> (or press{" "}
                      <kbd className="px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-200 font-bold">
                        {hotkeyInfo.shortcut}
                      </kbd>
                      ) or <strong className="text-blue-300 font-bold">FLOAT ON TOP</strong> to keep overlay visible over your target window.
                    </>
                  )}
                </span>
              </div>
              <span className="text-xs text-gray-500 shrink-0 hidden md:inline">
                {hasActiveStream ? "5ms Instant Stream Snapping" : "Instant Sub-Second In-Place Output"}
              </span>
            </div>
          )}

          {(state === "capturing" || state === "thinking") && (
            <div className="flex items-center justify-between w-full text-xs text-blue-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="animate-pulse font-bold text-white truncate">
                  {state === "capturing"
                    ? "Capturing target window..."
                    : "Analyzing question & computing solution..."}
                </span>
              </div>
              <span className="text-xs text-gray-500 shrink-0">
                {settings.model} // FAST PATH
              </span>
            </div>
          )}

          {state === "ready" && parsedAnswer && (
            <div className="flex items-center justify-between w-full gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                {/* Royal Blue Seal Badge */}
                {/^\([A-E]\)$/i.test(parsedAnswer.option) ? (
                  <div className="shrink-0 px-3.5 py-1 rounded bg-blue-800 border-2 border-blue-400 text-white font-bold text-base tracking-wide shadow-[0_0_12px_rgba(37,99,235,0.4)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-200 shrink-0" />
                    <span>{parsedAnswer.option}</span>
                  </div>
                ) : (
                  <div className="shrink-0 px-3 py-1 rounded bg-blue-900 border-2 border-blue-500 text-white font-bold text-xs tracking-wide shadow-[0_0_10px_rgba(37,99,235,0.3)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                    <span>{parsedAnswer.option}</span>
                  </div>
                )}

                {/* Option Text: allows shrinking and truncating so it never pushes the right side */}
                {parsedAnswer.text && (
                  <span
                    className="text-sm font-bold text-white shrink min-w-0 max-w-sm lg:max-w-md truncate"
                    title={parsedAnswer.text}
                  >
                    {parsedAnswer.text}
                  </span>
                )}

                {/* Confidence Pill */}
                {parsedAnswer.confidence && (
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded font-bold bg-blue-950 border border-blue-800 text-blue-300">
                    {parsedAnswer.confidence}
                  </span>
                )}

                {/* 1-Sentence Rationale */}
                {parsedAnswer.why && (
                  <span
                    className="text-xs text-gray-300 truncate min-w-0 flex-1 hidden lg:inline italic"
                    title={parsedAnswer.why}
                  >
                    <strong className="text-blue-400 not-italic">Note:</strong> {parsedAnswer.why}
                  </span>
                )}
              </div>

              {/* Action Buttons: anchored on the right, never squeezed */}
              <div className="shrink-0 flex items-center gap-1.5 ml-auto">
                <button
                  onClick={handleCopyAnswer}
                  className="px-2.5 py-1 rounded bg-[#18181B] hover:bg-[#27272A] border border-blue-900/60 text-blue-200 text-xs flex items-center gap-1 transition-all font-bold shadow"
                  title="Copy option to clipboard"
                >
                  {copiedAnswer ? (
                    <>
                      <Check className="w-3 h-3 text-blue-400" />
                      <span className="text-white">COPIED</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-blue-400" />
                      <span>COPY</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`px-2.5 py-1 rounded border text-xs flex items-center gap-1 transition-all shadow ${
                    showDetails
                      ? "border-blue-400 bg-blue-950 text-white font-bold"
                      : "border-stone-800 bg-[#18181B] hover:bg-[#27272A] text-gray-300"
                  }`}
                  title="Toggle detailed proof drawer"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span>{showDetails ? "HIDE INFO" : "DETAILS"}</span>
                </button>

                <button
                  onClick={() => handleTrigger()}
                  className="px-2.5 py-1 rounded bg-[#18181B] hover:bg-[#27272A] border border-blue-900/60 text-blue-200 text-xs flex items-center gap-1 transition-all shadow"
                  title="Re-scan current screen"
                >
                  <RotateCcw className="w-3 h-3 text-blue-400" />
                  <span>RESCAN</span>
                </button>
              </div>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center justify-between w-full gap-3 text-rose-300 text-xs">
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
                  className="px-2.5 py-1 rounded bg-blue-950 border border-blue-400 text-blue-200 text-[10px] font-bold hover:bg-blue-900 transition-all flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>TRY 2.0-FLASH</span>
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-2 py-1 rounded bg-[#18181B] border border-stone-700 text-blue-300 text-[10px]"
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

        {/* EXPANDABLE DRAWER: Visual Concept Bento Cards & Follow-up Q&A */}
        {showDetails && parsedAnswer && (
          <div className="p-4 border-t border-blue-950 bg-[#0C0D12] max-h-[460px] overflow-y-auto space-y-3.5 select-text">
            {/* Header with Card Mode Switcher */}
            <div className="flex items-center justify-between border-b border-blue-950 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_#2563EB]" />
                <span className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5 uppercase">
                  <span>Socratic Visual Concept Cards</span>
                  <span className="text-[10px] text-blue-300 font-normal tracking-normal">(Feynman Technique)</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRawProof(!showRawProof)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    showRawProof
                      ? "border-blue-400 bg-blue-950 text-white font-bold"
                      : "border-stone-800 bg-[#141414] text-gray-400 hover:text-white"
                  }`}
                  title="Toggle between Visual Bento Cards and Raw AI text"
                >
                  {showRawProof ? "SHOW VISUAL CARDS" : "SHOW RAW PROOF"}
                </button>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-[10px] text-gray-500 hover:text-blue-300 px-1 py-0.5"
                >
                  [ CLOSE ]
                </button>
              </div>
            </div>

            {/* Visual Bento Box Cards */}
            {!showRawProof ? (
              <div className="space-y-3">
                {/* 2-Column Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Card 1: 💡 Mental Model & Intuition */}
                  <div className="p-3.5 rounded-lg border border-amber-500/30 bg-[#161410] shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold mb-2">
                        <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="tracking-wide uppercase">Mental Model & Intuition</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-700/50 font-mono ml-auto">
                          5-SEC LOGIC
                        </span>
                      </div>
                      <p className="text-xs text-amber-100/90 leading-relaxed font-sans">
                        {parsedAnswer.intuition || parsedAnswer.why || "Intuition derived from first principles."}
                      </p>
                    </div>
                  </div>

                  {/* Card 2: 📐 The Core Mechanism & Governing Rule */}
                  <div className="p-3.5 rounded-lg border border-blue-500/30 bg-[#0E1524] shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-blue-400 text-xs font-bold mb-2">
                        <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="tracking-wide uppercase">Core Mechanism & Rule</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-blue-950/80 text-blue-300 border border-blue-700/50 font-mono ml-auto">
                          FIRST PRINCIPLES
                        </span>
                      </div>
                      <p className="text-xs text-blue-100/90 leading-relaxed font-mono bg-black/40 p-2 rounded border border-blue-950">
                        {parsedAnswer.coreRule || parsedAnswer.why || "Strict algorithm/scientific specification rule."}
                      </p>
                    </div>
                  </div>

                  {/* Card 3: ⚖️ Comparative Breakdown (Why Other Options Fail) */}
                  <div className="p-3.5 rounded-lg border border-purple-500/30 bg-[#14101A] shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-1.5 text-purple-400 text-xs font-bold mb-2">
                      <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="tracking-wide uppercase">Comparative Breakdown</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-700/50 font-mono ml-auto">
                        OPTIONS ANALYSIS
                      </span>
                    </div>
                    <div className="text-xs text-purple-100/90 leading-relaxed font-sans whitespace-pre-line">
                      {parsedAnswer.comparison || "Detailed contrast of winning selection against alternatives."}
                    </div>
                  </div>

                  {/* Card 4: ⚠️ The Examiner's Trap (Common Pitfall) */}
                  <div className="p-3.5 rounded-lg border border-rose-500/30 bg-[#1A1012] shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold mb-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="tracking-wide uppercase">The Examiner's Trap</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-700/50 font-mono ml-auto">
                        WATCH OUT
                      </span>
                    </div>
                    <p className="text-xs text-rose-100/90 leading-relaxed font-sans">
                      {parsedAnswer.pitfall || "Be alert for subtle edge-cases, prerequisite conditions, and distractor traps."}
                    </p>
                  </div>
                </div>

                {/* Card 5: 📌 High-Yield 30-Second Cheat Sheet (Full Width) */}
                {parsedAnswer.cheatSheet && parsedAnswer.cheatSheet.length > 0 && (
                  <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-[#0F1814] shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold mb-2.5">
                      <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="tracking-wide uppercase">High-Yield 30-Second Cheat Sheet</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 font-mono ml-auto">
                        EXAM MEMORY
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {parsedAnswer.cheatSheet.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-black/50 border border-emerald-950 text-xs text-emerald-100/90 flex items-start gap-2"
                        >
                          <span className="text-emerald-400 font-mono font-bold shrink-0">0{idx + 1}.</span>
                          <span className="leading-snug">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Raw Markdown Proof View */
              <div className="text-xs leading-relaxed text-gray-200 prose prose-invert max-w-none p-3 rounded bg-black/40 border border-blue-950">
                <ReactMarkdown>{parsedAnswer.raw}</ReactMarkdown>
              </div>
            )}

            {/* Quick Socratic Follow-up Question Input */}
            <form onSubmit={handleFollowUpSubmit} className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask Socratic follow-up (e.g. 'Why is option C flawed?' or 'Explain the intuition in simpler words')..."
                className="flex-1 bg-[#050505] border border-blue-950 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 font-sans"
              />
              <button
                type="submit"
                disabled={!followUp.trim() || state === "thinking"}
                className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 border border-blue-500 text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>ASK TUTOR</span>
              </button>
            </form>
          </div>
        )}

        {/* EXPANDABLE DRAWER: Settings / API Configuration */}
        {showSettings && (
          <div className="p-4 border-t border-blue-950 bg-[#0F0F11] text-xs space-y-3">
            <div className="flex items-center justify-between text-blue-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-blue-400" />
                <span>AI PROTOCOL & API CONFIGURATION</span>
              </span>
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] text-gray-500 hover:text-blue-300"
              >
                [ CLOSE ]
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">AI PROVIDER</label>
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const prov = e.target.value as "gemini" | "openai";
                    updateSettings({
                      provider: prov,
                      model: prov === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini",
                    });
                  }}
                  className="w-full bg-[#050505] border border-stone-800 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                >
                  <option value="gemini">Google Gemini (Free API)</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">VISION MODEL</label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value.trim() })}
                  placeholder={settings.provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini"}
                  className="w-full bg-[#050505] border border-stone-800 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                />
                {settings.provider === "gemini" && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[9px] text-gray-500">FAST PATHS:</span>
                    {[
                      { id: "gemini-2.0-flash", label: "2.0-flash (Sub-Second)" },
                      { id: "gemini-1.5-flash", label: "1.5-flash (Standard)" },
                      { id: "gemini-1.5-flash-8b", label: "1.5-8b (Fast)" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateSettings({ model: m.id })}
                        className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                          settings.model === m.id
                            ? "border-blue-400 bg-blue-950 text-white font-bold"
                            : "border-stone-800 bg-[#0A0A0A] hover:border-stone-700 text-gray-400"
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
                <label className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Key className="w-2.5 h-2.5 text-blue-400" />
                  <span>API KEY {settings.provider === "gemini" && "(Google AI Studio)"}</span>
                </label>
                {settings.provider === "gemini" && (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-400 hover:text-blue-200 flex items-center gap-0.5 underline"
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
                className="w-full bg-[#050505] border border-stone-800 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-1 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testConnectionStatus.testing || !settings.apiKey.trim()}
                  className="shrink-0 px-3 py-1.5 rounded border border-blue-600 bg-blue-950 hover:bg-blue-900 text-blue-200 text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 font-bold"
                >
                  {testConnectionStatus.testing ? (
                    <>
                      <div className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span>PROBING GOOGLE CLOUD...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-2.5 h-2.5 text-blue-400" />
                      <span>TEST & AUTO-DISCOVER MODEL</span>
                    </>
                  )}
                </button>
                <span className="text-[9px] text-gray-500">
                  {settings.apiKey.trim() ? "KEY ENTERED" : "SIMULATION MODE"}
                </span>
              </div>

              {testConnectionStatus.message && (
                <div
                  className={`text-xs p-2 rounded border leading-relaxed flex items-start gap-1.5 break-words ${
                    testConnectionStatus.success
                      ? "border-blue-500/50 bg-blue-950/40 text-blue-200"
                      : "border-rose-500/50 bg-rose-950/40 text-rose-300"
                  }`}
                >
                  {testConnectionStatus.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-blue-400 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <span className="break-all">{testConnectionStatus.message}</span>
                </div>
              )}
            </div>

            {/* Boundary Intensity Slider */}
            <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
              <span className="text-[10px] text-gray-400 font-bold">
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
                  className="w-28 h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-xs text-blue-400 w-6 text-right">
                  {borderIntensity}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Always-On-Top Document Picture-in-Picture Portal */}
      {pipContainer &&
        createPortal(
          <div
            className="w-full h-full bg-[#0A0A0A] text-white p-3 flex flex-col justify-between select-none border-2 border-blue-800 font-sans"
            style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
          >
            {/* Top row in floating HUD */}
            <div className="flex items-center justify-between border-b border-blue-950 pb-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    hasActiveStream
                      ? "bg-emerald-500 shadow-[0_0_8px_#10B981] animate-pulse"
                      : "bg-blue-500 shadow-[0_0_8px_#2563EB]"
                  }`}
                />
                <span className="font-bold tracking-wide text-white">THE ACADEMIC TUTOR</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-800 bg-blue-950 text-blue-300 font-bold">
                  {hasActiveStream ? "LIVE STREAM ACTIVE" : "ALWAYS ON TOP"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPipExpanded(!pipExpanded)}
                  className="px-2 py-0.5 rounded bg-[#18181B] hover:bg-[#27272A] border border-stone-700 text-blue-300 text-xs font-bold transition-all cursor-pointer"
                  title="Toggle concept cards in floating window"
                >
                  {pipExpanded ? "COLLAPSE" : "💡 CARDS"}
                </button>
                <button
                  onClick={() => handleTrigger()}
                  disabled={state === "thinking" || state === "capturing"}
                  className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1 shadow cursor-pointer border border-blue-400 transition-all active:translate-y-0.5"
                  title="Snap and solve frame immediately from your active window"
                >
                  <Zap className="w-3 h-3 text-white fill-current" />
                  <span>{state === "thinking" ? "SOLVING..." : "SNAP & SOLVE"}</span>
                </button>
              </div>
            </div>

            {/* Answer Display */}
            <div className="flex items-center justify-between pt-1.5 text-xs min-h-[36px]">
              {state === "ready" && parsedAnswer ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="px-3 py-1 rounded bg-blue-800 border border-blue-400 text-white font-bold text-sm shrink-0 shadow">
                    {parsedAnswer.option}
                  </div>
                  <span
                    className="font-bold text-white truncate shrink min-w-0 text-xs font-sans"
                    title={parsedAnswer.text}
                  >
                    {parsedAnswer.text}
                  </span>
                  {parsedAnswer.confidence && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 shrink-0 font-mono font-bold">
                      {parsedAnswer.confidence}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 text-xs italic">
                  {state === "thinking"
                    ? "Evaluating screen question via Gemini 2.0 Flash..."
                    : state === "capturing"
                    ? "Grabbing fresh frame from your window..."
                    : "Floating over your active window. Click 'SNAP & SOLVE' to answer instantly."}
                </div>
              )}
              {state === "ready" && parsedAnswer && (
                <button
                  onClick={handleCopyAnswer}
                  className="ml-2 px-2.5 py-1 rounded border border-blue-800 bg-blue-950 hover:bg-blue-900 text-blue-300 text-xs shrink-0 font-bold cursor-pointer"
                >
                  {copiedAnswer ? "COPIED" : "COPY"}
                </button>
              )}
            </div>

            {/* Expanded Visual Cards inside floating PiP */}
            {pipExpanded && parsedAnswer && (
              <div className="mt-2 pt-2 border-t border-blue-950/80 max-h-[160px] overflow-y-auto space-y-2 text-xs font-sans">
                {/* Intuition Box */}
                {(parsedAnswer.intuition || parsedAnswer.why) && (
                  <div className="p-2 rounded bg-[#161410] border border-amber-500/30 text-amber-200/90 text-[11px] leading-snug">
                    <span className="font-bold text-amber-400 uppercase tracking-wider block mb-0.5 font-mono text-[9px]">
                      💡 Mental Model (Intuition):
                    </span>
                    {parsedAnswer.intuition || parsedAnswer.why}
                  </div>
                )}
                {/* Examiner Trap Box */}
                {parsedAnswer.pitfall && (
                  <div className="p-2 rounded bg-[#1A1012] border border-rose-500/30 text-rose-200/90 text-[11px] leading-snug">
                    <span className="font-bold text-rose-400 uppercase tracking-wider block mb-0.5 font-mono text-[9px]">
                      ⚠️ Examiner Trap:
                    </span>
                    {parsedAnswer.pitfall}
                  </div>
                )}
                {/* Cheat Sheet */}
                {parsedAnswer.cheatSheet && parsedAnswer.cheatSheet.length > 0 && (
                  <div className="p-2 rounded bg-[#0F1814] border border-emerald-500/30 text-emerald-200/90 text-[11px] leading-snug">
                    <span className="font-bold text-emerald-400 uppercase tracking-wider block mb-0.5 font-mono text-[9px]">
                      📌 30-Sec Cheat Sheet:
                    </span>
                    <ul className="list-disc pl-3.5 space-y-0.5 text-[10px]">
                      {parsedAnswer.cheatSheet.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>,
          pipContainer
        )}
    </div>
  );
}
