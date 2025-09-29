# LM Studio Web UI (Gemma 3)

A minimal Node.js web app that streams responses from an LM Studio local server using the OpenAI-compatible API, designed to send an instruction plus an image for recyclable-item analysis.

### Features

- Image + text prompting to a local model, with streamed responses via Server‑Sent Events (SSE).
- Per-visitor session memory using an httpOnly cookie.
- Simple, dependency-light Express backend and static frontend.


### Prerequisites

- Node.js 18+ and npm.
- LM Studio installed on the same machine or reachable over the network.


### Quick start

1. Install LM Studio and launch it.
2. Download a Gemma 3 model in LM Studio’s model browser. For image inputs, ensure a Vision-capable Gemma 3 variant is downloaded. Current model used is "google/gemma-3-4b". Change the model reference accordingly.
3. Start the LM Studio local server (from the Developer tab or CLI) and note the base URL (for example, http://localhost:1234/v1 or http://<LAN-IP>:1234/v1).
4. Open server.js and set LM_BASE to the correct LM Studio base URL if LMStudio isn't running on the same machine:

```js
// server.js
const LM_BASE = "http://<HOST_OR_IP>:<PORT>/v1";
```

```bash
npm install
npm start
```

5. Open the printed address (default http://localhost:3000) and use the UI to submit an image. The IP would be reachable by anyone in the network.

### How it works

- The backend exposes POST /api/chat, which forwards the session’s messages to LM Studio’s OpenAI-compatible /v1/chat/completions endpoint with stream: true.
- Each request includes a fixed instruction that asks the model to describe recyclable items, reuse ideas, and output a compact JSON summary, plus the uploaded image as a data URL.
- Tokens are proxied back to the browser via SSE and appended to the session’s assistant history.


### Static files

- The server serves static assets from ./public by default:

```js
app.use(express.static(path.join(__dirname, "public")));
```

- Place index.html and related assets in ./public or adjust the path in server.js to match the current file layout.


### Troubleshooting

- If the browser cannot reach LM Studio (CORS or network), enable CORS in LM Studio or run both services on the same host during development.
- If streaming fails or responses are empty, verify:
    - LM_BASE matches the LM Studio server’s host, port, and “/v1” path.
    - LM_MODEL is set to a downloaded model and supports the required modalities (Vision for image input).
    - The LM Studio server is running and the selected model is loaded.


### Scripts and dependencies

- Scripts
    - start: node server.js
- Dependencies
    - express
    - cookie-parser


### Project structure

```
.
├─ package.json
├─ server.js
└─ public/             # static assets served from here (create if needed)
    └─ index.html          # move to ./public or update express.static path
```
