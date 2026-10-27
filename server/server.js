import express from "express";

const app = express();

const PORT = 3001;
const OLLAMA_URL = "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    model: MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "A non-empty messages array is required."
    });
  }

  const cleanMessages = messages
    .filter(
      (message) =>
        message &&
        ["user", "assistant", "system"].includes(message.role) &&
        typeof message.content === "string"
    )
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

  if (cleanMessages.length === 0) {
    return res.status(400).json({
      error: "No valid messages were provided."
    });
  }

  try {
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: cleanMessages,
        stream: true
      })
    });

    if (!ollamaResponse.ok || !ollamaResponse.body) {
      const details = await ollamaResponse.text();

      return res.status(502).json({
        error: `Ollama request failed: ${details || ollamaResponse.statusText}`
      });
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of ollamaResponse.body) {
      if (res.destroyed) {
        break;
      }

      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error("Chat error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error:
          "Could not connect to Ollama. Make sure Ollama is installed and running."
      });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Chat server running at http://127.0.0.1:${PORT}`);
  console.log(`Using Ollama model: ${MODEL}`);
});
