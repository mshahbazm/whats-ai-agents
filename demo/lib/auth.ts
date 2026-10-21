// Every API request must carry the demo password, so a deployed copy
// can't be used (and run up OpenAI or email costs) by anyone who finds the URL.
export function isAuthorized(request: Request): boolean {
  const expected = process.env.DEMO_PASSWORD;
  return Boolean(expected) && request.headers.get("x-demo-password") === expected;
}

export const unauthorized = () => Response.json({ error: "Wrong password" }, { status: 401 });
