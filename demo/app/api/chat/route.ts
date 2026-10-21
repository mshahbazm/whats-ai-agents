import { runAgent } from "@/lib/agent";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { createStore, loadChat, saveChat } from "@/lib/store";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const { message, memory } = (await request.json()) as { message: string; memory: boolean };

  // Memory off: the model only ever sees this one message.
  // Memory on: we load the saved conversation from storage and send it all.
  // The model itself never remembers anything; we resend the history each time.
  const history = [...(memory ? await loadChat() : []), { role: "user" as const, content: message }];
  const store = createStore(memory);

  // Stream one JSON event per line so the UI can show each tool call live.
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of runAgent(history, store)) {
          send(event);
          if (memory && event.type === "text") {
            await saveChat([...history, { role: "assistant", content: event.text }]);
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
