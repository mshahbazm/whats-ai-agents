import { getCloudflareContext } from "@opennextjs/cloudflare";
import contacts from "@/data/contacts.json";
import reminders from "@/data/reminders.json";
import todos from "@/data/todos.json";

// The JSON files in /data act as our "API". Swapping them for a real
// contacts service or database would not change anything the model sees.
const seeds = { contacts, todos, reminders };
export type DataName = keyof typeof seeds;

export type Store = {
  load<T>(name: DataName): Promise<T[]>;
  save<T>(name: Exclude<DataName, "contacts">, rows: T[]): Promise<void>;
};

const kv = () => getCloudflareContext().env.DATA;
const fresh = <T>(name: DataName) => structuredClone(seeds[name]) as T[];

// Memory off: every request starts from the JSON files, and changes are
// forgotten when the request ends.
// Memory on: changes to to-dos and reminders are saved in Cloudflare KV.
export function createStore(memory: boolean): Store {
  if (!memory) {
    const scratch = new Map<DataName, unknown[]>();
    return {
      async load<T>(name: DataName) {
        return (scratch.get(name) as T[]) ?? fresh<T>(name);
      },
      async save(name, rows) {
        scratch.set(name, rows);
      },
    };
  }
  return {
    async load<T>(name: DataName) {
      if (name === "contacts") return fresh<T>(name);
      return ((await kv().get(name, "json")) as T[] | null) ?? fresh<T>(name);
    },
    async save(name, rows) {
      await kv().put(name, JSON.stringify(rows));
    },
  };
}

// Chat history, kept only while memory is on.
export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function loadChat(): Promise<ChatTurn[]> {
  return ((await kv().get("chat", "json")) as ChatTurn[] | null) ?? [];
}

export async function saveChat(turns: ChatTurn[]) {
  await kv().put("chat", JSON.stringify(turns));
}

// Wipes everything the agent has remembered: chat, to-dos and reminders.
export async function clearMemory() {
  await Promise.all(["chat", "todos", "reminders"].map((key) => kv().delete(key)));
}
