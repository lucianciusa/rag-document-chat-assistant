# Multi-Assistant RAG Application — Architecture & Workflow

## Overview

**Lincite** is a multi-tenant RAG (Retrieval-Augmented Generation) platform where each AI assistant owns an isolated knowledge base. The system connects a **React/TypeScript SPA**, an **Azure SQL relational database**, **Azure Blob Storage**, and **Azure AI cloud services** (Search, OpenAI). Knowledge Base Isolation is the core invariant — documents uploaded for one assistant are never surfaced when querying another.

---

## Technology Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS v3 with dual Pantone palette (CSS custom properties) |
| i18n | Custom key-value store with EN / ES locale files |
| HTTP | Native `fetch` API with streaming (`ReadableStream` / Server-Sent Events) |
| Markdown | `react-markdown` + `remark-gfm` |
| Icons | `lucide-react` |

The Tailwind configuration maps `slate-*` and `primary-*` to CSS custom properties defined in `index.css`. `:root` holds a cool Cerulean blue-gray palette (light mode); `.dark` holds a warm greige palette (dark mode). RGB channel format (`rgb(var(--slate-N) / <alpha-value>)`) preserves Tailwind opacity modifier support across both themes.

### Backend
| Layer | Technology |
|---|---|
| Runtime | Python 3.14 |
| Web framework | FastAPI |
| ORM | SQLAlchemy 2 |
| Database driver | `pymssql` (pure Python — no ODBC system driver required) |
| File parsing | `PyMuPDF` (PDF), `python-docx` (DOCX), `python-pptx` (PPTX), plain-text (TXT / MD / CSV), `Pillow` + `pytesseract` (image OCR) |
| Text splitting | LangChain `RecursiveCharacterTextSplitter` (chunk size 1 000, overlap 150) |
| Streaming | FastAPI `StreamingResponse` with Server-Sent Events |
| HTTP client | `httpx` (for downloading AI-generated avatar images) |

All API routes are registered on an `APIRouter(prefix="/api")`, then included in the `app` before the SPA catch-all route (`GET /{full_path:path}` → `frontend/dist/index.html`).

### Cloud Services
| Service | Role |
|---|---|
| Azure SQL Database | Relational data: assistants, documents, sessions, messages |
| Azure Blob Storage | Binary file storage: uploaded documents, assistant avatars |
| Azure AI Search | Vector + hybrid search index, filtered by `assistant_id` |
| Azure OpenAI `text-embedding-3-small` | Converts text chunks and queries into 1 536-dim vectors |
| Azure OpenAI `gpt-4o-mini` | Streaming chat completion and answer generation (temp 0.2, max 800 tokens) |
| Azure OpenAI `gpt-image-2` | AI avatar generation (prompt-based, async, stores result in Blob Storage) |

### Deployment
| Component | Platform |
|---|---|
| Backend + Frontend (SPA) | Azure App Service (Linux, Python 3.14) |
| CI/CD | GitHub Actions (`main_lincite.yml`) |

The GitHub Actions workflow (triggered on push to `main`) builds the React frontend (`npm ci && npm run build` with Node 20), installs Python dependencies into a venv, and uploads the full artifact — including `frontend/dist` — to Azure App Service via OIDC federated credentials (no stored secrets). The App Service Oryx build engine activates the venv on deployment and starts Uvicorn. FastAPI serves the compiled SPA via `StaticFiles` and handles deep-link routing with the catch-all route.

**Local fallbacks**: when Azure env vars are absent, the app falls back to local SQLite (database) and a local `uploads/` directory (blob storage) for development without cloud credentials.

---

## Data Model (Azure SQL)

```
Assistant
  id           String(36)  PK  (UUID)
  name         String(255)
  description  String(500)  nullable
  instructions Text
  image_url    String(500)  nullable  (Blob Storage path via /api/avatars/{filename})
  sort_order   Integer      default 0
  pinned       Integer      default 0  (0 = unpinned, 1 = pinned)
  created_at   DateTime

Document
  id           String(36)  PK  (UUID)
  assistant_id String(36)  FK → Assistant  (cascade delete)
  filename     String(255)
  uploaded_at  DateTime

ChatSession
  id           String(36)  PK  (UUID)
  assistant_id String(36)  FK → Assistant  (cascade delete)
  title        String(255)  default "New Chat"
  created_at   DateTime
  updated_at   DateTime

ChatMessage
  id           Integer  PK  autoincrement
  session_id   String(36)  FK → ChatSession  (cascade delete)
  role         String(20)  ("user" | "assistant")
  content      Text
  citations    Text  nullable  (JSON array of "filename#i" citation keys)
  feedback     Integer  nullable  (-1 = not helpful, 1 = helpful)
  context      Text  nullable  (JSON array of raw context blocks used to generate the answer)
  created_at   DateTime
```

