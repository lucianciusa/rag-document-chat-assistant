from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
import os
import uuid

def _build_engine():
    """
    Build SQLAlchemy engine.
    Supports two Azure SQL connection string formats:
      1. SQLAlchemy URL:  mssql+pyodbc://user:pass@server/db?driver=...
      2. ODBC format:     Driver={...};Server=tcp:...;Database=...;Uid=...;Pwd=...
    Falls back to local SQLite if not configured or on parse failure.
    """
    conn = os.getenv("AZURE_SQL_CONNECTION_STRING", "").strip()

    if not conn:
        print("[Database] Using local SQLite")
        return create_engine("sqlite:///./rag_assistants.db", connect_args={"check_same_thread": False})

    # Already a SQLAlchemy URL
    if conn.startswith("mssql+pyodbc://"):
        try:
            engine = create_engine(conn, pool_pre_ping=True, pool_recycle=300)
            print("[Database] Using Azure SQL Database")
            return engine
        except Exception as e:
            print(f"[Database] Failed to connect to Azure SQL ({e}). Falling back to SQLite.")
            return create_engine("sqlite:///./rag_assistants.db", connect_args={"check_same_thread": False})

    # ODBC / ADO.NET format from Azure Portal — parse and convert
    # Example: Driver={ODBC Driver 18 for SQL Server};Server=tcp:server.database.windows.net,1433;Database=db;Uid=user;Pwd={pass};Encrypt=yes;...
    try:
        import re
        def _odbc_val(key):
            """Extract a value from a semicolon-delimited key=value ODBC string."""
            m = re.search(rf"(?:^|;){re.escape(key)}=([^;]+)", conn, re.IGNORECASE)
            return m.group(1).strip().strip("{}") if m else ""

        server_raw = _odbc_val("Server")          # tcp:host,1433
        database   = _odbc_val("Database")
        uid        = _odbc_val("Uid")
        pwd        = _odbc_val("Pwd")
        encrypt    = _odbc_val("Encrypt") or "yes"
        trust_cert = _odbc_val("TrustServerCertificate") or "no"

        # Strip "tcp:" prefix and port from server
        host_port = re.sub(r"^tcp:", "", server_raw)
        host = host_port.split(",")[0].strip()

        from urllib.parse import quote_plus
        params = quote_plus(
            f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={host};DATABASE={database};"
            f"UID={uid};PWD={pwd};Encrypt={encrypt};TrustServerCertificate={trust_cert};"
        )
        url = f"mssql+pyodbc:///?odbc_connect={params}"
        engine = create_engine(url, pool_pre_ping=True, pool_recycle=300)
        print("[Database] Using Azure SQL Database (parsed from ODBC connection string)")
        return engine
    except Exception as e:
        print(f"[Database] Failed to parse/connect Azure SQL ODBC string ({e}). Falling back to SQLite.")
        return create_engine("sqlite:///./rag_assistants.db", connect_args={"check_same_thread": False})

engine = _build_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Assistant(Base):
    __tablename__ = "assistants"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    instructions = Column(Text, nullable=False)
    image_url = Column(String(500), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    pinned = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("ChatSession", back_populates="assistant", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="assistant", cascade="all, delete-orphan")

class Document(Base):
    __tablename__ = "documents"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assistant_id = Column(String(36), ForeignKey("assistants.id"))
    filename = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    assistant = relationship("Assistant", back_populates="documents")

class ChatSession(Base):
    __tablename__ = "sessions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assistant_id = Column(String(36), ForeignKey("assistants.id"))
    title = Column(String(255), default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assistant = relationship("Assistant", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("sessions.id"))
    role = Column(String(20), nullable=False) # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    citations = Column(Text, nullable=True) # Stored as JSON string
    feedback = Column(Integer, nullable=True)  # -1 / 0 / 1
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
