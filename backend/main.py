import os
import shutil
import json
import uuid
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, FileResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect as sa_inspect
from dotenv import load_dotenv
from openai import AzureOpenAI

load_dotenv()

from backend.search_manager import SearchManager
from backend.chat_manager import ChatManager
from backend.processors import parse_document
from backend.blob_storage import BlobStorageManager
from backend.database import engine, Base, get_db, Assistant, Document, ChatSession, ChatMessage

Base.metadata.create_all(bind=engine)

# Migrate existing databases: add new columns if missing
def migrate_db():
    from sqlalchemy import text
    is_azure = bool(os.getenv("AZURE_SQL_CONNECTION_STRING"))

    if is_azure:
        # T-SQL: check sys.columns and conditionally ALTER TABLE
        migrations = [
            # (table, column, T-SQL type)
            ("assistants", "image_url",   "NVARCHAR(500)"),
            ("assistants", "sort_order",  "INT NOT NULL DEFAULT 0"),
            ("assistants", "pinned",      "INT NOT NULL DEFAULT 0"),
            ("messages",   "feedback",    "INT NULL"),
        ]
        with engine.begin() as conn:
            for table, col, col_type in migrations:
                result = conn.execute(text(
                    f"SELECT COUNT(*) FROM sys.columns "
                    f"WHERE object_id = OBJECT_ID('{table}') AND name = '{col}'"
                ))
                if result.scalar() == 0:
                    conn.execute(text(f"ALTER TABLE {table} ADD {col} {col_type}"))
                    print(f"[Migrate] Added column {table}.{col}")
    else:
        # SQLite
        inspector = sa_inspect(engine)
        asst_cols = [col['name'] for col in inspector.get_columns('assistants')]
        with engine.begin() as conn:
            if 'image_url' not in asst_cols:
                conn.execute(text("ALTER TABLE assistants ADD COLUMN image_url VARCHAR"))
            if 'sort_order' not in asst_cols:
                conn.execute(text("ALTER TABLE assistants ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))
            if 'pinned' not in asst_cols:
                conn.execute(text("ALTER TABLE assistants ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"))

        msg_cols = [col['name'] for col in inspector.get_columns('messages')]
        with engine.begin() as conn:
            if 'feedback' not in msg_cols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN feedback INTEGER"))

try:
    migrate_db()
except Exception as e:
    print(f"[Migrate] Warning: {e}")  # Table may not exist yet on first run


app = FastAPI(title="Multi-Assistant RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize storage and services
storage = BlobStorageManager()
search_manager = SearchManager()
chat_manager = ChatManager(search_manager)

# Static file serving for avatars (local mode only)
if storage.mode == "local":
    os.makedirs("uploads/avatars", exist_ok=True)
    app.mount("/avatars", StaticFiles(directory="uploads/avatars"), name="avatars")

# Image generation client (optional)
image_client = None
image_deployment = os.getenv("AZURE_OPENAI_IMAGE_DEPLOYMENT")
if os.getenv("AZURE_OPENAI_API_KEY") and image_deployment:
    image_client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
    )

@app.on_event("startup")
async def startup_event():
    search_manager.initialize_index()
    if storage.mode == "local":
        os.makedirs("uploads", exist_ok=True)
        os.makedirs("uploads/avatars", exist_ok=True)

@app.post("/assistants/")
async def create_assistant(
    name: str = Form(...),
    instructions: str = Form(...),
    description: str = Form(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    next_order = (db.query(func.coalesce(func.max(Assistant.sort_order), 0)).scalar() or 0) + 1
    assistant = Assistant(name=name, instructions=instructions, description=description, sort_order=next_order)
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    
    # Handle optional image upload
    if image and image.filename:
        ext = os.path.splitext(image.filename)[1] or '.png'
        avatar_filename = f"{assistant.id}{ext}"
        avatar_url = storage.upload_avatar_from_file(avatar_filename, image)
        assistant.image_url = avatar_url
        db.commit()
        db.refresh(assistant)
    
    return assistant

@app.get("/assistants/")
def list_assistants(db: Session = Depends(get_db)):
    return db.query(Assistant).order_by(Assistant.pinned.desc(), Assistant.sort_order.asc(), Assistant.created_at.asc()).all()

@app.put("/assistants/{assistant_id}")
async def update_assistant(
    assistant_id: str,
    name: str = Form(...),
    instructions: str = Form(...),
    description: str = Form(None),
    image: UploadFile = File(None),
    remove_image: str = Form(None),
    db: Session = Depends(get_db)
):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    assistant.name = name
    assistant.instructions = instructions
    assistant.description = description
    
    # Handle image removal
    if remove_image == 'true':
        if assistant.image_url:
            old_filename = os.path.basename(assistant.image_url)
            storage.delete_avatar(old_filename)
        assistant.image_url = None
    
    # Handle new image upload
    if image and image.filename:
        # Remove old image if exists
        if assistant.image_url:
            old_filename = os.path.basename(assistant.image_url)
            storage.delete_avatar(old_filename)
        ext = os.path.splitext(image.filename)[1] or '.png'
        import time
        avatar_filename = f"{assistant_id}_{int(time.time())}{ext}"
        avatar_url = storage.upload_avatar_from_file(avatar_filename, image)
        assistant.image_url = avatar_url
    
    db.commit()
    db.refresh(assistant)
    return assistant

@app.post("/assistants/{assistant_id}/avatar/upload")
def upload_avatar(
    assistant_id: str,
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    
    # Remove old avatar if exists
    if assistant.image_url:
        old_filename = os.path.basename(assistant.image_url)
        storage.delete_avatar(old_filename)
    
    ext = os.path.splitext(image.filename)[1] or '.png'
    import time
    avatar_filename = f"{assistant_id}_{int(time.time())}{ext}"
    avatar_url = storage.upload_avatar_from_file(avatar_filename, image)
    
    assistant.image_url = avatar_url
    db.commit()
    db.refresh(assistant)
    return {"image_url": assistant.image_url}

@app.post("/assistants/{assistant_id}/avatar/generate")
def generate_avatar(
    assistant_id: str,
    db: Session = Depends(get_db)
):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    
    if not image_client or not image_deployment:
        raise HTTPException(status_code=501, detail="Image generation is not configured. Add AZURE_OPENAI_IMAGE_DEPLOYMENT to your .env file.")
    
    prompt = f"Minimalist flat icon for '{assistant.name}'"
    if assistant.description:
        prompt += f": {assistant.description[:80]}"
    prompt += ". Simple geometric shapes, vibrant gradient, no text, square."
    
    try:
        import base64
        import traceback
        
        print(f"[Avatar Gen] Generating for '{assistant.name}' with model '{image_deployment}'")
        
        response = image_client.images.generate(
            model=image_deployment,
            prompt=prompt,
            n=1,
            size="1024x1024"
        )
        
        import time
        avatar_filename = f"tmp_{assistant_id}_{int(time.time())}.png"
        
        image_data = response.data[0]
        
        # Handle base64 response (gpt-image-1) or URL response (dall-e-3)
        if hasattr(image_data, 'b64_json') and image_data.b64_json:
            print("[Avatar Gen] Received base64 response, decoding...")
            img_bytes = base64.b64decode(image_data.b64_json)
        elif hasattr(image_data, 'url') and image_data.url:
            print(f"[Avatar Gen] Received URL response, downloading...")
            with httpx.Client(timeout=60.0) as client:
                img_response = client.get(image_data.url)
                img_response.raise_for_status()
            img_bytes = img_response.content
        else:
            raise Exception(f"Unexpected response format: {dir(image_data)}")
        
        avatar_url = storage.upload_avatar(avatar_filename, img_bytes)
        print(f"[Avatar Gen] Saved to {avatar_url}")
        
        return {"image_url": avatar_url}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")

@app.get("/avatars/{filename}")
def serve_avatar(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not storage.avatar_exists(filename):
        raise HTTPException(status_code=404, detail="Avatar not found")
    data = storage.get_avatar_bytes(filename)
    ext = os.path.splitext(filename)[1].lower()
    content_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    return Response(content=data, media_type=content_type)

@app.delete("/avatars/{filename}")
def delete_avatar_endpoint(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if storage.avatar_exists(filename):
        storage.delete_avatar(filename)
        return {"status": "deleted"}
    return {"status": "not found"}

@app.delete("/assistants/{assistant_id}")
def delete_assistant(assistant_id: str, db: Session = Depends(get_db)):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
        
    # Clean up search indices
    try:
        search_manager.delete_assistant_documents(assistant_id)
    except Exception as e:
        print(f"Failed to delete search indices for assistant {assistant_id}: {e}")

    # Clean up document files from storage
    for doc in assistant.documents:
        count = db.query(Document).filter(Document.filename == doc.filename).count()
        if count <= 1:
            storage.delete_document(doc.filename)

    # Clean up avatar file from storage
    if assistant.image_url:
        avatar_filename = os.path.basename(assistant.image_url)
        storage.delete_avatar(avatar_filename)
            
    db.delete(assistant)
    db.commit()
    return {"status": "deleted"}

@app.post("/assistants/{assistant_id}/documents/")
def upload_document(assistant_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant: return {"error": "Assistant not found"}

    # Upload file to storage
    storage.upload_document(file.filename, file)
        
    try:
        # Get a local path for parsing (downloads from blob if in Azure mode)
        local_path = storage.get_document_local_path(file.filename)
        text_content = parse_document(local_path, file.filename)
        file_stats = search_manager.process_and_index_document(text_content, file.filename, assistant_id)
        doc = Document(assistant_id=assistant_id, filename=file.filename)
        db.add(doc)
        db.commit()
        return {"filename": file.filename, "status": "indexed", "chunks": file_stats["chunks"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/assistants/{assistant_id}/documents/")
def list_documents(assistant_id: str, db: Session = Depends(get_db)):
    return db.query(Document).filter(Document.assistant_id == assistant_id).all()

@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc: raise HTTPException(status_code=404, detail="Document not found")
    
    # Clean up search indices
    try:
        search_manager.delete_document_by_filename(doc.filename, doc.assistant_id)
    except Exception as e:
        print(f"Failed to delete search index for doc {doc.filename}: {e}")
        
    # Clean up file from storage
    count = db.query(Document).filter(Document.filename == doc.filename).count()
    if count <= 1:
        storage.delete_document(doc.filename)
            
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}

@app.get("/documents/{doc_id}/preview")
def preview_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not storage.document_exists(doc.filename):
        raise HTTPException(status_code=404, detail="File not found in storage")
    
    ext = os.path.splitext(doc.filename)[1].lower()
    
    # Text-based files: return content as JSON for the frontend to render
    if ext in [".md", ".txt", ".csv"]:
        content = storage.get_document_text(doc.filename)
        return JSONResponse({"type": ext.lstrip("."), "filename": doc.filename, "content": content})
    
    # PDF files: serve the raw binary for embedded viewing
    if ext == ".pdf":
        data = storage.get_document_bytes(doc.filename)
        return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{doc.filename}"'})
    
    # Image files: serve the raw binary
    if ext in [".png", ".jpg", ".jpeg", ".bmp"]:
        media_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".bmp": "image/bmp"}
        data = storage.get_document_bytes(doc.filename)
        return Response(content=data, media_type=media_types.get(ext, "application/octet-stream"))
    
    # DOCX/PPTX: extract text content and return
    if ext in [".docx", ".pptx"]:
        local_path = storage.get_document_local_path(doc.filename)
        content = parse_document(local_path, doc.filename)
        return JSONResponse({"type": ext.lstrip("."), "filename": doc.filename, "content": content})

@app.post("/assistants/{assistant_id}/sessions/")
def create_session(assistant_id: str, db: Session = Depends(get_db)):
    session = ChatSession(assistant_id=assistant_id, title="New Conversation")
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@app.get("/assistants/{assistant_id}/sessions/")
def list_sessions(assistant_id: str, db: Session = Depends(get_db)):
    return db.query(ChatSession).filter(ChatSession.assistant_id == assistant_id).order_by(ChatSession.updated_at.desc()).all()

@app.post("/sessions/{session_id}/chat/")
async def send_chat_message(session_id: str, request: dict, db: Session = Depends(get_db)):
    query = request.get("query")
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    assistant = chat_session.assistant
    history_records = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    history = [{"role": m.role, "content": m.content} for m in history_records[-10:]]

    user_msg = ChatMessage(session_id=session_id, role="user", content=query)
    db.add(user_msg)
    
    response_text, citations = chat_manager.generate_response(query, history, assistant.instructions, assistant.id)
    
    cites_json = json.dumps(citations)
    ai_msg = ChatMessage(session_id=session_id, role="assistant", content=response_text, citations=cites_json)
    db.add(ai_msg)
    
    from datetime import datetime
    chat_session.updated_at = datetime.utcnow()
    chat_session.title = query[:30] + "..." if len(history_records) == 0 else chat_session.title
    db.commit()

    return {"reply": response_text, "citations": citations, "created_at": (ai_msg.created_at.isoformat() + "Z") if ai_msg.created_at else (datetime.utcnow().isoformat() + "Z")}

@app.get("/sessions/{session_id}/history/")
def get_session_history(session_id: str, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()).all()
    res = []
    for m in messages:
        res.append({
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "citations": json.loads(m.citations) if m.citations else [],
            "feedback": m.feedback,
            "created_at": (m.created_at.isoformat() + "Z") if m.created_at else None
        })
    return res

@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Due to cascade rules or manual deletion, we delete it
    db.delete(session)
    db.commit()
    return {"status": "deleted"}

# ---------------------------------------------------------------------------
# Streaming chat (SSE)
# ---------------------------------------------------------------------------
@app.post("/sessions/{session_id}/chat/stream")
def send_chat_message_stream(session_id: str, request: dict, db: Session = Depends(get_db)):
    query = request.get("query")
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")
    assistant = chat_session.assistant
    history_records = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()).all()
    history = [{"role": m.role, "content": m.content} for m in history_records[-10:]]

    is_first_message = len(history_records) == 0

    user_msg = ChatMessage(session_id=session_id, role="user", content=query)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)
    user_msg_id = user_msg.id
    user_created_at = (user_msg.created_at.isoformat() + "Z") if user_msg.created_at else None

    def event_gen():
        from datetime import datetime as _dt
        # Send initial user-message metadata so frontend can persist its id
        yield f"data: {json.dumps({'type': 'user_meta', 'id': user_msg_id, 'created_at': user_created_at})}\n\n"

        full_text_parts = []
        used_citations = []
        try:
            for kind, payload in chat_manager.stream_response(query, history, assistant.instructions, assistant.id):
                if kind == "token":
                    full_text_parts.append(payload)
                    yield f"data: {json.dumps({'type': 'token', 'content': payload})}\n\n"
                elif kind == "done":
                    used_citations = payload
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        full_text = "".join(full_text_parts)

        # Persist assistant message
        ai_msg = ChatMessage(session_id=session_id, role="assistant", content=full_text, citations=json.dumps(used_citations))
        db.add(ai_msg)
        chat_session.updated_at = _dt.utcnow()
        if is_first_message:
            chat_session.title = (query[:30] + "...") if len(query) > 30 else query
        db.commit()
        db.refresh(ai_msg)

        ai_created_at = (ai_msg.created_at.isoformat() + "Z") if ai_msg.created_at else None
        yield f"data: {json.dumps({'type': 'done', 'id': ai_msg.id, 'citations': used_citations, 'created_at': ai_created_at, 'session_title': chat_session.title})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ---------------------------------------------------------------------------
# Message feedback
# ---------------------------------------------------------------------------
@app.post("/messages/{message_id}/feedback")
def set_message_feedback(message_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    value = payload.get("feedback")
    if value not in (-1, 0, 1, None):
        raise HTTPException(status_code=400, detail="feedback must be -1, 0, 1, or null")
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.feedback = value
    db.commit()
    return {"id": msg.id, "feedback": msg.feedback}

# ---------------------------------------------------------------------------
# Rename session
# ---------------------------------------------------------------------------
@app.put("/sessions/{session_id}/title")
def rename_session(session_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if len(title) > 255:
        title = title[:255]
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = title
    db.commit()
    db.refresh(session)
    return session

# ---------------------------------------------------------------------------
# Regenerate last assistant response
# ---------------------------------------------------------------------------
@app.post("/sessions/{session_id}/regenerate")
def regenerate_last(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc()).all()
    if not msgs:
        raise HTTPException(status_code=400, detail="No messages to regenerate")

    # Find last assistant message and matching preceding user message
    last_user_idx = None
    for i in range(len(msgs) - 1, -1, -1):
        if msgs[i].role == "user":
            last_user_idx = i
            break
    if last_user_idx is None:
        raise HTTPException(status_code=400, detail="No user message to regenerate from")

    # Drop everything after last user message (incl. any assistant replies)
    for m in msgs[last_user_idx + 1:]:
        db.delete(m)
    db.commit()

    history_records = msgs[:last_user_idx]  # everything before user msg
    history = [{"role": m.role, "content": m.content} for m in history_records[-10:]]
    query = msgs[last_user_idx].content

    response_text, citations = chat_manager.generate_response(query, history, session.assistant.instructions, session.assistant.id)
    ai_msg = ChatMessage(session_id=session_id, role="assistant", content=response_text, citations=json.dumps(citations))
    db.add(ai_msg)
    from datetime import datetime as _dt
    session.updated_at = _dt.utcnow()
    db.commit()
    db.refresh(ai_msg)
    return {
        "id": ai_msg.id,
        "reply": response_text,
        "citations": citations,
        "created_at": (ai_msg.created_at.isoformat() + "Z") if ai_msg.created_at else None,
    }

# ---------------------------------------------------------------------------
# Search messages within a session
# ---------------------------------------------------------------------------
@app.get("/sessions/{session_id}/search")
def search_session_messages(session_id: str, q: str = "", db: Session = Depends(get_db)):
    q = q.strip()
    if not q:
        return []
    pattern = f"%{q}%"
    msgs = (db.query(ChatMessage)
              .filter(ChatMessage.session_id == session_id)
              .filter(ChatMessage.content.ilike(pattern))
              .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
              .all())
    return [{
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "created_at": (m.created_at.isoformat() + "Z") if m.created_at else None,
    } for m in msgs]

# ---------------------------------------------------------------------------
# Clone assistant (config + image only — documents NOT copied)
# ---------------------------------------------------------------------------
@app.post("/assistants/{assistant_id}/clone")
def clone_assistant(assistant_id: str, db: Session = Depends(get_db)):
    src = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Assistant not found")

    from sqlalchemy import func as _func
    next_order = (db.query(_func.coalesce(_func.max(Assistant.sort_order), 0)).scalar() or 0) + 1

    cloned = Assistant(
        name=f"{src.name} (Copy)",
        description=src.description,
        instructions=src.instructions,
        sort_order=next_order,
        pinned=0,
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)

    # Copy avatar bytes (new filename) so deletion of the source is safe.
    if src.image_url:
        try:
            src_filename = os.path.basename(src.image_url)
            if storage.avatar_exists(src_filename):
                data = storage.get_avatar_bytes(src_filename)
                ext = os.path.splitext(src_filename)[1] or ".png"
                import time as _time
                new_filename = f"{cloned.id}_{int(_time.time())}{ext}"
                cloned.image_url = storage.upload_avatar(new_filename, data)
                db.commit()
                db.refresh(cloned)
        except Exception as e:
            print(f"[Clone] Failed to copy avatar: {e}")

    return cloned

# ---------------------------------------------------------------------------
# Branch a conversation from a given message
# ---------------------------------------------------------------------------
@app.post("/sessions/{session_id}/branch")
def branch_session(session_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    from_message_id = payload.get("from_message_id")
    if from_message_id is None:
        raise HTTPException(status_code=400, detail="from_message_id is required")

    src = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Session not found")

    pivot = db.query(ChatMessage).filter(ChatMessage.id == int(from_message_id), ChatMessage.session_id == session_id).first()
    if not pivot:
        raise HTTPException(status_code=404, detail="Pivot message not found in session")

    msgs = (db.query(ChatMessage)
              .filter(ChatMessage.session_id == session_id)
              .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
              .all())
    cutoff_idx = next((i for i, m in enumerate(msgs) if m.id == pivot.id), -1)
    if cutoff_idx == -1:
        raise HTTPException(status_code=404, detail="Pivot message not found")

    # Inclusive: copy messages [0..cutoff_idx]
    new_session = ChatSession(assistant_id=src.assistant_id, title=f"{src.title} (branch)")
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    for m in msgs[:cutoff_idx + 1]:
        db.add(ChatMessage(
            session_id=new_session.id,
            role=m.role,
            content=m.content,
            citations=m.citations,
        ))
    db.commit()
    db.refresh(new_session)
    return new_session

# ---------------------------------------------------------------------------
# Bulk reorder + pin assistants
# ---------------------------------------------------------------------------
@app.put("/assistants/order")
def reorder_assistants(payload: dict = Body(...), db: Session = Depends(get_db)):
    items = payload.get("items") or []
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")
    for it in items:
        aid = it.get("id")
        if not aid:
            continue
        a = db.query(Assistant).filter(Assistant.id == aid).first()
        if not a:
            continue
        if "sort_order" in it:
            a.sort_order = int(it["sort_order"])
        if "pinned" in it:
            a.pinned = 1 if it["pinned"] else 0
    db.commit()
    return {"status": "ok"}