---

## Feature Workflows

### 1 · Assistant Creation Wizard

A 5-step wizard (Basics → Instructions → Avatar → Knowledge → Review) collects:
- Name (required) and description
- System instructions — chosen from 6 preset templates or written freely; instruction snippets can be inserted to add behavioural modifiers
- Optional avatar image upload
- Initial documents for the knowledge base

`POST /api/assistants/` persists the `Assistant` record. Documents uploaded during the wizard are indexed immediately. The wizard UI and all template/snippet labels are fully localised (EN/ES).

### 2 · Knowledge Ingestion (Document Upload)

`POST /api/assistants/{id}/documents/` pipeline:

1. **Text extraction** via `processors.py`:
   - PDF → `PyMuPDF`
   - DOCX → `python-docx`
   - PPTX → `python-pptx`
   - TXT / MD / CSV → plain-text read
   - PNG / JPG / BMP → `Pillow` + `pytesseract` (local OCR, no cloud cost)
2. **Chunking** — `RecursiveCharacterTextSplitter` (1 000 chars, 150 overlap)
3. **Embedding** — each chunk → `text-embedding-3-small` → 1 536-dim float vector
4. **Indexing** — chunk text + vector + `assistant_id` + `filename` pushed to Azure AI Search
5. **Blob upload** — raw file stored in Azure Blob Storage
6. **DB record** — `Document` row saved in Azure SQL

### 3 · RAG Query Pipeline (Streaming Chat)

`POST /api/sessions/{id}/chat/stream` streams the reply token-by-token as Server-Sent Events:

1. **Save user message** → Azure SQL
2. **Embed query** → `text-embedding-3-small`
3. **Hybrid search** → Azure AI Search with:
   - OData filter: `assistant_id eq '{UUID}'`
   - Vector query: HNSW kNN (k=10) on `contentVector`
   - Full-text query on `content` field (Lucene analyser)
   - Semantic re-ranking: `default-semantic-config` (prioritises `content`, title from `filename`)
   - Returns top 10 ranked chunks
4. **Context blocks** assembled as:
   ```
   [filename.pdf#0]: chunk text…
   [filename.pdf#1]: another chunk…
   ```
5. **Prompt construction**:
   - `system`: assistant's custom instructions + injected rules
   - Chat history (last N turns from Azure SQL)
   - `user`: current message
6. **Stream completion** → `gpt-4o-mini` (temperature 0.2, max 800 tokens, `stream=True`); tokens forwarded via `StreamingResponse`
7. **Citation extraction** — regex finds all `[…]` references in the full reply; resolves both granular (`filename#i`) and base-filename citations
8. **Save assistant message** (full text + JSON citations + JSON context blocks) → Azure SQL

#### Grounded Source Snippet Preview

Clicking a citation pill extracts the relevant passage directly from the context blocks already present in the message (format: `[filename#i]: text` — the text is everything after `]: `). This shows only the cited chunk without a network request. Falls back to fetching the full document from Blob Storage if no context is cached.

### 4 · Conversation Management

- **Sessions**: multiple named chats per assistant; rename and delete supported
- **Branching**: fork any conversation at any message into a new session
- **Regeneration**: re-send the last user turn as a new streaming request
- **Feedback**: thumbs-up / thumbs-down stored as `+1` / `-1` in `ChatMessage.feedback`
- **Export**: download conversation as `.md` or `.pdf`
- **Search**: in-conversation full-text search (client-side)

### 5 · Avatar Generation

`POST /api/assistants/{id}/avatar/generate` calls `gpt-image-2` on Azure OpenAI:

- Prompt built from assistant name + description (up to 60 chars)
- Model-aware parameter selection via `_image_call_params()`:
  - `gpt-image-2`: `quality="low"`, `output_format="jpeg"`, `output_compression=75` (via `extra_body`)
  - `dall-e-3`: size 1024×1024, quality standard, style vivid
  - `dall-e-2`: size 512×512
- Response handled as URL (downloaded via `httpx`) or base64 JSON
- Image stored in Azure Blob Storage; `Assistant.image_url` updated

A frontend progress modal lets the user wait, continue generation in the background, or cancel.

### 6 · Export / Import (ZIP)

**Export** (`GET /api/assistants/{id}/export`): streams a `.zip` containing:
```
manifest.json          ← name, description, instructions, document list
documents/             ← all raw files from Blob Storage
avatar/                ← avatar image (if set)
```

**Import** (`POST /api/assistants/import`): accepts the same `.zip`, recreates the assistant, re-indexes all documents, restores the avatar.

