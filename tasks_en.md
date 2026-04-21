# RAG Application with Document Upload and Interactive Chat

In this practice, you will build a **complete RAG (Retrieval-Augmented Generation) application** that allows uploading documents in multiple formats and querying them through an intelligent chat interface. This assignment integrates all concepts seen so far: embeddings, vector search, semantic ranking, and grounded answer generation.

**General objective:**
Develop a functional app that lets users upload documents (PDF, DOCX, PPT, images, etc.), process them automatically into an Azure AI Search index, and ask questions via chat with conversation memory and grounded responses.

**Estimated time:** 2-3 days

**Submission format:**
- GitHub repository with complete source code
- README with detailed architecture explanation
- Demo video (3-5 minutes) showing the app working

**Presentation:**
Students will be selected at random to present their solution to the class, explain technical decisions, and demonstrate the app.

---

## Single Part: End-to-End RAG System Implementation

**Objective:** Build a full RAG application that supports document upload, automatic processing, and chat over indexed content.

### Mandatory Functional Requirements

Your app **must implement** all of the following:

#### 1. Document Upload and Processing

Your system must accept multiple formats:
- PDF
- DOCX (Microsoft Word)
- PPTX (Microsoft PowerPoint)
- Images (PNG, JPG, etc.)
- Any other relevant format you choose

**Required processing:**
- **Chunking:** split documents into suitable chunks
- **Embeddings generation:** vectorize each chunk using Azure OpenAI models
- **Indexing:** store data in Azure AI Search with vector fields and metadata
- **Error handling:** robust handling for corrupted files or unsupported formats

#### 2. Azure AI Search Index

Configure an index including:
- Content fields (text)
- Vector fields (embeddings)
- Relevant metadata (file name, upload date, type, etc.)
- Semantic ranking configuration
- Hybrid search configuration (vector + keyword)

#### 3. RAG Chat

Implement a chat system that:
- **Retrieve:** finds relevant information from the index using hybrid search
- **Augment:** builds enriched prompts with retrieved context
- **Generate:** produces responses using an LLM (GPT-4, GPT-4o, etc.)
- **Grounding:** responses must be grounded in indexed documents
- **Citations:** include references to used sources

#### 4. Conversational Memory

The chat must preserve context across messages:
- Persist conversation history
- Use history to understand follow-up questions
- Let users reset/clear the conversation

#### 5. Frontend and Backend

**Frontend:**
- Streamlit, Gradio, or any simple framework
- Visual design is not graded; functionality is
- Must allow file upload, loaded-document listing, and chat

**Backend:**
- REST API, FastAPI, Flask, or your chosen architecture
- Clear separation of responsibilities
- Error handling and logging

### Important Restrictions

- **Agents are NOT allowed** (no Azure AI Agent Service, no AutoGen/CrewAI, etc.)
- **Architecture is fully open**: choose your own technologies and design

### Deliverable

Your GitHub repository must include:

#### 1. Source Code
- Complete, functional code
- Clear and organized project structure
- Comments in complex code where needed
- `requirements.txt` or `pyproject.toml` with dependencies
- Documented environment variables (`.env.example`)

#### 2. Complete README.md

The README must include:

```markdown
# [Your Application Name]

## Description
[Short project description]

## Architecture
[Diagram or detailed architecture explanation]
- Main components
- Data flow
- Technologies used

## Installation and Setup
[Step-by-step run instructions]

## Design Decisions
[Why you chose specific technologies or approaches]

## Demo Video
[Link to demo video]
```

#### 3. Demo Video (3-5 minutes)

Must show:
- Uploading documents (at least 2 different formats)
- Successful indexing confirmation
- Asking questions in chat
- Grounded responses
- Conversational memory (follow-up questions)
- Citations/source references
- Optional extra features

---

## Extras (Optional - Extra Points)

You have full freedom to extend your app with additional features that demonstrate advanced RAG mastery.

Be creative.

---

## Presentations

Students will be chosen at random to present their solution (10-15 minutes per presentation).

During your presentation you should:
- Explain your architecture and technical decisions
- Run a live demo
- Show relevant code snippets
- Answer class and instructor questions

Prepare to answer:
- Why did you choose this architecture?
- What challenges did you encounter and how did you solve them?
- How did you optimize retrieval?
- What did you learn during the process?

---

## Go Build

This practice lets you build a real RAG application that you can:
- Include in your portfolio
- Show in technical interviews
- Reuse as a base for future projects
- Use to deeply understand production RAG

Good luck and have fun building your RAG app.

---
