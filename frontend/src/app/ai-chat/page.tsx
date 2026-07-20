"use client";

import { useState, useRef, useEffect } from "react";
import { useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AiChatPage() {
  const apiFetch = useApiFetch();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const send = async () => {
    const text = message.trim();
    if (!text || loading) return;

    setMessage("");
    setError("");
    setHistory((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await apiFetch("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        setHistory((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        const err = await res.json();
        setError(err.message ?? "Request failed");
      }
    } catch {
      setError("Network error. Make sure the backend is running and OpenRouter API key is configured.");
    }

    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AI Chat Demo</h1>
        <p className="text-sm text-gray-500">
          Test the OpenRouter connection. Uses <code className="bg-gray-100 px-1 rounded">deepseek/deepseek-chat:free</code>.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
      )}

      <div className="border rounded-lg p-4 space-y-3 min-h-[300px] max-h-[500px] overflow-y-auto bg-gray-50">
        {history.length === 0 && !loading && (
          <div className="text-center text-gray-400 py-12">
            Type a message to test the AI connection
          </div>
        )}

        {history.map((entry, i) => (
          <div
            key={i}
            className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                entry.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border text-gray-800"
              }`}
            >
              {entry.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-lg px-3 py-2 text-sm text-gray-400 animate-pulse">
              Thinking...
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask anything to test OpenRouter..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          disabled={loading}
        />
        <Button onClick={send} disabled={loading || !message.trim()}>
          {loading ? "..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
