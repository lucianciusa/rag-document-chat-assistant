import os
import io
import time
import zipfile
import shutil
import json
import uuid
import httpx
import traceback
import base64
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, FileResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect as sa_inspect, func
from datetime import datetime
from dotenv import load_dotenv
from typing import List
from pydantic import BaseModel
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
            ("messages",   "context",     "NVARCHAR(MAX) NULL"),
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
            if 'context' not in msg_cols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN context TEXT"))

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

# ---------------------------------------------------------------------------
# Bulk reorder + pin assistants  (must be before /{assistant_id} route)
# ---------------------------------------------------------------------------
class ReorderItem(BaseModel):
    id: str
    sort_order: int
    pinned: int

class ReorderPayload(BaseModel):
    items: List[ReorderItem]

# ---------------------------------------------------------------------------
@app.put("/assistants/order")
def reorder_assistants(payload: ReorderPayload, db: Session = Depends(get_db)):
    for it in payload.items:
        a = db.query(Assistant).filter(Assistant.id == it.id).first()
        if not a:
            continue
        a.sort_order = it.sort_order
        a.pinned = 1 if it.pinned else 0
    db.commit()
    return {"status": "ok"}


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
        import time
        avatar_filename = f"tmp_{assistant_id}_{int(time.time())}.png"
        
        response = image_client.images.generate(
            model=image_deployment,
            prompt=prompt,
            n=1,
            size="1024x1024"
        )
        image_data = response.data[0]
        
        if hasattr(image_data, 'b64_json') and image_data.b64_json:
            img_bytes = base64.b64decode(image_data.b64_json)
        elif hasattr(image_data, 'url') and image_data.url:
            with httpx.Client(timeout=60.0) as client:
                img_response = client.get(image_data.url)
                img_response.raise_for_status()
            img_bytes = img_response.content
        else:
            raise Exception("Unexpected response format")
        
        avatar_url = storage.upload_avatar(avatar_filename, img_bytes)
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
        
    try:
        search_manager.delete_assistant_documents(assistant_id)
    except Exception as e:
        print(f"Failed to delete search indices: {e}")

    for doc in assistant.documents:
        count = db.query(Document).filter(Document.filename == doc.filename).count()
        if count <= 1:
            storage.delete_document(doc.filename)

    if assistant.image_url:
        storage.delete_avatar(os.path.basename(assistant.image_url))
            
    db.delete(assistant)
    db.commit()
    return {"status": "deleted"}

@app.post("/assistants/{assistant_id}/documents/")
def upload_document(assistant_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant: return {"error": "Assistant not found"}

    ext = os.path.splitext(file.filename)[1].lower()
    if ext in [".png", ".jpg", ".jpeg", ".bmp", ".pptx"]:
        raise HTTPException(status_code=400, detail="Images and PPTX files are not allowed as knowledge base documents.")

    storage.upload_document(file.filename, file)
    try:
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
    try:
        search_manager.delete_document_by_filename(doc.filename, doc.assistant_id)
    except: pass
    count = db.query(Document).filter(Document.filename == doc.filename).count()
    if count <= 1:
        storage.delete_document(doc.filename)
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}

@app.get("/documents/{doc_id}/preview")
def preview_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc: raise HTTPException(status_code=404, detail="Document not found")
    if not storage.document_exists(doc.filename): raise HTTPException(status_code=404, detail="File not found")
    
    ext = os.path.splitext(doc.filename)[1].lower()
    if ext in [".md", ".txt", ".csv"]:
        content = storage.get_document_text(doc.filename)
        return JSONResponse({"type": ext.lstrip("."), "filename": doc.filename, "content": content})
    if ext == ".pdf":
        data = storage.get_document_bytes(doc.filename)
        return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{doc.filename}"'})
    if ext in [".docx", ".pptx"]:
        local_path = storage.get_document_local_path(doc.filename)
        content = parse_document(local_path, doc.filename)
        return JSONResponse({"type": ext.lstrip("."), "filename": doc.filename, "content": content})
    raise HTTPException(status_code=400, detail="Preview not supported for this type")

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

