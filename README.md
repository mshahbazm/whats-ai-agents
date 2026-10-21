# What are AI agents?

Material for a 2-hour university lecture on building AI agents: the slides, and the agent built live during the talk.

The lecture starts from what a language model actually does (predict the next token) and builds up, one question at a time, to an agent: an LLM with tools, running in a loop and deciding each next step until the task is done.

## What's in here

| Folder | What it is |
|---|---|
| [`concepts/`](concepts/) | The slide deck. The current deck is [`concepts/a-swiss.html`](concepts/a-swiss.html). |
| [`demo/`](demo/) | The live demo: a personal assistant agent (Next.js + OpenAI SDK) that reads contacts, sends real emails, and manages to-dos and reminders. |

## Slides

Plain HTML, no build step. Serve the folder and open the deck:

```bash
python3 -m http.server 8030
```

Then go to <http://localhost:8030/concepts/a-swiss.html>. Use the arrow keys or click to move forward. On slides with steps, each press reveals the next one.

## The demo agent

A ChatGPT-style chat page in front of a small agent. Every tool call the agent makes shows up in the chat as it happens, so you can follow the loop step by step.

### Run it

```bash
cd demo
bun install
cp .env.example .env.local   # then fill in your keys
bun dev
```

Open <http://localhost:3000> and enter your `DEMO_PASSWORD`.

### Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Any chat model that supports tool calling |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key, for sending email |
| `FROM_ADDRESS` | Sender address on a domain verified in Resend |
| `DEMO_PASSWORD` | Password needed to use the agent. Every API request is checked against it |
| `MAX_STEPS` | Stop the loop after this many model calls |
| `TIMEZONE` | Used by `get_today` |

`.env.local` is gitignored. Only `.env.example` is committed.

### Memory switch

The chat header has a **Memory** switch, off by default. Chats themselves are never stored: the agent only ever sees the message you just sent.

- **Off:** nothing is saved. Add a to-do or reminder, ask again (or refresh), and it's gone.
- **On:** to-do and reminder changes are saved in your browser (localStorage) and are still there on the next message or after a refresh. **Forget everything** clears them.

The server keeps nothing. With memory on, the browser sends its saved to-dos and reminders along with each message, the tools work on that copy, and the server sends the updated copy back for the browser to save.

### How it works

| File | Role |
|---|---|
| [`demo/lib/agent.ts`](demo/lib/agent.ts) | The agentic loop: call the model, run the tools it asks for, send the results back, repeat until it answers without a tool call |
| [`demo/lib/tools.ts`](demo/lib/tools.ts) | The tools: their JSON descriptions for the model, and the code that actually runs them |
| [`demo/app/api/chat/route.ts`](demo/app/api/chat/route.ts) | API route that runs the agent and streams each step to the browser |
| [`demo/components/assistant.tsx`](demo/components/assistant.tsx) | The chat UI, built with [assistant-ui](https://www.assistant-ui.com) and [Base UI](https://base-ui.com) |
| [`demo/lib/store.ts`](demo/lib/store.ts) | The data the tools work on for one request: the JSON files, or the browser's saved to-dos and reminders when memory is on |
| [`demo/lib/auth.ts`](demo/lib/auth.ts) | The password check on every API request |
| [`demo/data/*.json`](demo/data/) | A stand-in "API": contacts, to-dos and reminders. Contacts are read-only, and `send_email` only sends to people in this list |

Tools available to the agent: `get_today`, `list_contacts`, `send_email`, `list_todos`, `add_todo`, `complete_todo`, `list_reminders`, `add_reminder`.

The server terminal also logs each step (`[step 2] send_email({...})`), which is handy to show next to the chat.

### Things to try

- "What's pending for today?"
- "Email Haris and wish him a happy birthday."
- "Whose birthday is this week? Send each of them a birthday email."
- "Remind me to call Ayesha tomorrow at 11am."
- Then: "What did you just send Haris?" It has no idea, because chats are never stored. This is where the memory part of the lecture begins.
- Memory: add a to-do, then ask for your to-dos again. With memory off it's gone; switch memory on and it stays.

Emails to `*@yopmail.com` can be read at `https://yopmail.com/<name>`, for example <https://yopmail.com/haris-demo>.

## Author

[Shahbaz Manzoor](https://shahbazmanzoor.com), software engineer working on AI products and agentic systems.
