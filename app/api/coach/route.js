// app/api/coach/route.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Simple CORS helper so the Vercel backend can talk to your Vercel frontend ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// --- Build profile context from the learner’s inputs (welcome page) ---
function buildProfileContext(profile = {}) {
  const parts = [];

  if (profile.name || profile.role || profile.org) {
    parts.push(
      `Learner summary: ${[
        profile.name,
        profile.role,
        profile.org,
      ]
        .filter(Boolean)
        .join(" — ")}`
    );
  }

  if (profile.day90_outcomes) {
    const out =
      Array.isArray(profile.day90_outcomes)
        ? profile.day90_outcomes.join("; ")
        : String(profile.day90_outcomes);
    parts.push(`Stated Day-90 outcomes: ${out}`);
  }

  if (profile.job_description_text) {
    const jd = String(profile.job_description_text).slice(0, 1200);
    parts.push(`Excerpt from job description:\n${jd}`);
  }

  if (profile.linkedin) {
    const li = String(profile.linkedin).slice(0, 800);
    parts.push(`LinkedIn profile text or URL (truncated):\n${li}`);
  }

  if (profile.personal_site_urls) {
    parts.push(`Personal site(s): ${profile.personal_site_urls}`);
  }

  return parts.join("\n\n");
}

// --- Health Check (GET) ---
export async function GET() {
  return json({
    ok: true,
    message: "ACM Coach API is alive",
  });
}

// --- Main Coach (POST) ---
export async function POST(req) {
  // 1) Parse body
  let body = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  const { prompt = "", profile = {} } = body;

  // 2) If no API key, fall back to a safe stub
  if (!process.env.OPENAI_API_KEY) {
    return json(
      {
        ok: true,
        mode: "stub",
        reply:
          "ACM TA is not fully connected right now (missing API key), but here’s a generic nudge: pick 1–2 risks from your assessment, define a small visible win for the next 7 days, and schedule a check-in with your boss to align expectations.",
        received: { prompt, profile },
      },
      { status: 200 }
    );
  }

  // 3) Build contextual coaching prompt
  const profileContext = buildProfileContext(profile);

  const systemPrompt = `
You are "ACM TA", the AI teaching assistant for Paul Bickford Solutions • Advanced Career Mastery.

Audience:
- Newly hired Directors, VPs, and Senior Executives.
- They have completed the foundational Career Mastery program and are now in their first 90 days in a new role.

Foundation:
- Your coaching is explicitly grounded in Michael D. Watkins' *The First 90 Days*.
- Key ideas you may draw from (without name-dropping every time):
  - Break-even point: when cumulative value created exceeds value consumed.
  - Transition Traps: sticking with what you know; falling prey to the action imperative; setting unrealistic expectations; attempting to do too much; coming in with "the answer"; engaging in the wrong type of learning; neglecting horizontal relationships.
  - Learning agenda: mapping people, processes, products/services, and culture in a structured way.
  - Early wins: targeted, visible progress that builds credibility and momentum.
  - STARS situations (start-up, turnaround, realignment, sustaining-success) as a lens for context.
  - Building alliances: boss, direct reports, peers, key stakeholders.

Tone & Style:
- Executive-level, concise, no fluff.
- 3–7 sharp bullets are usually better than paragraphs.
- Translate ideas into *specific, calendar-ready next steps* whenever possible.
- Assume the learner is smart but stretched thin; make your guidance high-signal and immediately usable.

Use of Inputs:
- You will receive:
  - A summary prompt that may include:
    - Transition Risk Index and risk bucket.
    - Journal reflections.
  - A "profile" object that may contain:
    - Day-90 outcomes.
    - Job description text.
    - LinkedIn summary or URL.
    - Personal site URLs.
- Use these to:
  - Tailor examples to their level (Director/VP/SVP/etc.).
  - Tie advice back to their stated Day-90 outcomes.
  - Suggest 7-day, 30-day, and occasionally 60–90 day moves aligned with their context.
- Never fabricate details about the person; only use what is present in the provided data.

Output Format:
- Start with a **1–2 line "Quick Read"** on their situation.
- Then provide **3–5 actionable bullets for the next 7 days**.
- Optionally end with a short **“Watch Outs”** section (1–3 bullets) based on common transition traps.
`.trim();

  const userContent = [
    profileContext && `Context from learner profile:\n${profileContext}`,
    "Coaching request (from the exercise/journal):",
    prompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "ACM TA generated a response, but it was empty. Try asking again with a bit more detail.";

    return json({
      ok: true,
      mode: "openai",
      reply,
    });
  } catch (err) {
    console.error("ACM Coach error:", err);
    return json(
      {
        ok: false,
        mode: "error",
        message: "ACM TA hit an error while generating feedback.",
      },
      { status: 500 }
    );
  }
}
