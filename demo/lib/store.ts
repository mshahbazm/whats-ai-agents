import contacts from "@/data/contacts.json";
import reminders from "@/data/reminders.json";
import todos from "@/data/todos.json";

// The JSON files in /data act as our "API". Swapping them for a real
// contacts service or database would not change anything the model sees.
const seeds = { contacts, todos, reminders };
export type DataName = keyof typeof seeds;

// The to-dos and reminders the browser saved while memory was on.
export type SavedData = { todos: unknown[]; reminders: unknown[] };

export type Store = {
  load<T>(name: DataName): Promise<T[]>;
  save<T>(name: Exclude<DataName, "contacts">, rows: T[]): Promise<void>;
  snapshot(): SavedData;
};

// A store for one request. It starts from the browser's saved data when
// memory is on, otherwise from the JSON files. The server keeps nothing:
// with memory on, the browser saves the snapshot it gets back.
export function createStore(saved?: SavedData | null): Store {
  const rows = new Map<DataName, unknown[]>([
    ["contacts", structuredClone(seeds.contacts)],
    ["todos", structuredClone(saved?.todos ?? seeds.todos)],
    ["reminders", structuredClone(saved?.reminders ?? seeds.reminders)],
  ]);
  return {
    async load<T>(name: DataName) {
      return rows.get(name) as T[];
    },
    async save(name, value) {
      rows.set(name, value);
    },
    snapshot() {
      return { todos: rows.get("todos")!, reminders: rows.get("reminders")! };
    },
  };
}
