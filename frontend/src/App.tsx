import { useState } from "react";

type CardState = "idle" | "capturing" | "thinking" | "answering" | "ready";

export default function App() {
  const [card, setCard] = useState<CardState>("idle");
  const [answer, setAnswer] = useState("");
  const [followUp, setFollowUp] = useState("");

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-medium">Tutor Overlay</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Windows-first AI tutor overlay. Press the hotkey to invoke.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm"
            onClick={() => setCard("idle")}
          >
            Reset demo state
          </button>
        </div>

        <TutorCard
          state={card}
          answer={answer}
          followUp={followUp}
          onOpen={() => setCard("thinking")}
          onClose={() => {
            setCard("idle");
            setAnswer("");
            setFollowUp("");
          }}
          onSetAnswer={(text) => setAnswer(text)}
          onFollowUpChange={(value) => setFollowUp(value)}
        />
      </div>
    </div>
  );
}

function TutorCard({
  state,
  answer,
  followUp,
  onOpen,
  onClose,
  onSetAnswer,
  onFollowUpChange,
}: {
  state: CardState;
  answer: string;
  followUp: string;
  onOpen: () => void;
  onClose: () => void;
  onSetAnswer: (text: string) => void;
  onFollowUpChange: (value: string) => void;
}) {
  const visible = state !== "idle";

  if (!visible) {
    return (
      <button
        className="mt-6 fixed bottom-6 right-6 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm shadow-lg"
        onClick={onOpen}
      >
        Open tutor card
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusDot state={state} />
          <span className="text-sm capitalize text-neutral-300">
            {state}
          </span>
        </div>
        <button
          className="text-neutral-400 hover:text-neutral-200"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="px-4 py-3 text-sm text-neutral-200">
        {answer ? (
          <p className="whitespace-pre-wrap">{answer}</p>
        ) : (
          <p className="text-neutral-400">Waiting for an answer…</p>
        )}
      </div>

      <div className="border-t border-neutral-800 px-4 py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            // In v1 this is the reserved follow-up slot.
            onClose();
          }}
        >
          <input
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            placeholder="Follow-up question (v1 slot)"
            value={followUp}
            onChange={(e) => onFollowUpChange(e.target.value)}
          />
          <button
            className="rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm"
            type="submit"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: CardState }) {
  const color =
    state === "idle" || state === "ready"
      ? "bg-neutral-500"
      : state === "capturing"
        ? "bg-yellow-500"
        : state === "thinking" || state === "answering"
          ? "bg-blue-500"
          : "bg-green-500";

  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}
