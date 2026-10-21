"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
} from "@assistant-ui/react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Collapsible } from "@base-ui/react/collapsible";
import { Switch } from "@base-ui/react/switch";
import { ArrowUp, ChevronRight, LoaderCircle, LockKeyhole, Square, Wrench } from "lucide-react";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import remarkGfm from "remark-gfm";

type ToolPart = Extract<ThreadAssistantMessagePart, { type: "tool-call" }>;

// Sends the chat to /api/chat and turns the streamed agent events
// (tool calls, tool results, final text) into message parts for the UI.
const makeAgentAdapter = (password: string, onUnauthorized: () => void): ChatModelAdapter => ({
  async *run({ messages, abortSignal }) {
    // Chat history off: only the newest message is sent.
    // Chat history on: every message in this tab is sent again (short-term memory).
    const history = localStorage.getItem(HISTORY_KEY) === "on";
    const memory = localStorage.getItem(MEMORY_KEY) === "on";
    const chat = (history ? messages : messages.slice(-1))
      .map((m) => ({ role: m.role, content: m.content.map((p) => (p.type === "text" ? p.text : "")).join("") }))
      .filter((m) => m.content);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-password": password },
      body: JSON.stringify({ messages: chat, memory, saved: memory ? readSaved() : null }),
      signal: abortSignal,
    });
    if (response.status === 401) {
      onUnauthorized();
      throw new Error("Wrong password");
    }
    if (!response.body) throw new Error("No response from the agent");

    const parts: ThreadAssistantMessagePart[] = [];
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.type === "tool-call") {
          parts.push({
            type: "tool-call",
            toolCallId: event.id,
            toolName: event.name,
            args: event.args,
            argsText: JSON.stringify(event.args),
          });
        } else if (event.type === "tool-result") {
          const i = parts.findIndex((p) => p.type === "tool-call" && p.toolCallId === event.id);
          if (i >= 0) parts[i] = { ...(parts[i] as ToolPart), result: event.result };
        } else if (event.type === "text") {
          parts.push({ type: "text", text: event.text });
        } else if (event.type === "saved") {
          // Memory on: keep the updated to-dos and reminders in this browser.
          localStorage.setItem(DATA_KEY, JSON.stringify(event.data));
          continue;
        } else if (event.type === "error") {
          parts.push({ type: "text", text: `⚠️ ${event.message}` });
        }
        yield { content: [...parts] };
      }
    }
  },
});