@app.get("/sessions/recent")
def get_recent_sessions(limit: int = 5, db: Session = Depends(get_db)):
    sessions = (
        db.query(ChatSession)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for s in sessions:
        asst = db.query(Assistant).filter(Assistant.id == s.assistant_id).first()
        result.append({
            "id": s.id,
            "title": s.title,
            "updated_at": s.updated_at.isoformat() + "Z" if s.updated_at else None,
            "assistant_id": s.assistant_id,
            "assistant_name": asst.name if asst else "Unknown",
            "assistant_image_url": asst.image_url if asst else None,
        })
    return result


@app.post("/sessions/{session_id}/chat/")
async def send_chat_message(session_id: str, request: dict, db: Session = Depends(get_db)):
    query = request.get("query")
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    assistant = chat_session.assistant
    history_records = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    history = [{"role": m.role, "content": m.content} for m in history_records[-10:]]

    db.add(ChatMessage(session_id=session_id, role="user", content=query))
    reply, cites, context = chat_manager.generate_response(query, history, assistant.instructions, assistant.id)
    
    ai_msg = ChatMessage(session_id=session_id, role="assistant", content=reply, citations=json.dumps(cites), context=json.dumps(context))
    db.add(ai_msg)
    chat_session.updated_at = datetime.utcnow()
    if not history_records: chat_session.title = query[:30] + "..."
    db.commit()
    return {"reply": reply, "citations": cites, "created_at": ai_msg.created_at.isoformat() + "Z"}

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
            "context": json.loads(m.context) if m.context else [],
            "feedback": m.feedback,
            "created_at": m.created_at.isoformat() + "Z" if m.created_at else None
        })
    return res

@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        db.delete(session)
        db.commit()
    return {"status": "deleted"}

@app.post("/sessions/{session_id}/chat/stream")
async def send_chat_message_stream(session_id: str, request: dict, db: Session = Depends(get_db)):
    query = request.get("query")
    chat_session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat_session: raise HTTPException(status_code=404, detail="Session not found")
    
    history_records = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    history = [{"role": m.role, "content": m.content} for m in history_records[-10:]]

    user_msg = ChatMessage(session_id=session_id, role="user", content=query)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    async def event_gen():
        from datetime import datetime as _dt
        yield f"data: {json.dumps({'type': 'user_meta', 'id': user_msg.id, 'created_at': user_msg.created_at.isoformat() + 'Z'})}\n\n"
        full_text_parts = []
        used_citations = []
        relevant_context = []
        try:
            async for chunk in chat_manager.stream_response(query, history, chat_session.assistant.instructions, chat_session.assistant.id):
                kind = chunk[0]
                if kind == "token":
                    payload = chunk[1]
                    full_text_parts.append(payload)
                    yield f"data: {json.dumps({'type': 'token', 'content': payload})}\n\n"
                elif kind == "done":
                    used_citations = chunk[1]
                    relevant_context = chunk[2]
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        full_text = "".join(full_text_parts)
        ai_msg = ChatMessage(session_id=session_id, role="assistant", content=full_text, citations=json.dumps(used_citations), context=json.dumps(relevant_context))
        db.add(ai_msg)
        chat_session.updated_at = _dt.utcnow()
        if not history_records: chat_session.title = query[:30] + "..."
        db.commit()
        db.refresh(ai_msg)
        yield f"data: {json.dumps({'type': 'done', 'id': ai_msg.id, 'citations': used_citations, 'context': relevant_context, 'created_at': ai_msg.created_at.isoformat() + 'Z', 'session_title': chat_session.title})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.post("/messages/{message_id}/feedback")
