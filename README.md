# Azure RAG Chat Assistant

## Description
This is an end-to-end RAG (Retrieval-Augmented Generation) application allowing users to upload documents (PDF, DOCX, PPTX, Images) and chat about their content. The solution intelligently processes the documents, indexes them into Azure AI Search, and employs Azure OpenAI (gpt-4o-mini) to generate grounded, context-aware responses while preserving conversational memory. 

The architecture focuses on being highly economic by using open-source parsing libraries (PyMuPDF, python-docx, pytesseract) to avoid proprietary OCR extraction costs, while leveraging the cheapest, most efficient Azure Tiers for searching and generating.

## Architecture
- **Frontend**: A modern, responsive React Single Page Application built with Vite and Tailwind CSS. It supports a multi-assistant layout (dashboard, tabs, active session switching, and modal creation).
- **Backend (FastAPI)**: Manages multi-assistant environments, session histories, and coordinates chunking & embedding workflows dynamically.
- **Relational DB (SQLite & SQLAlchemy)**: Manages User generated Assistants, Document references to specific assistants, and Chat Session Memory logs sequentially.
- **Data & AI Layer**:
  - *Compute*: Azure Container Apps or Azure App Service (Free/B1 Tier) for backend & frontend.
  - *Storage*: Azure Blob Storage (Optional, Hot tier) for persisting un-parsed files.
  - *Vector & Search Database*: Azure AI Search (Basic tier, with semantic ranker).
  - *LLM & Embeddings*: Azure OpenAI Service (`gpt-4o-mini` for chat generation, `text-embedding-3-small` for vector generation).

## Design Decisions
- **Cost Minimization**: Substituted Azure Document Intelligence with optimized Python open-source tools (PyMuPDF, Pytesseract, python-docx, python-pptx) to eliminate per-page parsing costs.
- **Model Efficiency**: Uses `gpt-4o-mini` for chat generation combined with `text-embedding-3-small`.
- **Absolute RAG Isolation**: Configured an Azure Search pipeline that pushes documents labeled with UUIDs. When a user chats with Assistant A, the backend injects an OData filter `assistant_id eq 'Assistant A'` into Azure AI Search—ensuring zero cross-contamination of knowledge bases.
- **Session DB**: Uses SQLite via FastAPI SQLAlchemy injection to persist user-prompt interactions continuously.

## Prerequisites
- Node.js 18+ (for frontend)
- Python 3.10+
- Tesseract-OCR installed on the system (for image processing)

## Installation and Setup
### 1. Backend (FastAPI)
1. Clone the repository and navigate to the folder.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and fill in your Azure AI Search and Azure OpenAI secrets.
4. Run the FastAPI Backend:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

### 2. Frontend (React/Vite)
1. Navigate to the `frontend` folder.
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server (configured to proxy `api/*` calls to the python backend):
   ```bash
   npm run dev
   ```
4. Follow the local host link provided by Vite (e.g. http://localhost:3000) to chat!