function ToolCard({ toolName, args, result }: ToolCallMessagePartProps) {
  const running = result === undefined;
  const argList = Object.entries(args ?? {})
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v) : JSON.stringify(v)}`)
    .join(", ");

  return (
    <Collapsible.Root className="my-2 rounded-lg border border-zinc-200 bg-zinc-50 text-[13px] dark:border-zinc-800 dark:bg-zinc-900">
      <Collapsible.Trigger className="group flex w-full items-center gap-2 px-3 py-2 text-left font-mono">
        {running ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-amber-500" />
        ) : (
          <Wrench className="size-3.5 shrink-0 text-emerald-600" />
        )}
        <span className="truncate">
          <b className="font-semibold">{toolName}</b>
          <span className="text-zinc-500">({argList})</span>
        </span>
        <ChevronRight className="ml-auto size-3.5 shrink-0 text-zinc-400 transition-transform group-data-[panel-open]:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Panel className="border-t border-zinc-200 px-3 py-2 font-mono text-xs dark:border-zinc-800">
        <div className="text-zinc-500">args</div>
        <pre className="mb-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(args, null, 2)}</pre>
        <div className="text-zinc-500">result</div>
        <pre className="overflow-x-auto whitespace-pre-wrap">{running ? "…" : JSON.stringify(result, null, 2)}</pre>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end py-3">
      <div className="max-w-[80%] rounded-3xl bg-zinc-100 px-5 py-2.5 dark:bg-zinc-800">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function MarkdownText() {
  return <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} className="md" />;
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="py-3">
      <MessagePrimitive.Parts
        components={{
          Text: MarkdownText,
          tools: { Fallback: ToolCard },
        }}
      />
    </MessagePrimitive.Root>
  );
}

const suggestions = [
  "What's pending for today?",
  "Email Haris and wish him a happy birthday.",
  "Whose birthday is this week? Send each of them a birthday email.",
  "Remind me to call Ayesha tomorrow at 11am.",
];

// The password and the memory switch are kept in this browser's localStorage.
const PASSWORD_KEY = "demo-password";
const MEMORY_KEY = "demo-memory";
const HISTORY_KEY = "demo-history";
// With memory on, to-dos and reminders are saved here, in this browser only.
const DATA_KEY = "demo-saved-data";
const readSaved = () => JSON.parse(localStorage.getItem(DATA_KEY) ?? "null");
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const setStoredPassword = (value: string | null) => {
  if (value) localStorage.setItem(PASSWORD_KEY, value);
  else localStorage.removeItem(PASSWORD_KEY);
  window.dispatchEvent(new StorageEvent("storage"));
};

const useSetting = (key: string) =>
  useSyncExternalStore(subscribe, () => localStorage.getItem(key) === "on", () => false);

const setSetting = (key: string, on: boolean) => {
  localStorage.setItem(key, on ? "on" : "off");
  window.dispatchEvent(new StorageEvent("storage"));
};

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className={on ? "font-medium" : "text-zinc-500"}>{label}</span>
      <Switch.Root
        checked={on}
        onCheckedChange={onChange}
        className="relative flex h-6 w-10 rounded-full bg-zinc-300 p-0.5 transition-colors data-[checked]:bg-emerald-600 dark:bg-zinc-700"
      >
        <Switch.Thumb className="size-5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-4" />
      </Switch.Root>
    </label>
  );
}

function Settings() {
  const history = useSetting(HISTORY_KEY);
  const memory = useSetting(MEMORY_KEY);

  function forget() {
    localStorage.removeItem(DATA_KEY);
    window.location.reload();
  }

  return (
    <div className="ml-auto flex items-center gap-5 text-sm">
      {memory && (
        <button onClick={forget} className="text-zinc-500 underline-offset-2 hover:underline">
          Forget everything
        </button>
      )}
      <Toggle label="Chat history" on={history} onChange={(on) => setSetting(HISTORY_KEY, on)} />
      <Toggle label="Long-term memory" on={memory} onChange={(on) => setSetting(MEMORY_KEY, on)} />
    </div>
  );
}

export function Assistant() {
  const password = useSyncExternalStore(subscribe, () => localStorage.getItem(PASSWORD_KEY), () => null);
  return password ? <Chat password={password} /> : <PasswordScreen />;
}

function PasswordScreen() {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", { method: "POST", headers: { "x-demo-password": value } });
    if (res.ok) setStoredPassword(value);
    else setError(true);
  }

  return (
    <div className="flex h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <LockKeyhole className="size-6 text-zinc-500" />
        <h1 className="text-2xl font-semibold tracking-tight">Shahbaz&apos;s assistant</h1>
        <p className="text-sm text-zinc-500">Enter the demo password to continue.</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Password"
          className="rounded-xl border border-zinc-300 px-4 py-2.5 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-transparent"
        />
        {error && <p className="text-sm text-red-600">Wrong password.</p>}
        <button
          disabled={!value}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-white disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

function Chat({ password }: { password: string }) {
  const adapter = useMemo(() => makeAgentAdapter(password, () => setStoredPassword(null)), [password]);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-dvh flex-col">
        <header className="flex items-center gap-2 px-6 py-4">
          <span className="font-semibold">Shahbaz&apos;s assistant</span>
          <span className="font-mono text-xs text-zinc-500">· Building AI agents demo</span>
          <Settings />
        </header>

        <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto px-4">
          <ThreadPrimitive.Empty>
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8">
              <h1 className="text-3xl font-semibold tracking-tight">What can I help with?</h1>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {suggestions.map((prompt) => (
                  <ThreadPrimitive.Suggestion
                    key={prompt}
                    prompt={prompt}
                    send
                    className="rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {prompt}
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </ThreadPrimitive.Empty>

          <div className="mx-auto w-full max-w-3xl">
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>

        <div className="px-4 pb-6">
          <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-zinc-200 px-4 py-3 shadow-sm focus-within:border-zinc-400 dark:border-zinc-800">
            <ComposerPrimitive.Input
              autoFocus
              rows={1}
              placeholder="Ask anything"
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 outline-none"
            />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send className="rounded-full bg-zinc-900 p-2 text-white disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900">
                <ArrowUp className="size-4" />
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel className="rounded-full bg-zinc-900 p-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
                <Square className="size-4" />
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </ComposerPrimitive.Root>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
