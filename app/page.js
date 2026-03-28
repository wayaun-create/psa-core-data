"use client";

import { useState } from "react";

export default function HomePage() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Ask me about your Render data. I will only answer using the database context supplied on the server."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }

    const userMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to fetch assistant response.");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: payload.answer }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="chat-card">
        <header className="chat-header">
          <p className="eyebrow">PSA Core Data</p>
          <h1>Render Database Chat</h1>
          <p>
            Ask questions in plain language. Responses are grounded in your live
            Render query results.
          </p>
        </header>

        <div className="chat-feed" aria-live="polite">
          {messages.map((message, index) => (
            <article
              className={`bubble bubble-${message.role}`}
              key={`${message.role}-${index}`}
            >
              <p className="bubble-role">{message.role}</p>
              <p>{message.content}</p>
            </article>
          ))}
          {loading && (
            <article className="bubble bubble-assistant loading">
              <p className="bubble-role">assistant</p>
              <p>Reading data and thinking...</p>
            </article>
          )}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <label htmlFor="chat-input" className="sr-only">
            Ask about your data
          </label>
          <textarea
            id="chat-input"
            placeholder="Example: Which customer had the most recent order?"
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Working..." : "Send"}
          </button>
        </form>

        {error && <p className="error-banner">{error}</p>}
      </section>
    </main>
  );
}
