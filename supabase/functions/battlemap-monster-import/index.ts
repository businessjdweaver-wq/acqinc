const origin = "https://businessjdweaver-wq.github.io";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request: Request) => {
  if (request.headers.get("origin") !== origin) return reply(403, { error: "Open Battlemap Studio on GitHub Pages." });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Use POST." });
  try {
    const { ticket, path } = await request.json();
    if (typeof ticket !== "string" || !/^[\da-f-]{36}$/i.test(ticket) ||
        typeof path !== "string" || !/^\/monsters\/\d{1,12}-[a-z0-9-]{1,140}$/i.test(path)) {
      return reply(400, { error: "Enter a D&D Beyond monster page URL." });
    }
    const auth = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/battlemap_room_can_upload_art", {
      method: "POST",
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(5000),
    });
    if (!auth.ok || await auth.json() !== true) return reply(403, { error: "Sign in as GM to import a monster by URL." });
    const response = await fetch("https://www.dndbeyond.com" + path, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "text/html" },
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      return reply(422, { error: "D&D Beyond did not return a public stat block. Paste the stat block from your browser." });
    }
    const page = await response.text();
    const start = page.search(/<div class="mon-stat-block(?:-2024)?"/);
    if (start < 0) return reply(422, { error: "No public stat block was found. Paste the stat block from your browser." });
    const block = page.slice(start).match(/<\/?div\b[^>]*>/gi) || [];
    let depth = 0, end = start;
    for (const tag of block) {
      end = page.indexOf(tag, end) + tag.length;
      depth += tag.startsWith("</") ? -1 : 1;
      if (depth === 0) return reply(200, { html: page.slice(start, end) });
    }
    return reply(422, { error: "The page format could not be read. Paste the stat block from your browser." });
  } catch {
    return reply(422, { error: "D&D Beyond could not be reached. Paste the stat block from your browser." });
  }
});
