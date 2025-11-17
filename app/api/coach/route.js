// app/api/coach/route.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Helper: truncate long text so prompts stay manageable ---
function truncate(text, max = 1200) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + " …[truncated]";
}

// --- Helper: build a compact profile snapshot for the model ---
function buildProfileSnapshot(profile = {}) {
  const {
    name,
    email,
    role,
    org,
    personal_site_urls,
    linkedin,
    job_description_text,
    day90_outcomes,
    consents = {},
  } = profile;

  const lines = [];

  if (name || role || org) {
    lines.push(
      `Learner: ${name || "Unknown"}${role ? ` | Role: ${role}` : ""}${
        org ? ` | Org: ${org}` : ""
      }`
    );
  }

  if (day90_outcomes && day90_outcomes.trim()) {
    lines.push(`Day 90 outcomes (learner’s words): ${day90_outcomes.trim()}`);
  }

  // Only include LinkedIn / website text if the learner has consented and provided something.
  if (consents.use_personal_site && personal_site_urls) {
    lines.push(`Personal site URLs (for context only, do NOT fetch): ${personal_site_urls}`);
  }

  if (consents.use_linkedin && linkedin) {
    lines.push(`LinkedIn content (URL or pasted sections): ${truncate(linkedin, 800)}`);
  }

  if (consents.store_job_description && job_description_text) {
    lines.push(
      `Job description excerpt: ${truncate(job_description_text, 800)}`
    );
  }

  if (!lines.length) {
    lines.push("Profile: minimal information provided.");
  }

  return lines.join("\n");
}

// --- System prompt tuned for Watkins + ACM ---
// This is the “personality” of the TA for ALL requests.
const BASE_SYSTEM_PROMPT = `
You are "ACM TA", the teaching assistant and executive coach for
Paul Bickford Solutions • Advanced Career Mastery (ACM).

Audience:
- Newly hired Directors, VPs, and senior executives in their first 90 days.
- They have completed the initial Career Mastery program and are now in
  the Advanced Career Mastery program.

Core frameworks:
- Michael D. Watkins, *The First 90 Days*.
- Focus on: accelerate learning, match strategy to situation,
  build early alliances, secure early wins, negotiate success with the boss,
  and avoid transition traps.

When giving feedback:
- Be concise, high-signal, executive-friendly.
- Use 3–6 bullets, each starting with a strong verb.
- When relevant, weave in Watkins language such as:
  - break-even point (value created vs. value consumed)
  - learning agenda and first 30/60/90 days
  - early wins and credibility
  - alliance-building and stakeholder mapping
  - negotiating success and expectations with the boss
  - transition traps:
      • sticking with what you know
      • falling prey to the action imperative
      • setting unrealistic expectations
      • attempting to do too much
      • coming in with "the answer"
      • engaging in the wrong type of learning
      • neglecting horizontal relationships

Tone:
- Direct but supportive.
- Assume the learner is capable and busy.
- Avoid generic platitudes; be specific and practical.

Constraints:
- ONLY use information that is provided in the prompt and profile snapshot.
- Do NOT invent company details, people’s names, or strategies not grounded
  in what is given.
- Do NOT mention that you are an AI model or that OpenAI is involved.
`.trim();

// --- Simple GET: health check used by curl sanity tests ---
export async function GET() {
  return Response.json({
    ok: true,
    message: "ACM Coach API is alive",
  });
}

// --- POST: main coaching endpoint ---
export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch (_) {
    // If body is not valid JSON, return 400.
    return Response.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    prompt = "",
    profile = {},
    meta = {}, // optional: { exerciseId, riskIndex, bucket, etc. }
  } = body;

  if (!prompt || typeof prompt !== "string") {
    return Response.json(
      { ok: false, error: "Missing or invalid 'prompt' field" },
      { status: 400 }
    );
  }

  // If key is missing, stay graceful and return a stub (you already saw this earlier).
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({
      ok: true,
      mode: "stub",
      reply:
        "OpenAI key is not configured yet, so I can’t generate tailored guidance. Please ask your program administrator to add OPENAI_API_KEY in the backend.",
      received: { prompt, profile, meta },
    });
  }

  const profileSnapshot = buildProfileSnapshot(profile);

  // Build messages for the model:
  const messages = [
    {
      role: "system",
      content: BASE_SYSTEM_PROMPT,
    },
    {
      role: "system",
      content: `Profile snapshot (for context):\n${profileSnapshot}`,
    },
    meta && Object.keys(meta).length
      ? {
          role: "system",
          content: `Exercise context: ${JSON.stringify(meta)}`,
        }
      : null,
    {
      role: "user",
      content: prompt,
    },
  ].filter(Boolean);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.6,
      max_tokens: 500,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I’m having trouble formulating a response right now.";

    return Response.json({
      ok: true,
      mode: "openai",
      reply,
    });
  } catch (err) {
    console.error("ACM Coach API error:", err);
    return Response.json(
      {
        ok: false,
        error: "Coach service failed to respond.",
      },
      { status: 500 }
    );
  }
}
