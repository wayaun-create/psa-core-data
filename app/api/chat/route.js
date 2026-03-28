import { NextResponse } from "next/server";
import { getRenderData } from "@/lib/db";
import { getOpenAIClient } from "@/lib/openai";

const RUN_POLL_MS = 1000;
const RUN_POLL_ATTEMPTS = 30;

function extractAssistantText(messages) {
  const assistantMessage = messages.data.find((msg) => msg.role === "assistant");

  if (!assistantMessage) {
    return "I could not generate a response.";
  }

  const textParts = assistantMessage.content
    .filter((content) => content.type === "text")
    .map((content) => content.text?.value ?? "")
    .join("\n")
    .trim();

  return textParts || "I could not generate a response.";
}

async function waitForRunCompletion(openai, threadId, runId) {
  for (let i = 0; i < RUN_POLL_ATTEMPTS; i += 1) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);

    if (run.status === "completed") {
      return run;
    }

    if (["failed", "cancelled", "expired"].includes(run.status)) {
      throw new Error(`Assistant run ended with status: ${run.status}`);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, RUN_POLL_MS);
    });
  }

  throw new Error("Assistant run timed out.");
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_ASSISTANT_ID) {
      throw new Error("Missing OPENAI_ASSISTANT_ID environment variable.");
    }

    const body = await request.json();
    const userMessage = body?.message?.trim();

    if (!userMessage) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    const [dbRows, openai] = await Promise.all([
      getRenderData(),
      Promise.resolve(getOpenAIClient())
    ]);

    const thread = await openai.beta.threads.create();

    const contextPayload = JSON.stringify(dbRows, null, 2);

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: [
        "Use ONLY the database context below for facts.",
        "If information is missing, state that clearly.",
        "",
        "DATABASE_CONTEXT_JSON:",
        contextPayload,
        "",
        `USER_QUESTION: ${userMessage}`
      ].join("\n")
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID
    });

    await waitForRunCompletion(openai, thread.id, run.id);

    const messages = await openai.beta.threads.messages.list(thread.id, {
      order: "desc",
      limit: 10
    });

    const answer = extractAssistantText(messages);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("/api/chat error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error."
      },
      { status: 500 }
    );
  }
}
