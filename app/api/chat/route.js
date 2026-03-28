import { NextResponse } from "next/server";
import { getRenderData } from "@/lib/db";
import { getOpenAIClient } from "@/lib/openai";

const RUN_POLL_MS = 1000;
const RUN_POLL_ATTEMPTS = 30;
const MAX_CONTEXT_CHARS = 180000;
const MIN_ROWS_PER_TABLE = 3;
const START_ROWS_PER_TABLE = 25;
const START_MAX_STRING_CHARS = 500;

function truncateText(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...[truncated]`;
}

function sanitizeValue(value, maxStringChars, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateText(value, maxStringChars);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= 1) {
      return `[array:${value.length}]`;
    }

    return value.slice(0, 5).map((item) => sanitizeValue(item, maxStringChars, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= 1) {
      return truncateText(JSON.stringify(value), maxStringChars);
    }

    const out = {};
    let keyCount = 0;

    for (const [key, item] of Object.entries(value)) {
      if (keyCount >= 30) {
        out.__truncatedKeys = true;
        break;
      }

      out[key] = sanitizeValue(item, maxStringChars, depth + 1);
      keyCount += 1;
    }

    return out;
  }

  return truncateText(String(value), maxStringChars);
}

function buildContextCandidate(dbData, rowsPerTable, maxStringChars) {
  const tableEntries = Object.entries(dbData?.tables ?? {});
  const tables = {};

  for (const [tableName, rows] of tableEntries) {
    const safeRows = Array.isArray(rows) ? rows : [];
    tables[tableName] = safeRows.slice(0, rowsPerTable).map((row) => {
      const safeRow = {};

      for (const [key, value] of Object.entries(row ?? {})) {
        safeRow[key] = sanitizeValue(value, maxStringChars);
      }

      return safeRow;
    });
  }

  return {
    meta: {
      ...(dbData?.meta ?? {}),
      rowsPerTableIncluded: rowsPerTable,
      maxStringCharsIncluded: maxStringChars
    },
    tables
  };
}

function buildFallbackSummary(dbData) {
  const tableEntries = Object.entries(dbData?.tables ?? {});
  const tableSummary = {};

  for (const [tableName, rows] of tableEntries) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const firstRow = safeRows[0] ?? {};

    tableSummary[tableName] = {
      totalRowsFetched: safeRows.length,
      columns: Object.keys(firstRow),
      sampleRows: safeRows.slice(0, 2).map((row) => sanitizeValue(row, 160))
    };
  }

  return {
    meta: {
      ...(dbData?.meta ?? {}),
      contextMode: "fallback-summary"
    },
    tableSummary
  };
}

function buildContextPayload(dbData) {
  let rowsPerTable = START_ROWS_PER_TABLE;
  let maxStringChars = START_MAX_STRING_CHARS;

  for (let i = 0; i < 10; i += 1) {
    const candidate = buildContextCandidate(dbData, rowsPerTable, maxStringChars);
    const payload = JSON.stringify(candidate, null, 2);

    if (payload.length <= MAX_CONTEXT_CHARS) {
      return payload;
    }

    if (rowsPerTable > MIN_ROWS_PER_TABLE) {
      rowsPerTable = Math.max(MIN_ROWS_PER_TABLE, Math.floor(rowsPerTable * 0.65));
      continue;
    }

    if (maxStringChars > 120) {
      maxStringChars = Math.max(120, Math.floor(maxStringChars * 0.65));
      continue;
    }

    break;
  }

  return JSON.stringify(buildFallbackSummary(dbData), null, 2);
}

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

    const contextPayload = buildContextPayload(dbRows);

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
