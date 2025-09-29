// server.js
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Allow larger image data URLs after JPEG normalization
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// LM Studio local server (from your logs)
const LM_BASE = "http://localhost:1234/v1";
const MODEL = process.env.LM_MODEL || "google/gemma-3-4b"; // set to the exact Gemma 3 Vision ID

// Per-visitor in-memory sessions
const sessions = new Map(); // sid -> { messages: [] }

function getOrCreateSession(req, res) {
  let sid = req.cookies.sid;
  if (!sid) {
    sid = crypto.randomBytes(16).toString("hex");
    res.cookie("sid", sid, { httpOnly: true, sameSite: "lax" });
  }
  if (!sessions.has(sid)) sessions.set(sid, { messages: [] });
  return { sid, state: sessions.get(sid) };
}

function appendAssistant(state, text) {
  state.messages.push({ role: "assistant", content: text });
}

// Fixed instruction appended for every image request
const INSTRUCTION_TEXT =
  "look for recyclable items in the image provided. if any item is recyclable then first give a writeup about how it can be recycled but stick to methods that can be done at home or its easy. also include ways in which it can be reused if you find the object to be in good condition but again stick to scopes that can be useful around the household or easily accessible places, you can also include ways in which it can be used as items for handicrafts, or similar things that high school children find interesting; give ideas. also if there are multiple objects then you can list their recycle uses one after another. after that just print a json in a specific format like object: plastic; recycle: true, object: aluminium; recycle: true and so on. if the image is out of context just say 'out of context'. dont give me replies that like a markdown, instead keep it to plain text. pls give me the reply in ARABIC.";

app.post("/api/chat", async (req, res) => {
  const { state } = getOrCreateSession(req, res);
  const { imageDataUrl } = req.body || {};

  // Build user content: hidden instruction text + the image
  const content = [
    { type: "text", text: INSTRUCTION_TEXT },
  ];
  if (imageDataUrl) {
    content.push({
      type: "image_url",
      image_url: { url: imageDataUrl }, // data:image/jpeg;base64,...
    });
  }

  // Record only the user message (the UI will display only the image)
  state.messages.push({ role: "user", content });

  // Prepare SSE to client
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Upstream streaming call to LM Studio's OpenAI-compatible Chat Completions
  const upstream = await fetch(`${LM_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: state.messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    res.write(`data: ${JSON.stringify({ error: "Upstream error" })}\n\n`);
    return res.end();
  }

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  let assistantText = "";
  function forward(chunkStr) {
    const frames = chunkStr.split("\n\n");
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        appendAssistant(state, assistantText);
        return "done";
      }
      try {
        const json = JSON.parse(payload);
        const delta =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.message?.content ??
          "";
        if (delta) assistantText += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      } catch {
        res.write(`data: ${JSON.stringify({ raw: payload })}\n\n`);
      }
    }
    return "continue";
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      appendAssistant(state, assistantText);
      break;
    }
    const textChunk = decoder.decode(value, { stream: true });
    if (forward(textChunk) === "done") break;
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web UI on http://localhost:${PORT}`);
});
