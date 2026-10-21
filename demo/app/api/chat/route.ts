import { runAgent } from "@/lib/agent";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { createStore, type SavedData } from "@/lib/store";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const { message, memory, saved } = (await request.json()) as {
    message: string;
    memory: boolean;
    saved: SavedData | null;
  };

  // The model only ever sees this one message: chats are never stored.
  // With memory on, the browser sends its saved to-dos and reminders, and
  // gets the updated copy back at the end to save again.
  const history = [{ role: "user" as const, content: message }];
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
