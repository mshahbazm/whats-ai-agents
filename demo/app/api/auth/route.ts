import { isAuthorized, unauthorized } from "@/lib/auth";

// Lets the UI check a password before showing the chat.
export async function POST(request: Request) {
  return isAuthorized(request) ? Response.json({ ok: true }) : unauthorized();
}
