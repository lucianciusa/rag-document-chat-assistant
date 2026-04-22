# Multi-Assistant RAG Application Architecture & Workflow

At a high level, the system acts as a bridge between **React (Frontend)**, a **Local SQLite Database (Relational Data)**, and **Azure Cloud Services (AI & Vector Storage)**. The "secret sauce" of this application is its strict **Knowledge Base Isolation**—allowing multiple AI personas to exist in the same app without accidentally mixing their knowledge.

Here is the complete step-by-step workflow:

### Phase 1: Assistant Creation (The Persona)
1. **User Action**: You click "New Assistant" on the React frontend, providing a Name, Description, and System Instructions (e.g., "Act as a German Car Mechanic...").
2. **FastAPI Backend**: The frontend sends a `POST /assistants/` request. 
3. **Database Saving**: SQLAlchemy creates a new `Assistant` record with a unique UUID in your local `rag_assistants.db` SQLite database. This UUID becomes the anchor for *everything* related to this assistant.

### Phase 2: Knowledge Ingestion (Uploading Documents)
1. **File Upload**: You select the "Knowledge Base" tab in the UI and upload a PDF, Word file, or Text file.
2. **Text Extraction**: The file hits the backend (`POST /assistants/{id}/documents/`), where open-source Python libraries (like `PyMuPDF` for PDFs or `python-docx` for Word) strip all the raw text out of the file, saving you the high cost of cloud-based OCR parsing.
3. **Chunking**: A LangChain `RecursiveCharacterTextSplitter` chops the massive text into smaller, digestible "chunks" (about 1000 characters each, with a 150-character overlap so sentences don't get cut in half awkwardly).
4. **Vector Embedding**: Each chunk is sent to **Azure OpenAI (`text-embedding-3-small`)**. The AI converts the text block into a mathematical array of 1,536 numbers (a vector). These numbers represent the semantic "meaning" of the text.
5. **Azure AI Search Indexing**: The backend bundles the original text, the file name, the mathematical vector, and—most importantly—the **`assistant_id`**, and pushes it to Azure AI Search. 
6. **Relational Tracking**: Finally, a `Document` record is saved in SQLite so the React frontend knows to display that file name in the UI list.

### Phase 3: Starting a Conversation
1. **Session Creation**: Clicking "New Chat" in the UI sends a request to create a `ChatSession` in SQLite, linked to the active `assistant_id`.
2. **History Loading**: Moving between chats or reloading the browser triggers the frontend to fetch all past `ChatMessages` tied to that session ID from the SQLite database. This gives the user the illusion of persistent "memory."

### Phase 4: The RAG Query Pipeline (Sending a Message)
When you type a message (e.g., "Why is my B58 engine squealing?") and hit enter, the magic happens in a fraction of a second:

1. **User Message Saved**: The backend immediately saves your query into the SQLite `messages` table.
2. **Query Embedding**: Your question is sent to the Azure OpenAI embedding model to be converted into a vector (the same mathematical format as your documents).
3. **Isolated Vector Search (The Core Feature)**:
   The backend asks Azure AI Search to find the top 5 most mathematically similar text chunks to your question. However, it applies a strict **OData Filter**: `filter="assistant_id eq 'YOUR_ASSISTANTS_UUID'"`.
   *Result*: Azure AI Search completely ignores every single document uploaded for the Sneaker assistant, and *only* scans the vectors belonging to the German Car assistant. It uses Hybrid Search (Vector Match + Keyword Match) and Semantic Ranking to return the absolute best 5 paragraphs of information.
4. **Prompt Assembly**: The backend stitches together a massive hidden prompt behind the scenes. It looks like this:
   * **Role: System**: The Assistant's custom instructions ("Act as a mechanics...").
   * **Context Blocks**: The 5 paragraphs retrieved from Azure Search, appended with their file names (e.g., `[bmw_b58_engine_reliability.txt] : The PCV valve tends to tear...`).
   * **Rule Enforcement**: Strict injected logic telling the LLM: *"Answer using ONLY the context blocks above. Cite the file name."*
   * **Chat History**: The last 10 messages of the conversation, pulled from SQLite, so the AI remembers what you were just talking about.
   * **Role: User**: Your actual new question.
5. **Generation**: This massive payload is sent to **Azure OpenAI (`gpt-4o-mini`)**. The model reads the context, synthesizes the answer, and generates the text.
6. **Response saving**: The assistant's reply, along with a JSON-stringified list of the citations (the files it used), is saved as an AI `ChatMessage` in SQLite.
7. **UI Update**: The frontend receives the reply and renders the shiny chat bubble along with the small "Grounded Sources" citation pills at the bottom.

---

### Where does the data actually live?
* **Local SQLite App Database**: Stores the "Architecture" (Who are the assistants? What are the chat histories? What are the names of the uploaded documents?).
* **Azure AI Search**: Stores the "Knowledge" (The heavy text chunks and the 1536-dimensional mathematical vectors used for semantic searching).
* **Azure OpenAI**: Stores *nothing*. It is a stateless brain that just processes text and vectors on the fly when requested.

Because of this specific architecture, the app is blazing fast, structurally highly scalable (you could have 1,000 users with different assistants), and runs at a fraction of the cost of standard enterprise RAG deployments.