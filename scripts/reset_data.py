"""
Wipes all application data from Azure SQL, Azure AI Search, and Azure Blob Storage.
Run from the project root:
  python scripts/reset_data.py
Requires the same environment variables used by the backend (.env is auto-loaded).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()


def reset_sql():
    from backend.database import engine, Base, Assistant, Document, ChatSession, ChatMessage
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        count_msg  = db.query(ChatMessage).count()
        count_ses  = db.query(ChatSession).count()
        count_doc  = db.query(Document).count()
        count_ast  = db.query(Assistant).count()

        # Delete in FK order
        db.query(ChatMessage).delete()
        db.query(ChatSession).delete()
        db.query(Document).delete()
        db.query(Assistant).delete()
        db.commit()

        print(f"[SQL] Deleted: {count_msg} messages, {count_ses} sessions, "
              f"{count_doc} documents, {count_ast} assistants.")
    except Exception as e:
        db.rollback()
        print(f"[SQL] Error: {e}")
        raise
    finally:
        db.close()


def reset_search():
    endpoint  = os.getenv("AZURE_SEARCH_SERVICE_ENDPOINT", "")
    api_key   = os.getenv("AZURE_SEARCH_ADMIN_KEY", "")
    index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", "rag-index-economical")

    if not endpoint or not api_key:
        print("[Search] Skipped — AZURE_SEARCH_SERVICE_ENDPOINT / AZURE_SEARCH_ADMIN_KEY not set.")
        return

    from azure.core.credentials import AzureKeyCredential
    from azure.search.documents import SearchClient

    client = SearchClient(
        endpoint=endpoint,
        index_name=index_name,
        credential=AzureKeyCredential(api_key),
    )

    ids = [r["id"] for r in client.search(search_text="*", select=["id"], top=100_000)]
    if not ids:
        print("[Search] Index already empty.")
        return

    batch_size = 1000
    deleted = 0
    for i in range(0, len(ids), batch_size):
        batch = [{"id": id_} for id_ in ids[i : i + batch_size]]
        client.delete_documents(documents=batch)
        deleted += len(batch)

    print(f"[Search] Deleted {deleted} vectors from index '{index_name}'.")


def reset_blobs():
    conn_str   = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    docs_cont  = os.getenv("AZURE_STORAGE_DOCUMENTS_CONTAINER", "documents")
    avatars_cont = os.getenv("AZURE_STORAGE_AVATARS_CONTAINER", "avatars")

    if not conn_str:
        print("[Blobs] Skipped — AZURE_STORAGE_CONNECTION_STRING not set.")
        return

    from azure.storage.blob import BlobServiceClient

    service = BlobServiceClient.from_connection_string(conn_str)
    total = 0
    for container in [docs_cont, avatars_cont]:
        try:
            cc = service.get_container_client(container)
            blobs = list(cc.list_blobs())
            for blob in blobs:
                cc.delete_blob(blob.name)
            total += len(blobs)
            print(f"[Blobs] Container '{container}': deleted {len(blobs)} blob(s).")
        except Exception as e:
            print(f"[Blobs] Container '{container}': {e}")

    print(f"[Blobs] Total deleted: {total}.")


if __name__ == "__main__":
    print("=" * 50)
    print("LINCITE — DATA RESET")
    print("=" * 50)
    reset_sql()
    reset_search()
    reset_blobs()
    print("=" * 50)
    print("Done. All data cleared.")