---

## API Surface

All routes prefixed `/api/`. Key groups:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/assistants/` | List all assistants |
| POST | `/api/assistants/` | Create assistant |
| PUT | `/api/assistants/{id}` | Update assistant |
| DELETE | `/api/assistants/{id}` | Delete assistant + KB + sessions |
| POST | `/api/assistants/{id}/clone` | Clone assistant |
| GET | `/api/assistants/{id}/export` | Export ZIP |
| POST | `/api/assistants/import` | Import ZIP |
| POST | `/api/assistants/{id}/avatar/generate` | Generate avatar via AI |
| POST | `/api/assistants/{id}/avatar/upload` | Upload avatar image |
| DELETE | `/api/avatars/{filename}` | Delete avatar blob |
| GET | `/api/avatars/{filename}` | Serve avatar image |
| GET | `/api/assistants/{id}/documents/` | List documents |
| POST | `/api/assistants/{id}/documents/` | Upload + index documents |
| DELETE | `/api/documents/{doc_id}` | Delete document |
| GET | `/api/assistants/{id}/documents/{doc_id}/preview` | Fetch document content |
| GET | `/api/assistants/{id}/sessions/` | List chat sessions |
| POST | `/api/assistants/{id}/sessions/` | Create session |
| PUT | `/api/sessions/{id}` | Rename session |
| DELETE | `/api/sessions/{id}` | Delete session |
| GET | `/api/sessions/{id}/messages/` | Get message history |
| POST | `/api/sessions/{id}/chat/stream` | Stream chat response (SSE) |
| POST | `/api/sessions/{id}/regenerate/stream` | Stream regenerated reply (SSE) |
| POST | `/api/sessions/{id}/branch` | Branch conversation at a message |
| PATCH | `/api/messages/{id}/feedback` | Save message feedback (+1 / -1) |
| GET | `/api/stats/` | Homepage stats (assistant / doc / session counts) |

---

## Where Data Lives

| Data | Store |
|---|---|
| Assistants, sessions, messages, document metadata | Azure SQL Database |
| Raw uploaded files, exported ZIPs, avatar images | Azure Blob Storage |
| Text chunks + 1 536-dim embedding vectors | Azure AI Search |
| LLM inference, embedding API, image generation | Azure OpenAI (stateless) |
| Compiled frontend (HTML/JS/CSS) | Served from `frontend/dist` by FastAPI StaticFiles |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `AZURE_OPENAI_API_KEY` | Azure OpenAI auth key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_VERSION` | API version (e.g. `2024-02-15-preview`) |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Chat model deployment name (e.g. `gpt-4o-mini`) |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Embedding model deployment name (e.g. `text-embedding-3-small`) |
| `AZURE_OPENAI_IMAGE_DEPLOYMENT` | Image generation deployment name (e.g. `gpt-image-2`) |
| `AZURE_SEARCH_SERVICE_ENDPOINT` | Azure AI Search endpoint URL |
| `AZURE_SEARCH_ADMIN_KEY` | Azure AI Search admin key |
| `AZURE_SEARCH_INDEX_NAME` | Search index name |
| `AZURE_SQL_CONNECTION_STRING` | Azure SQL connection string (ODBC format or `mssql+pymssql://` URL); omit to use local SQLite |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string; omit to use local `uploads/` |
| `AZURE_STORAGE_DOCUMENTS_CONTAINER` | Blob container for documents (default: `documents`) |
| `AZURE_STORAGE_AVATARS_CONTAINER` | Blob container for avatars (default: `avatars`) |

---

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # Vite dev server :3000, proxies /api/* → :8000
```

The Vite proxy forwards `/api/*` as-is (no path rewriting) to match the backend's `/api` prefix.

---

## Deployment (GitHub Actions → Azure App Service)

1. Push to `main` triggers `main_lincite.yml`
2. Node 20 installed; `npm ci && npm run build` compiles the React SPA into `frontend/dist`
3. Python 3.14 installed; `pip install -r requirements.txt` into `antenv` venv
4. Artifact uploaded (includes `frontend/dist`, excludes `antenv/`)
5. OIDC login to Azure using federated credentials (no stored secrets)
6. `azure/webapps-deploy@v3` deploys to App Service slot `Production` (app name: `lincite`)
7. Oryx build engine activates the venv on the server and starts Uvicorn
8. FastAPI mounts `frontend/dist` as static files and serves `index.html` for all unmatched routes

---

## Data Reset

`scripts/reset_data.py` — wipes all Azure SQL rows, Azure AI Search vectors, and Blob Storage files. Run from project root with the venv active:

```bash
python scripts/reset_data.py
```
