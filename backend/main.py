import os
import shutil
import json
import uuid
import httpx
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, FileResponse, JSONResponse
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

# Migrate existing databases: add image_url column if missing (SQLite only)
def migrate_db():
    if not os.getenv("AZURE_SQL_CONNECTION_STRING"):
        inspector = sa_inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('assistants')]
        if 'image_url' not in columns:
            from sqlalchemy import text
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE assistants ADD COLUMN image_url VARCHAR"))

try:
    migrate_db()
except Exception:
    pass  # Table may not exist yet on first run

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
    assistant = Assistant(name=name, instructions=instructions, description=description)
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
    return db.query(Assistant).all()

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
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    res = []
    for m in messages:
        res.append({
            "role": m.role, 
            "content": m.content, 
            "citations": json.loads(m.citations) if m.citations else [],
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
