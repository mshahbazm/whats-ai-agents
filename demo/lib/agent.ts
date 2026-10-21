import OpenAI from "openai";
import { runTool, toolDefinitions } from "./tools";

export const SYSTEM_PROMPT = `You are Shahbaz's personal assistant.

You can look up his contacts, send emails on his behalf, and manage his to-do list and reminders using your tools.

When he asks you to send a message, write a clear subject and a short, friendly body in his voice, and sign it as Shahbaz.`;

export type AgentEvent =
  | { type: "tool-call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool-result"; id: string; result: unknown }
  | { type: "text"; text: string }
  | { type: "error"; message: string };

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// The agentic loop from the slides:
// ask the model, run any tools it asks for, send the results back, repeat
// until it replies without a tool call.
export async function* runAgent(history: Message[]): AsyncGenerator<AgentEvent> {
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const maxSteps = Number(process.env.MAX_STEPS || 8);
  const messages: Message[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

  for (let step = 1; step <= maxSteps; step++) {
    const response = await client.chat.completions.create({ model, messages, tools: toolDefinitions });
    const reply = response.choices[0].message;
    messages.push(reply);

    // No tool calls: the model is done.
    if (!reply.tool_calls?.length) {
      console.log(`[step ${step}] final answer`);
      yield { type: "text", text: reply.content ?? "" };
      return;
    }

    for (const call of reply.tool_calls) {
      if (call.type !== "function") continue;
      const args = JSON.parse(call.function.arguments || "{}");
      console.log(`[step ${step}] ${call.function.name}(${JSON.stringify(args)})`);
      yield { type: "tool-call", id: call.id, name: call.function.name, args };

      const result = await runTool(call.function.name, args);
      yield { type: "tool-result", id: call.id, result };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  yield { type: "error", message: `Stopped after ${maxSteps} steps without a final answer.` };
}
