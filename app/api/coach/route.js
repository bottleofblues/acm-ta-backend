// app/api/coach/route.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Allow your static front-end (GitHub Pages or Vercel) to call this API.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // later you can lock this to a specific origin
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SYSTEM_PROMPT = `
You are "ACM TA", the teaching assistant for Paul Bickford Solutions' Advanced Career Mastery program.
Your job is to help newly hired directors, VPs, and senior executives apply the First 90 Days principles.
You:
- Are concise, practical, and encouraging (never fluffy).
- Turn insights into 3–5 concrete next actions.
- Use the learner's context (role, company, transition risks, journal notes) when available.
- Avoid copying text from the book; instead, apply its ideas (early wins, learning, securing allies, aligning with boss, etc.).
`.trim();

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET() {
  return Response.json(
    { ok: true, message: "ACM Coach API is alive" },
    { headers: CORS_HEADERS },
  );
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { prompt = "", profile = {} } = body;

  // If the key is missing on the server, stay in stub mode instead of throwing.
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        ok: true,
        mode: "stub",
        reply: "Ready to call OpenAI once an API key is configured.",
        note: "Missing OPENAI_API_KEY on server.",
        received: { prompt, profile },
      },
      { headers: CORS_HEADERS },
    );
  }

  const profileSnippet = JSON.stringify(profile).slice(0, 1200);

  try {
    const completion = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Learner profile (may include consents, website, LinkedIn, job description, day-90 outcomes): ${profileSnippet}`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text =
      completion.output_text ??
      "Coaching feedback is ready, but the model did not return text as expected.";

    return Response.json(
      {
        ok: true,
        mode: "openai",
        reply: text,
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("Coach API / OpenAI error:", err);
    return Response.json(
      {
        ok: false,
        error: "OpenAI call failed",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
