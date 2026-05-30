import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { recordCallCost } from "@/lib/ai-cost";

const FIELD_CONTEXT: Record<string, string> = {
  missionStatement: "a nonprofit/business mission statement for grant applications",
  productsServices: "a description of products and services for federal funding applications",
  areasOfExpertise: "a list of areas of expertise and technical capabilities for grant eligibility",
  pastGrantExperience: "a summary of past grant and funding experience for federal applications",
  skills: "a personal skills and qualifications summary for individual grant applications",
  interests: "a description of areas of interest for personal funding and grant opportunities",
};

export async function POST(request: NextRequest) {
  const userId = await requireAuth();

  const { field, value } = await request.json();
  if (!field || !value) {
    return Response.json({ error: "field and value required" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const context = FIELD_CONTEXT[field] || "professional content for a grant application profile";

    const model = "claude-sonnet-4-6";
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Improve and professionalize the following text, which is ${context}. Make it more compelling, clear, and polished while preserving the original meaning and all factual details. Keep approximately the same length — don't add invented details, just improve the writing quality. Return ONLY the improved text, no other commentary.

Original text:
${value}`,
        },
      ],
    });
    await recordCallCost(userId, model, response, "enhance");

    const text = response.content[0].type === "text" ? response.content[0].text : value;
    return Response.json({ enhanced: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Enhancement failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
