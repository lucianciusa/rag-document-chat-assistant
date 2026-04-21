import os
import shutil
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

from backend.search_manager import SearchManager
from backend.chat_manager import ChatManager
from backend.processors import parse_document
from backend.database import engine, Base, get_db, Assistant, Document, ChatSession, ChatMessage

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Multi-Assistant RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

search_manager = SearchManager()
chat_manager = ChatManager(search_manager)

@app.on_event("startup")
async def startup_event():
    search_manager.initialize_index()
    os.makedirs("uploads", exist_ok=True)

@app.post("/assistants/")
def create_assistant(name: str = Form(...), instructions: str = Form(...), description: str = Form(None), db: Session = Depends(get_db)):
    assistant = Assistant(name=name, instructions=instructions, description=description)
    db.add(assistant)
    db.commit()
    db.refresh(assistant)
    return assistant

@app.get("/assistants/")
def list_assistants(db: Session = Depends(get_db)):
    return db.query(Assistant).all()

@app.delete("/assistants/{assistant_id}")
def delete_assistant(assistant_id: str, db: Session = Depends(get_db)):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    db.delete(assistant)
    db.commit()
    return {"status": "deleted"}

@app.post("/assistants/{assistant_id}/documents/")
async def upload_document(assistant_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    if not assistant: return {"error": "Assistant not found"}

    file_path = os.path.join("uploads", file.filename)
    with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        
    try:
        text_content = parse_document(file_path, file.filename)
        file_stats = search_manager.process_and_index_document(text_content, file.filename, assistant_id)
        doc = Document(id=file.filename, assistant_id=assistant_id, filename=file.filename)
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
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}

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
    
    chat_session.title = query[:30] + "..." if len(history_records) == 0 else chat_session.title
    db.commit()

    return {"reply": response_text, "citations": citations}

@app.get("/sessions/{session_id}/history/")
def get_session_history(session_id: str, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    res = []
    for m in messages:
        res.append({"role": m.role, "content": m.content, "citations": json.loads(m.citations) if m.citations else []})
    return res
