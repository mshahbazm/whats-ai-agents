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
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowUp, ChevronRight, LoaderCircle, Square, Wrench } from "lucide-react";

type ToolPart = Extract<ThreadAssistantMessagePart, { type: "tool-call" }>;

// Sends the chat to /api/chat and turns the streamed agent events
// (tool calls, tool results, final text) into message parts for the UI.
const agentAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const chat = messages.map((m) => ({
      role: m.role,
      content: m.content.map((p) => (p.type === "text" ? p.text : "")).join(""),
    }));

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat }),
      signal: abortSignal,
    });
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
        } else if (event.type === "error") {
          parts.push({ type: "text", text: `⚠️ ${event.message}` });
        }
        yield { content: [...parts] };
      }
    }
  },
};

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

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="py-3">
      <MessagePrimitive.Parts
        components={{
          Text: ({ text }) => <p className="whitespace-pre-wrap leading-7">{text}</p>,
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

export function Assistant() {
  const runtime = useLocalRuntime(agentAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-dvh flex-col">
        <header className="flex items-center gap-2 px-6 py-4">
          <span className="font-semibold">Shahbaz&apos;s assistant</span>
          <span className="font-mono text-xs text-zinc-500">· Building AI agents demo</span>
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
