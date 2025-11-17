// app/api/coach/route.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Watkins / ACM-flavored system prompt
const SYSTEM_PROMPT = `
You are "ACM TA", an executive teaching assistant for Paul Bickford Solutions' Advanced Career Mastery program.

Audience:
- Newly hired Directors, VPs, and senior executives who have just landed a new role.
- They are in their first 90 days and are working through exercises inspired by Michael D. Watkins' "The First 90 Days".

Your job:
- Turn the learner's exercise results, journal entries, and profile into concise, high-signal coaching.
- Help them avoid common transition traps and accelerate their time to the break-even point where they create more value than they consume.

Key principles to weave into your guidance (in your own words):
- Diagnose the type of situation (e.g., startup, turnaround, realignment, sustaining success).
- Accelerate learning about strategy, operations, culture, and key stakeholders.
- Build effective relationships and coalitions, including with boss, peers, and direct reports.
- Achieve a few early wins that are meaningful, visible, and aligned with the business.
- Negotiate success with their boss: clarify expectations, success metrics, and support.
- Keep an eye on the break-even point: when cumulative value created exceeds value consumed.
- Avoid transition traps such as:
  - Sticking with what you know.
  - Falling prey to the action imperative.
  - Setting unrealistic expectations.
  - Trying to do too much.
  - Coming in with "the answer".
  - Engaging in the wrong kinds of learning.
  - Neglecting horizontal relationships.

Style:
- Speak directly to the learner using "you".
- Be concise and practical: respond with 3–6 short bullets or numbered steps.
- Emphasize the next 7–21 days (near-term, actionable moves).
- Tie your advice explicitly to their risk level, context, and role when possible.
- Avoid vague cheerleading; always ground your advice in the details provided.
- When it fits, end with a single journaling question prefixed with "Reflect:".

If information is missing:
- Make reasonable, explicit assumptions, but do NOT fabricate facts.
- You can say what you don't know and suggest what they might clarify with their boss or stakeholders.
`;

// ✅ Simple health check
export async function GET() {
  return Response.json({ ok: true, message: "ACM Coach API is alive" });
}

// ✅ Main coaching endpoint
export async function POST(req) {
  // If the key isn't wired, fall back to a safe stub
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        ok: true,
        mode: "stub",
        reply:
          "ACM TA is not fully connected yet (missing API key). Once your instructor enables the OpenAI key, you'll receive tailored First 90 Days coaching here.",
      },
      { status: 200 }
    );
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    // ignore parse error; keep body as {}
  }

  const { prompt = "", profile = {} } = body;

  // The profile is whatever you saved from index.html (acm_init_v1)
  // We gently pull out what might be useful for context.
  const {
    consents = {},
    personal_site_urls,
    linkedin,
    job_description_text,
    day90_outcomes,
  } = profile || {};

  const contextParts = [];

  if (job_description_text && job_description_text.trim()) {
    contextParts.push(`Job description:\n${job_description_text.trim()}`);
  }

  if (typeof day90_outcomes === "string" && day90_outcomes.trim()) {
    contextParts.push(
      `Learner's stated Day 90 outcomes:\n${day90_outcomes.trim()}`
    );
  }

  if (consents.use_linkedin && linkedin && linkedin.trim()) {
    contextParts.push(
      `LinkedIn (URL or pasted sections):\n${linkedin.trim()}`
    );
  }

  if (consents.use_personal_site && personal_site_urls && personal_site_urls.trim()) {
    contextParts.push(
      `Personal website URL(s):\n${personal_site_urls.trim()}`
    );
  }

  const learnerContext =
    contextParts.join("\n\n") ||
    "No additional profile context was provided beyond this exercise.";

  // The frontend is already sending a short, structured prompt:
  // - TRA total + bucket
  // - Journal text
  // - Or other exercise descriptions
  const userMessage = `
Here is the learner's context:

${learnerContext}

Here is the current exercise summary or request:

${prompt}

Using the principles from "The First 90 Days" and the Advanced Career Mastery program,
give this learner specific, realistic guidance for their first 90 days.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.6,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "ACM TA could not generate a response.";

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
        mode: "error",
        message:
          "ACM TA encountered an error while generating coaching feedback.",
      },
      { status: 500 }
    );
  }
}
