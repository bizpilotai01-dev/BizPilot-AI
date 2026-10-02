import { NextResponse } from "next/server";

import { requireWorkspace } from "@/lib/api-auth";

function buildLocalDraft(input: {
  leadName: string;
  company: string;
  status: string;
  value?: number;
  owner?: string;
}) {
  const leadName = input.leadName?.trim() || "there";
  const company = input.company?.trim() || "your business";
  const owner = input.owner?.trim() || "Fidelix";
  const value = Number(input.value ?? 0);
  const valueLabel = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);

  const statusTone =
    input.status === "new"
      ? "introduce our solution and understand your current priorities"
      : input.status === "contacted"
        ? "check in and confirm the right next step"
        : input.status === "qualified"
          ? "move toward a clear next step and a short call"
          : input.status === "proposal"
            ? "confirm the proposal and address any final concerns"
            : "confirm momentum and plan the next milestone";

  return `Hi ${leadName},\n\nI hope you're doing well. I wanted to follow up on ${company} and keep momentum moving on the opportunity. Based on your current situation, the best next step is to ${statusTone}.\n\nI believe we can create practical value here and keep the process simple, focused, and aligned to what matters most to your business. If this still looks like a fit, I’d recommend a short conversation to review the next step together.\n\nThe opportunity is currently valued at ${valueLabel}, and I’d be glad to walk you through the best path forward in a quick, actionable call.\n\nBest regards,\n${owner}\nBizPilot AI`;
}

export async function POST(request: Request) {
  const auth = await requireWorkspace(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));

  const leadName = String(body?.leadName ?? "").trim();
  const company = String(body?.company ?? "").trim();
  const status = String(body?.status ?? "new").trim();
  const owner = String(body?.owner ?? "Fidelix").trim();

  if (!leadName || !company) {
    return NextResponse.json({ error: "leadName and company are required" }, { status: 400 });
  }

  const draftInput = {
    leadName,
    company,
    status,
    value: Number(body?.value ?? 0),
    owner,
  };

  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful sales and customer relationship assistant. Write concise, polished, professional outreach messages for business leads.",
            },
            {
              role: "user",
              content: `Write a short, professional follow-up email for ${leadName} at ${company}. The opportunity is currently in the ${status} stage and is worth ${Number(draftInput.value || 0).toLocaleString("en-NG")} NGN. Keep it warm, concise, persuasive, and suitable for a business owner.`,
            },
          ],
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        const content = payload.choices?.[0]?.message?.content?.trim();
        if (content) {
          return NextResponse.json({ draft: content });
        }
      }
    } catch {
      // Fall back to the local, deterministic template below.
    }
  }

  return NextResponse.json({ draft: buildLocalDraft(draftInput) });
}
