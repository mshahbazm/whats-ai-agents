import { runAgent, type ChatTurn } from "@/lib/agent";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { createStore, type SavedData } from "@/lib/store";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const { messages, memory, saved } = (await request.json()) as {
    messages: ChatTurn[];
    memory: boolean;
    saved: SavedData | null;
  };

  // Chats are never stored. The browser sends either just the newest message
  // or, with chat history on, the whole conversation from this tab.
  // With long-term memory on, it also sends its saved to-dos and reminders,
  // and gets the updated copy back at the end to save again.
  const history = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-40);
  const store = createStore(memory ? saved : null);

  // Stream one JSON event per line so the UI can show each tool call live.
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of runAgent(history, store)) send(event);
        if (memory) send({ type: "saved", data: store.snapshot() });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
