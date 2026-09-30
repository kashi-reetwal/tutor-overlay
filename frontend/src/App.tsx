import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";

type CardState = "idle" | "capturing" | "thinking" | "ready" | "error";

interface HotkeyStatus {
  shortcut: string;
  registered: boolean;
  error?: string | null;
}

// Safe wrapper for Tauri APIs so it functions both inside Tauri and during browser Vite dev
const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  // Browser simulation fallback for frontend preview
  console.log(`[Browser Sim] invoke: ${cmd}`, args);
  return {} as T;
}

export default function App() {
  const [state, setState] = useState<CardState>("idle");
  const [answer, setAnswer] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hotkeyInfo, setHotkeyInfo] = useState<HotkeyStatus>({
    shortcut: "Alt+T",
    registered: true,
  });
  const [copied, setCopied] = useState(false);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of answer while streaming
  useEffect(() => {
    if (state === "thinking" || state === "ready") {
      contentEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [answer, state]);

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
            setAnswer("");
            setErrorMessage(null);
          }
        });

        unlistenChunk = await listen<string>("tutor:stream_chunk", (event) => {
          setAnswer((prev) => prev + event.payload);
        });

        unlistenEnd = await listen<string>("tutor:stream_end", () => {
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

  const handleTrigger = async () => {
    setState("capturing");
    setAnswer("");
    setErrorMessage(null);

    if (isTauri) {
      try {
        await tauriInvoke("trigger_tutor");
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Failed to trigger tutor capture");
        setState("error");
      }
    } else {
      // Mock flow for browser preview
      setTimeout(() => setState("thinking"), 700);
      setTimeout(() => {
        setAnswer(
          "### Concept Breakdown\n\n- **Target:** Detected code block or document on screen.\n- **Explanation:** In this context, the logic handles active window bounds capture and converts it to a compact JPEG stream.\n- **Key Takeaway:** Using low latency cloud vision preserves battery and yields immediate tutoring answers."
        );
        setState("ready");
      }, 1600);
    }
  };

  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || state === "thinking") return;

    const query = followUp.trim();
    setFollowUp("");
    setState("thinking");

    if (isTauri) {
      try {
        await tauriInvoke("send_followup", { query });
      } catch (err: any) {
        setErrorMessage(err?.toString() || "Follow-up failed");
        setState("ready");
      }
    } else {
      // Browser simulation
      setTimeout(() => {
        setAnswer((prev) => prev + `\n\n**Q: ${query}**\n\n*Follow-up answer:* Yes! The capture fallbacks to fullscreen automatically if the active window is elevated or minimized.`);
        setState("ready");
      }, 900);
    }
  };

  const handleDismiss = async () => {
    if (isTauri) {
      await tauriInvoke("dismiss_card");
    } else {
      setState("idle");
    }
  };

  const handleCopy = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full h-screen p-3 flex flex-col justify-end items-end select-none font-sans antialiased text-neutral-100">
      {/* Floating Tutor Card */}
      <div
        className={`w-full max-w-[430px] rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xl backdrop-blur-xl flex flex-col ${
          state === "error"
            ? "border-rose-500/50 bg-neutral-950/90 shadow-rose-950/30"
            : state === "thinking"
            ? "border-sky-500/40 bg-neutral-950/90 shadow-sky-950/30"
            : "border-neutral-700/60 bg-neutral-950/85 shadow-black/60"
        }`}
        style={{ maxHeight: "calc(100vh - 24px)" }}
      >
        {/* Header / Drag Bar */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-800/80 bg-neutral-900/60 cursor-grab active:cursor-grabbing"
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <div className="p-1 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-500 text-white shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-neutral-200">
              AI Tutor Overlay
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-700/80 bg-neutral-800/60 text-neutral-400">
              {hotkeyInfo.shortcut}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <GripHorizontal className="w-3.5 h-3.5 text-neutral-500 mr-1" />
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
              Hotkey {hotkeyInfo.shortcut} collision. Use manual trigger button below.
            </span>
          </div>
        )}

        {/* Status Indicator Bar */}
        <div className="px-3.5 py-2 border-b border-neutral-800/50 flex items-center justify-between text-xs">
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
            <span className="capitalize text-neutral-300 text-[11px] font-medium">
              {state === "idle" && "Ready to capture"}
              {state === "capturing" && "Capturing active window..."}
              {state === "thinking" && "Analyzing with vision AI..."}
              {state === "ready" && "Explanation ready"}
              {state === "error" && "Error"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {answer && (
              <button
                onClick={handleCopy}
                className="px-2 py-1 rounded text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 flex items-center gap-1 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleTrigger}
              disabled={state === "capturing" || state === "thinking"}
              className="px-2 py-1 rounded text-[11px] font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Retake capture (Alt+T)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retake</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-3.5 overflow-y-auto max-h-[300px] text-xs leading-relaxed text-neutral-200 space-y-2 select-text">
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="text-[11px] leading-normal">{errorMessage}</div>
            </div>
          )}

          {state === "idle" && !answer && !errorMessage && (
            <div className="py-6 flex flex-col items-center justify-center text-center text-neutral-400 space-y-3">
              <div className="p-2.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <p className="text-neutral-300 font-medium text-xs">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono text-[11px] text-sky-300">Alt+T</kbd> anywhere
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Captures active window and explains in real-time
                </p>
              </div>
              <button
                onClick={handleTrigger}
                className="mt-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-md shadow-sky-600/20 transition-colors"
              >
                Capture Screen Now
              </button>
            </div>
          )}

          {state === "thinking" && !answer && (
            <div className="py-6 flex flex-col items-center justify-center space-y-2.5 text-neutral-400">
              <div className="w-5 h-5 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
              <p className="text-[11px] text-neutral-400 animate-pulse">
                Reading screen & crafting tutor explanation...
              </p>
            </div>
          )}

          {answer && (
            <div className="prose prose-invert prose-xs max-w-none space-y-1.5 whitespace-pre-wrap leading-normal font-sans">
              {answer}
            </div>
          )}
          <div ref={contentEndRef} />
        </div>

        {/* Follow-up input form */}
        <div className="p-2.5 border-t border-neutral-800/80 bg-neutral-900/40">
          <form onSubmit={handleFollowUpSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={state === "thinking" ? "Generating..." : "Ask follow-up question... (Enter)"}
              disabled={state === "thinking" || state === "capturing"}
              className="flex-1 bg-neutral-900/90 border border-neutral-700/80 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-sky-500/80 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!followUp.trim() || state === "thinking"}
              className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white transition-colors"
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
