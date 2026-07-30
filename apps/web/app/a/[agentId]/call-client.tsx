"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { MAX_CALL_DURATION_MS } from "@agent/shared";

type Turn = { role: string; content: string };
type Status = "idle" | "connecting" | "live" | "ended";

const MAX_MINUTES = MAX_CALL_DURATION_MS / 60_000;

/** Below this the countdown turns amber, so running out is not a surprise. */
const WARN_AT_MS = 30_000;

export default function CallClient({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const clientRef = useRef<RetellWebClient | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [endedByTimeout, setEndedByTimeout] = useState(false);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    const client = new RetellWebClient();
    clientRef.current = client;

    client.on("call_started", () => {
      setStatus("live");

      /**
       * The agent is configured with the same ceiling on Retell's side, so the
       * call would end even with this page closed. This timer is what makes the
       * limit visible and hangs up cleanly a moment before the server does,
       * rather than the audio simply stopping mid-sentence.
       */
      const deadline = Date.now() + MAX_CALL_DURATION_MS;
      setRemainingMs(MAX_CALL_DURATION_MS);
      clearTick();
      tickRef.current = setInterval(() => {
        const left = deadline - Date.now();
        if (left > 0) {
          setRemainingMs(left);
          return;
        }
        clearTick();
        setRemainingMs(0);
        setEndedByTimeout(true);
        client.stopCall();
        setStatus("ended");
      }, 250);
    });

    client.on("call_ended", () => {
      clearTick();
      setStatus("ended");
      setSpeaking(false);
    });
    client.on("agent_start_talking", () => setSpeaking(true));
    client.on("agent_stop_talking", () => setSpeaking(false));
    client.on("update", (update: { transcript?: Turn[] }) => {
      if (update.transcript) setTranscript(update.transcript);
    });
    client.on("error", (err: unknown) => {
      clearTick();
      setError(err instanceof Error ? err.message : String(err));
      client.stopCall();
      setStatus("ended");
    });

    return () => {
      clearTick();
      client.stopCall();
      clientRef.current = null;
    };
  }, [clearTick]);

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  async function start() {
    setError(null);
    setTranscript([]);
    setEndedByTimeout(false);
    setRemainingMs(null);
    setStatus("connecting");
    try {
      const res = await fetch(`/api/agents/${agentId}/web-call`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start the call.");
      await clientRef.current?.startCall({ accessToken: body.accessToken });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not start the call. Check that your browser allowed microphone access.",
      );
      setStatus("idle");
    }
  }

  function stop() {
    clearTick();
    clientRef.current?.stopCall();
    setStatus("ended");
  }

  const inCall = status === "live" || status === "connecting";
  const lowOnTime = remainingMs !== null && remainingMs <= WARN_AT_MS;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* The one thing to press */}
      {inCall ? (
        <button
          onClick={stop}
          className="w-full max-w-sm rounded-xl bg-red-600 px-6 py-4 text-base font-medium text-white transition hover:brightness-110"
        >
          End call
        </button>
      ) : (
        <button
          onClick={start}
          className="w-full max-w-sm rounded-xl bg-[var(--color-accent)] px-6 py-4 text-base font-medium text-white transition hover:brightness-110"
        >
          {status === "ended"
            ? `🎙 Talk to ${agentName} again`
            : `🎙 Start the call`}
        </button>
      )}

      {/* Live state */}
      <div className="flex items-center gap-2.5 text-sm text-[var(--color-muted)]">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === "live"
              ? speaking
                ? "animate-pulse bg-emerald-400"
                : "bg-emerald-600"
              : status === "connecting"
                ? "animate-pulse bg-amber-400"
                : "bg-[#3a414d]"
          }`}
        />
        {status === "idle" && `Ready when you are · ${MAX_MINUTES} minute limit`}
        {status === "connecting" && `Connecting you to ${agentName}…`}
        {status === "live" &&
          (speaking ? `${agentName} is speaking` : "Listening — go ahead")}
        {status === "ended" &&
          (endedByTimeout
            ? `Call ended — ${MAX_MINUTES} minute limit reached`
            : "Call ended")}
      </div>

      {/* Countdown, only while a call is actually running */}
      {status === "live" && remainingMs !== null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-muted)]">Time remaining</span>
          <span
            className={`rounded-md px-2 py-1 font-mono tabular-nums ${
              lowOnTime
                ? "bg-amber-950/50 text-amber-300"
                : "bg-[#0f1216] text-[#e8eaed]"
            }`}
          >
            {formatRemaining(remainingMs)}
          </span>
        </div>
      )}

      {error && (
        <p className="w-full rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Transcript appears only once there is something to show */}
      {transcript.length > 0 && (
        <div className="w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] p-5">
          <h2 className="mb-4 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-muted)] uppercase">
            Transcript
          </h2>
          <div
            ref={transcriptRef}
            className="flex max-h-72 flex-col gap-3 overflow-y-auto"
          >
            {transcript.map((turn, i) => (
              <div key={i}>
                <span
                  className={`mb-0.5 block text-[11px] tracking-wide uppercase ${
                    turn.role === "agent"
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-muted)]"
                  }`}
                >
                  {turn.role === "agent" ? agentName : "You"}
                </span>
                <p className="text-[15px] leading-relaxed">{turn.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Rounds up, so the display never shows 0:00 while the call is still live. */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