def set_message_feedback(message_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if msg:
        msg.feedback = payload.get("feedback")
        db.commit()
    return {"status": "ok"}

@app.put("/sessions/{session_id}/title")
def rename_session(session_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.title = payload.get("title") or "New Conversation"
        db.commit()
        db.refresh(session)
    return session

@app.post("/sessions/{session_id}/regenerate/stream")
async def regenerate_last_stream(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    msgs = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.desc()).all()
    if not msgs: raise HTTPException(status_code=400)
    
    last_user = next((m for m in msgs if m.role == "user"), None)
    if not last_user: raise HTTPException(status_code=400)
    
    # Delete assistant messages after last user message
    for m in msgs:
        if m.role == "assistant" and m.created_at > last_user.created_at:
            db.delete(m)
    db.commit()

    # Re-fetch history after deletion
    history_records = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    history = [{"role": m.role, "content": m.content} for m in history_records if m.created_at < last_user.created_at][-10:]
    query = last_user.content

    async def event_gen():
        from datetime import datetime as _dt
        full_text_parts = []
        used_citations = []
        relevant_context = []
        try:
            async for chunk in chat_manager.stream_response(query, history, session.assistant.instructions, session.assistant.id):
                kind = chunk[0]
                if kind == "token":
                    payload = chunk[1]
                    full_text_parts.append(payload)
                    yield f"data: {json.dumps({'type': 'token', 'content': payload})}\n\n"
                elif kind == "done":
                    used_citations = chunk[1]
                    relevant_context = chunk[2]
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        full_text = "".join(full_text_parts)
        ai_msg = ChatMessage(session_id=session_id, role="assistant", content=full_text, citations=json.dumps(used_citations), context=json.dumps(relevant_context))
        db.add(ai_msg)
        session.updated_at = _dt.utcnow()
        db.commit()
        db.refresh(ai_msg)
        yield f"data: {json.dumps({'type': 'done', 'id': ai_msg.id, 'citations': used_citations, 'context': relevant_context, 'created_at': ai_msg.created_at.isoformat() + 'Z', 'session_title': session.title})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/sessions/{session_id}/search")
def search_session_messages(session_id: str, q: str = "", db: Session = Depends(get_db)):
    msgs = db.query(ChatMessage).filter(ChatMessage.session_id == session_id, ChatMessage.content.ilike(f"%{q}%")).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat() + "Z"} for m in msgs]

@app.post("/assistants/{assistant_id}/clone")
def clone_assistant(assistant_id: str, db: Session = Depends(get_db)):
    src = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    cloned = Assistant(name=f"{src.name} (Copy)", description=src.description, instructions=src.instructions)
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return cloned

@app.post("/sessions/{session_id}/branch")
def branch_session(session_id: str, payload: dict = Body(...), db: Session = Depends(get_db)):
    src = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    msgs = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    pivot_id = payload.get("from_message_id")

    new_session = ChatSession(assistant_id=src.assistant_id, title=f"{src.title} (branch)")
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    for m in msgs:
        db.add(ChatMessage(session_id=new_session.id, role=m.role, content=m.content, citations=m.citations, context=m.context))
        if m.id == pivot_id: break
    db.commit()
    return new_session


EXPORT_SCHEMA_VERSION = 1

@app.get("/assistants/{assistant_id}/export")
def export_assistant(assistant_id: str, db: Session = Depends(get_db)):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    docs = db.query(Document).filter(Document.assistant_id == assistant_id).all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Avatar
        image_filename = None
        if assistant.image_url:
            image_filename = os.path.basename(assistant.image_url)
            try:
                avatar_bytes = storage.get_avatar_bytes(image_filename)
                zf.writestr(f"avatar/{image_filename}", avatar_bytes)
            except Exception:
                image_filename = None

        # Documents
        doc_list = []
        for doc in docs:
            doc_list.append({"filename": doc.filename})
            try:
                doc_bytes = storage.get_document_bytes(doc.filename)
                zf.writestr(f"documents/{doc.filename}", doc_bytes)
            except Exception:
                pass

        # Manifest
        manifest = {
            "schema_version": EXPORT_SCHEMA_VERSION,
            "name": assistant.name,
            "description": assistant.description or "",
            "instructions": assistant.instructions,
            "image_filename": image_filename,
            "documents": doc_list,
        }
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    buf.seek(0)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in assistant.name)
    filename = f"assistant_{safe_name}.zip"
    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/assistants/import")
