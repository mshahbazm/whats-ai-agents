import type OpenAI from "openai";
import { Resend } from "resend";
import type { Store } from "./store";

type Contact = { id: number; name: string; email: string; birthday: string; note: string };
type Todo = { id: number; title: string; due: string | null; done: boolean };
type Reminder = { id: number; text: string; remind_at: string };

const nextId = (rows: { id: number }[]) => Math.max(0, ...rows.map((r) => r.id)) + 1;

// What the model is told about each tool. The model never runs these;
// it only asks for them by name, and our code below does the work.
export const toolDefinitions: OpenAI.Responses.FunctionTool[] = [
  {
    type: "function",
    strict: false,
    name: "get_today",
    description: "Get the current date, weekday and time.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    strict: false,
    name: "list_contacts",
    description: "List all of Shahbaz's contacts with their email, birthday (MM-DD) and a short note.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    strict: false,
    name: "send_email",
    description: "Send an email from Shahbaz to someone in his contact list.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "list_todos",
    description: "List to-do items.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "done", "all"], description: "Defaults to pending" },
      },
    },
  },
  {
    type: "function",
    strict: false,
    name: "add_todo",
    description: "Add a to-do item.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        due: { type: "string", description: "Due date as YYYY-MM-DD, optional" },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "complete_todo",
    description: "Mark a to-do item as done.",
    parameters: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    type: "function",
    strict: false,
    name: "list_reminders",
    description: "List reminders.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    strict: false,
    name: "add_reminder",
    description: "Add a reminder.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        remind_at: { type: "string", description: "Local date and time as YYYY-MM-DDTHH:mm" },
      },
      required: ["text", "remind_at"],
    },
  },
];

type Args = Record<string, unknown>;

const tools: Record<string, (args: Args, store: Store) => Promise<unknown>> = {
  async get_today() {
    const timeZone = process.env.TIMEZONE || "Asia/Karachi";
    const now = new Date();
    return {
      date: now.toLocaleDateString("en-CA", { timeZone }),
      weekday: now.toLocaleDateString("en-US", { timeZone, weekday: "long" }),
      time: now.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }),
      timeZone,
    };
  },

  async list_contacts(_args, store) {
    return store.load<Contact>("contacts");
  },

  async send_email({ to, subject, body }, store) {
    // Only ever email people in the contact list, whatever the model asks for.
    const contacts = await store.load<Contact>("contacts");
    if (!contacts.some((c) => c.email.toLowerCase() === String(to).trim().toLowerCase())) {
      return { error: `Not sent: ${to} is not in the contact list.` };
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_ADDRESS!,
      to: String(to),
      subject: String(subject),
      text: String(body),
    });
    if (error) return { error: error.message };
    return { sent: true, id: data?.id, to };
  },

  async list_todos({ status = "pending" }, store) {
    const todos = await store.load<Todo>("todos");
    if (status === "all") return todos;
    return todos.filter((t) => t.done === (status === "done"));
  },

  async add_todo({ title, due }, store) {
    const todos = await store.load<Todo>("todos");
    const todo: Todo = { id: nextId(todos), title: String(title), due: due ? String(due) : null, done: false };
    await store.save("todos", [...todos, todo]);
    return todo;
  },

  async complete_todo({ id }, store) {
    const todos = await store.load<Todo>("todos");
    const todo = todos.find((t) => t.id === Number(id));
    if (!todo) return { error: `No to-do with id ${id}` };
    todo.done = true;
    await store.save("todos", todos);
    return todo;
  },

  async list_reminders(_args, store) {
    return store.load<Reminder>("reminders");
  },

  async add_reminder({ text, remind_at }, store) {
    const reminders = await store.load<Reminder>("reminders");
    const reminder: Reminder = { id: nextId(reminders), text: String(text), remind_at: String(remind_at) };
    await store.save("reminders", [...reminders, reminder]);
    return reminder;
  },
};

export async function runTool(name: string, args: Args, store: Store): Promise<unknown> {
  const tool = tools[name];
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool(args, store);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
