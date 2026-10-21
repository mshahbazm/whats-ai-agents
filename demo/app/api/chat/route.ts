import { runAgent } from "@/lib/agent";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { createStore } from "@/lib/store";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const { message, memory } = (await request.json()) as { message: string; memory: boolean };

  // The model only ever sees this one message: chats are never stored.
  // Memory decides whether to-do and reminder changes are saved.
  const history = [{ role: "user" as const, content: message }];
  const store = createStore(memory);

  // Stream one JSON event per line so the UI can show each tool call live.
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of runAgent(history, store)) send(event);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
