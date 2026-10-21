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

export type ChatMessage = { role: "user" | "assistant"; content: string };

// The agentic loop from the slides:
// ask the model, run any tools it asks for, send the results back, repeat
// until it replies without a tool call.
export async function* runAgent(history: ChatMessage[]): AsyncGenerator<AgentEvent> {
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const maxSteps = Number(process.env.MAX_STEPS || 8);
  const input: OpenAI.Responses.ResponseInput = [...history];

  for (let step = 1; step <= maxSteps; step++) {
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input,
      tools: toolDefinitions,
    });
    // Keep everything the model produced (reasoning, tool calls, text) for the next turn.
    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));

    const calls = response.output.filter((item) => item.type === "function_call");

    // No tool calls: the model is done.
    if (calls.length === 0) {
      console.log(`[step ${step}] final answer`);
      yield { type: "text", text: response.output_text };
      return;
    }

    for (const call of calls) {
      const args = JSON.parse(call.arguments || "{}");
      console.log(`[step ${step}] ${call.name}(${JSON.stringify(args)})`);
      yield { type: "tool-call", id: call.call_id, name: call.name, args };

      const result = await runTool(call.name, args);
      yield { type: "tool-result", id: call.call_id, result };
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
  }

  yield { type: "error", message: `Stopped after ${maxSteps} steps without a final answer.` };
}
