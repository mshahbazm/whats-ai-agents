import { isAuthorized, unauthorized } from "@/lib/auth";
import { clearMemory } from "@/lib/store";

// Forget everything: chat history, to-dos and reminders go back to the JSON files.
export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  await clearMemory();
  return Response.json({ ok: true });
}
