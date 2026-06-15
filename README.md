# ◈ AMARI

**A local-first, cyberpunk-terminal webapp for running LLM agents and workflows** — across Claude, Gemini, Kimi, OpenAI, OpenRouter and local Ollama models. One CLI command, one browser tab. Inspired by [opencode](https://github.com/sst/opencode) and pewdiepie's [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus), trimmed down to the part you actually want: a fast agent terminal you fully control.

```
   provider-agnostic  ·  agentic tool loop  ·  works on macOS + Windows  ·  free to host
```

- 🧠 **Bring any model** — Claude (Opus/Sonnet/Haiku), Gemini, Kimi (Moonshot), OpenAI, OpenRouter, or anything you run locally with **Ollama**.
- 🛠️ **Real agent, not just chat** — the agent can read/write files, run shell commands, and search/fetch the web, in a sandboxed workspace.
- 🎭 **Agent modes** — `BUILD` (full access), `PLAN` (read-only), `RESEARCH` (web), `CHAT` (no tools).
- 📄 **Files & documents** — open and read **.xlsx / .docx / .pdf / .csv** in-app (no MS Office needed), **sign PDFs**, and attach files for the agent to read.
- 💸 **Token & cost meter** — per-conversation token usage with an estimated cost.
- 🔵 **Cyberpunk CLI aesthetic** — blue neon, scanlines, monospace, glow.
- 💾 **Local-first** — keys, settings and history live in your browser; the agent's files live on your machine.
- ☁️ **Deployable** — ships to Vercel (or any Node host) for API-only use.

> Keys never leave your machine in local mode. They're stored in your browser's `localStorage` and sent only to your own local server, which proxies them to the provider.

---

## Quick start

Requires **Node.js ≥ 18.18** (Node 20+ recommended). Works with `npm`, `pnpm`, `yarn`, or `bun`.

```bash
git clone https://github.com/Antastik/amari.git
cd amari
npm install
npm run dev
```

Open **http://localhost:3000**, click **⚙ config**, paste an API key for any provider, and start typing.

> Prefer it to open the browser for you? `npm run launch` starts the server and pops it open (port `4173`). For a production build: `npm run build && npm run start`.

---

## Adding model access

Open **⚙ config → api keys**. Keys are saved in your browser. Get them here:

| Provider | What it gives you | Get a key |
|----------|-------------------|-----------|
| **Claude** | Opus 4.8 / Sonnet 4.6 / Haiku 4.5 (adaptive thinking + effort) | <https://console.anthropic.com/settings/keys> |
| **Gemini** | Gemini 2.0 / 1.5 (via Google's OpenAI-compatible endpoint) | <https://aistudio.google.com/apikey> |
| **Kimi (Moonshot)** | Kimi K2, Moonshot v1 | <https://platform.moonshot.ai/console/api-keys> |
| **OpenAI** | GPT-4o / 4.1 / o-series | <https://platform.openai.com/api-keys> |
| **OpenRouter** | One key → hundreds of models | <https://openrouter.ai/keys> |
| **Ollama** | Your **local** models, no key, fully private | [install Ollama](https://ollama.com) |

The model box is a free-text field with suggestions — type any model id the provider supports (e.g. `claude-opus-4-8`, `gpt-4o`, `anthropic/claude-opus-4-8` on OpenRouter).

### Local models with Ollama

1. [Install Ollama](https://ollama.com) and pull a model: `ollama pull qwen2.5-coder`
2. Make sure it's running (`ollama serve`, usually automatic).
3. In Amari pick the **Ollama (local)** provider — your installed models appear automatically.

Tool-calling quality depends on the model; coder/instruct models (e.g. `qwen2.5-coder`, `llama3.1`) handle the agent loop best.

---

## Agent modes & tools

Switch modes from the top bar:

| Mode | System prompt | Default tools |
|------|---------------|---------------|
| **BUILD** | Autonomous coding agent | all (file + shell + web) |
| **PLAN** | Read-only architect | `list_dir`, `read_file`, web |
| **RESEARCH** | Web researcher | `web_search`, `web_fetch`, read/write |
| **CHAT** | Plain assistant | none |

**Tools** (toggle individually in config):

| Tool | Scope |
|------|-------|
| `list_dir`, `read_file`, `write_file`, `edit_file` | workspace files (local only) |
| `read_document` | read xlsx / docx / pdf / csv as text (local only) |
| `run_shell` | shell command, 60s timeout, runs in the workspace (local only) |
| `web_fetch`, `web_search` | the open web (works anywhere) |

### Safety

- File and shell tools are **sandboxed to a workspace directory** (`./workspace` by default; override with `AMARI_WORKSPACE`). Paths that escape it are rejected.
- `run_shell` executes real commands on your machine inside that workspace — only enable BUILD mode on projects you trust, and review what the agent runs.
- Filesystem + shell tools are **automatically disabled** in hosted/serverless environments (Vercel), where only web tools run. Force-disable locally with `AMARI_DISABLE_LOCAL_TOOLS=1`.

---

## Files & documents

Click **▣ files** (top bar) to open any file from disk in the in-app viewer — no Microsoft Office or extra apps required:

| Format | Rendered as |
|--------|-------------|
| `.xlsx` / `.xls` / `.csv` | spreadsheet with sheet tabs |
| `.docx` | formatted document |
| `.pdf` | native PDF view — plus a **✎ sign** button |
| images, `.txt` / `.md` / code / `.json` | inline |

**Signing a PDF:** open it in the viewer → **✎ sign** → draw or type your signature → choose page, position and size → **apply & download** (or save into the workspace). It's a visible signature stamped with [pdf-lib](https://pdf-lib.js.org/) — not a cryptographic/PKI signature.

**Attachments:** in local mode, the 📎 button uploads files into the workspace and tells the agent to read them with its `read_document` tool (which understands spreadsheets, Word docs and PDFs, not just plain text).

## Deploy to Vercel (free)

Amari runs on Vercel out of the box — useful for chatting with API providers from anywhere.

1. Push this repo to your GitHub (already done if you're reading this there).
2. Import it at <https://vercel.com/new>. No build config needed (it's a standard Next.js app).
3. *(Optional)* add provider keys as environment variables (see below) so you don't have to paste them in the browser.

**On Vercel, local models (Ollama) and the file/shell tools are disabled** — serverless functions can't reach your machine. To use local models remotely, run Amari locally and expose it with a tunnel (e.g. `cloudflared`, `ngrok`), or point the Ollama base URL at a reachable host in config.

---

## Configuration (`.env`)

All optional — copy `.env.example` to `.env.local` if you want server-side defaults instead of entering keys in the UI.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `MOONSHOT_API_KEY` / `OPENROUTER_API_KEY` | Server-side provider keys |
| `OLLAMA_BASE_URL` | Ollama OpenAI-compatible endpoint (default `http://localhost:11434/v1`) |
| `AMARI_WORKSPACE` | Directory the agent's file/shell tools operate in (default `./workspace`) |
| `AMARI_DISABLE_LOCAL_TOOLS` | Set to `1` to force-disable filesystem + shell tools |

---

## How it works

```
Browser (cyberpunk terminal UI, localStorage)
   │  POST /api/chat  (provider, model, key, messages, tools)
   ▼
Next.js route (Node runtime)  ── runs the agent loop ──►  SSE stream back to the browser
   │                                  │
   │  provider abstraction            │  tool execution
   ▼                                  ▼
 Claude SDK  /  OpenAI-compatible    read/write/edit/shell (sandboxed)  ·  web fetch/search
 (Anthropic) (OpenAI·Gemini·Kimi·       (only when running locally)
              OpenRouter·Ollama)
```

The agent loop streams the model's output, executes any tool calls it makes, feeds the results back, and repeats until the model is done (capped at 24 steps).

```
app/                  UI (page.tsx) + API routes (chat / env / models)
components/           Message renderer, Settings modal
lib/
  catalog.ts          provider + model metadata (client-safe)
  providers/          anthropic.ts, openai-compat.ts (server-only SDK calls)
  agent/loop.ts       the agentic tool loop
  agent/tools.ts      sandboxed file/shell/web tools
  agent/prompts.ts    agent-mode system prompts
  store.ts            settings + conversations + SSE client
bin/amari.mjs         cross-platform launcher
```

---

## Roadmap

Shipped: multi-format file viewer · PDF signing · agent file attachments · token/cost meter.

Next:
- **MCP server support** — connect Google Drive / Gmail and other [MCP](https://modelcontextprotocol.io) servers (Drive/Gmail need your Google OAuth)
- Saved multi-step **workflows** (chain agents/prompts)
- Vision attachments (send images to multimodal models)

PRs and forks welcome.

## License

MIT © Antastik — see [LICENSE](LICENSE).

<sub>Built with Next.js, React, Tailwind, the Anthropic SDK, and the OpenAI SDK.</sub>
