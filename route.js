// app/api/coach/route.js
import OpenAI from "openai";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",            // during local testing
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  return Response.json(
    { ok: true, message: "ACM Coach API is alive" },
    { headers: CORS_HEADERS }
  );
}

export async function POST(req) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return Response.json(
      { ok: true, mode: "stub", note: "OpenAI key missing. Add OPENAI_API_KEY to .env.local and restart server." },
      { headers: CORS_HEADERS }
    );
  }

  let body = {};
  try { body = await req.json(); } catch {}
  const { prompt = "", profile = {} } = body;

  // Build a concise system message that respects consented data use
  const system = [
    "You are ACM TA, a concise executive coach for the first 90 days.",
    "Output: 3–5 tight bullets + a short 7-day action list.",
    "Tone: practical, specific, executive-friendly.",
    "Never invent facts about the learner.",
  ].join(" ");

  try {
    const client = new OpenAI({ apiKey: openaiKey });

    // Short, fast model that’s good for coaching bullets
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: [
          "Learner profile (may be partial):",
          JSON.stringify(profile, null, 2),
          "\nPrompt:\n",
          prompt
        ].join("\n") }
      ],
      temperature: 0.5,
      max_tokens: 400
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || "(no content)";
    return Response.json({ ok: true, reply }, { headers: CORS_HEADERS });

  } catch (err) {
    console.error("OpenAI error:", err);
    return Response.json(
      { ok: false, error: "OpenAI request failed." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}