import { runAgent, type ChatMessage } from "@/lib/agent";

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: ChatMessage[] };

  // By default every request starts blank: the model only sees the latest
  // message. This is on purpose for the lecture (it shows why agents need
  // memory). Set REMEMBER_CONVERSATION=true to send the whole chat.
  const remember = process.env.REMEMBER_CONVERSATION === "true";
  const history = remember
    ? messages
    : messages.filter((m) => m.role === "user").slice(-1);

  // Stream one JSON event per line so the UI can show each tool call live.
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of runAgent(history)) send(event);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
