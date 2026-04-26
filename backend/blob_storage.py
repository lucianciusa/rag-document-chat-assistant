"""
Abstraction layer for file storage.
Auto-detects Azure Blob Storage or falls back to local disk.
"""
import os
import io
import shutil
from fastapi import UploadFile

# Try to import Azure SDK
try:
    from azure.storage.blob import BlobServiceClient, ContentSettings
    _azure_available = True
except ImportError:
    _azure_available = False


class BlobStorageManager:
    """Unified file-storage interface: Azure Blob or local disk."""

    def __init__(self):
        conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.documents_container = os.getenv("AZURE_STORAGE_DOCUMENTS_CONTAINER", "documents")
        self.avatars_container = os.getenv("AZURE_STORAGE_AVATARS_CONTAINER", "avatars")

        if conn_str and _azure_available:
            self.mode = "azure"
            self.blob_service = BlobServiceClient.from_connection_string(conn_str)
            # Ensure containers exist
            for name in [self.documents_container, self.avatars_container]:
                try:
                    self.blob_service.create_container(name)
                except Exception:
                    pass  # Container already exists
            print("[Storage] Using Azure Blob Storage")
        else:
            self.mode = "local"
            os.makedirs("uploads", exist_ok=True)
            os.makedirs("uploads/avatars", exist_ok=True)
            print("[Storage] Using local disk storage")

    # ------------------------------------------------------------------ #
    #  Documents
    # ------------------------------------------------------------------ #

    def upload_document(self, filename: str, file: UploadFile) -> str:
        """Save an uploaded document. Returns the storage path/key."""
        if self.mode == "azure":
            blob_client = self.blob_service.get_blob_client(self.documents_container, filename)
            blob_client.upload_blob(file.file, overwrite=True)
            return filename
        else:
            file_path = os.path.join("uploads", filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            return file_path

    def get_document_bytes(self, filename: str) -> bytes:
        """Read full document content as bytes."""
        if self.mode == "azure":
            blob_client = self.blob_service.get_blob_client(self.documents_container, filename)
            return blob_client.download_blob().readall()
        else:
            file_path = os.path.join("uploads", filename)
            with open(file_path, "rb") as f:
                return f.read()

    def get_document_text(self, filename: str, encoding: str = "utf-8") -> str:
        """Read document content as text string."""
        return self.get_document_bytes(filename).decode(encoding)

    def get_document_stream(self, filename: str):
        """Return a file-like stream for the document."""
        return io.BytesIO(self.get_document_bytes(filename))

    def get_document_local_path(self, filename: str) -> str:
        """
        Return a local file path for the document.
        For Azure mode, downloads to a system temp file first.
        """
        if self.mode == "azure":
            import tempfile
            ext = os.path.splitext(filename)[1]
            tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            data = self.get_document_bytes(filename)
            tmp.write(data)
            tmp.close()
            return tmp.name
        else:
            return os.path.join("uploads", filename)

    def delete_document(self, filename: str):
        """Delete a document from storage."""
        if self.mode == "azure":
            try:
                blob_client = self.blob_service.get_blob_client(self.documents_container, filename)
                blob_client.delete_blob()
            except Exception as e:
                print(f"[Storage] Failed to delete document blob {filename}: {e}")
        else:
            file_path = os.path.join("uploads", filename)
            if os.path.exists(file_path):
                os.remove(file_path)

    def document_exists(self, filename: str) -> bool:
        """Check if a document exists in storage."""
        if self.mode == "azure":
            try:
                blob_client = self.blob_service.get_blob_client(self.documents_container, filename)
                blob_client.get_blob_properties()
                return True
            except Exception:
                return False
        else:
            return os.path.exists(os.path.join("uploads", filename))

    # ------------------------------------------------------------------ #
    #  Avatars
    # ------------------------------------------------------------------ #

    def upload_avatar(self, filename: str, data: bytes, content_type: str = "image/png") -> str:
        """Save avatar image bytes. Returns the public-facing URL path."""
        if self.mode == "azure":
            blob_client = self.blob_service.get_blob_client(self.avatars_container, filename)
            blob_client.upload_blob(
                data, overwrite=True,
                content_settings=ContentSettings(content_type=content_type)
            )
            return f"/api/avatars/{filename}"
        else:
            avatar_path = os.path.join("uploads", "avatars", filename)
            with open(avatar_path, "wb") as f:
                f.write(data)
            return f"/api/avatars/{filename}"

    def upload_avatar_from_file(self, filename: str, upload_file: UploadFile) -> str:
        """Save avatar from an UploadFile object. Returns the public-facing URL path."""
        if self.mode == "azure":
            blob_client = self.blob_service.get_blob_client(self.avatars_container, filename)
            blob_client.upload_blob(upload_file.file, overwrite=True)
            return f"/api/avatars/{filename}"
        else:
            avatar_path = os.path.join("uploads", "avatars", filename)
            with open(avatar_path, "wb") as f:
                shutil.copyfileobj(upload_file.file, f)
            return f"/api/avatars/{filename}"

    def delete_avatar(self, filename: str):
        """Delete an avatar image from storage."""
        if self.mode == "azure":
            try:
                blob_client = self.blob_service.get_blob_client(self.avatars_container, filename)
                blob_client.delete_blob()
            except Exception as e:
                print(f"[Storage] Failed to delete avatar blob {filename}: {e}")
        else:
            avatar_path = os.path.join("uploads", "avatars", filename)
            if os.path.exists(avatar_path):
                os.remove(avatar_path)

    def get_avatar_bytes(self, filename: str) -> bytes:
        """Read avatar content as bytes (for serving)."""
        if self.mode == "azure":
            blob_client = self.blob_service.get_blob_client(self.avatars_container, filename)
            return blob_client.download_blob().readall()
        else:
            avatar_path = os.path.join("uploads", "avatars", filename)
            with open(avatar_path, "rb") as f:
                return f.read()

    def avatar_exists(self, filename: str) -> bool:
        """Check if an avatar exists in storage."""
        if self.mode == "azure":
            try:
                blob_client = self.blob_service.get_blob_client(self.avatars_container, filename)
                blob_client.get_blob_properties()
                return True
            except Exception:
                return False
        else:
            return os.path.exists(os.path.join("uploads", "avatars", filename))

    def get_avatar_url(self, filename: str) -> str:
        """Get the public URL for an avatar. Used when constructing image_url."""
        return f"/api/avatars/{filename}"