async def import_assistant(file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Invalid ZIP file")

    try:
        manifest = json.loads(zf.read("manifest.json"))
    except (KeyError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="Missing or invalid manifest.json")

    if manifest.get("schema_version", 0) > EXPORT_SCHEMA_VERSION:
        raise HTTPException(status_code=422, detail="Export was created by a newer version of this app")

    # Resolve name collision
    base_name = manifest.get("name", "Imported Assistant")
    name = base_name
    existing_names = {a.name for a in db.query(Assistant.name).all()}
    suffix = 1
    while name in existing_names:
        name = f"{base_name} ({suffix})"
        suffix += 1

    next_order = (db.query(func.coalesce(func.max(Assistant.sort_order), 0)).scalar() or 0) + 1
    assistant = Assistant(
        name=name,
        description=manifest.get("description") or None,
        instructions=manifest.get("instructions", "You are a helpful AI assistant."),
        sort_order=next_order,
    )
    db.add(assistant)
    db.commit()
    db.refresh(assistant)

    # Avatar
    image_filename = manifest.get("image_filename")
    if image_filename:
        archive_path = f"avatar/{image_filename}"
        if archive_path in zf.namelist():
            ext = os.path.splitext(image_filename)[1] or ".png"
            new_avatar_filename = f"{assistant.id}_{int(time.time())}{ext}"
            avatar_bytes = zf.read(archive_path)
            avatar_url = storage.upload_avatar(new_avatar_filename, avatar_bytes)
            assistant.image_url = avatar_url
            db.commit()
            db.refresh(assistant)

    # Documents
    class _FakeUpload:
        def __init__(self, b: bytes, fname: str):
            self.file = io.BytesIO(b)
            self.filename = fname

    errors = []
    for doc_meta in manifest.get("documents", []):
        filename = doc_meta.get("filename", "")
        archive_path = f"documents/{filename}"
        if archive_path not in zf.namelist():
            errors.append(f"{filename}: not found in archive")
            continue
        doc_bytes = zf.read(archive_path)
        try:
            storage.upload_document(filename, _FakeUpload(doc_bytes, filename))
            local_path = storage.get_document_local_path(filename)
            text_content = parse_document(local_path, filename)
            search_manager.process_and_index_document(text_content, filename, assistant.id)
            doc = Document(assistant_id=assistant.id, filename=filename)
            db.add(doc)
            db.commit()
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")

    result = {**{c.name: getattr(assistant, c.name) for c in assistant.__table__.columns}}
    if errors:
        result["import_warnings"] = errors
    return result


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return {
        "assistants": db.query(Assistant).count(),
        "documents": db.query(Document).count(),
        "sessions": db.query(ChatSession).count(),
    }

# ------------------------------------------------------------------ #
#  Frontend Static Files Serving
# ------------------------------------------------------------------ #

# Path to the frontend/dist directory (where npm run build puts files)
FRONTEND_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(FRONTEND_PATH):
    # Mount the static files (JS, CSS, etc.)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_PATH, "assets")), name="assets")
    
    # Catch-all route for React Router (serves index.html for any unknown route)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # If the path looks like an API call, return 404 (prevents infinite loop if API is missing)
        if full_path.startswith("api/") or full_path.startswith("avatars/"):
            raise HTTPException(status_code=404, detail="Not Found")
            
        # Check if the file exists (e.g. favicon.ico)
        file_path = os.path.join(FRONTEND_PATH, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Default to index.html for SPA routing
        return FileResponse(os.path.join(FRONTEND_PATH, "index.html"))
else:
    print(f"[Warning] Frontend dist not found at {FRONTEND_PATH}. App will only serve API.")
