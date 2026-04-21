import fitz  # PyMuPDF
from docx import Document
from pptx import Presentation
import pytesseract
from PIL import Image
import os

def parse_document(file_path: str, filename: str) -> str:
    """Detects extension and routes to correct parser, preventing high Azure OCR costs."""
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == ".pdf":
        return parse_pdf(file_path)
    elif ext in [".md", ".txt", ".csv"]:
        return parse_text(file_path)
    elif ext == ".docx":
        return parse_docx(file_path)
    elif ext == ".pptx":
        return parse_pptx(file_path)
    elif ext in [".png", ".jpg", ".jpeg", ".bmp"]:
        return parse_image(file_path)
    else:
        raise ValueError(f"Format {ext} not supported")

def parse_pdf(file_path: str) -> str:
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text() + "\n"
    return text.strip()

def parse_text(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read().strip()

def parse_docx(file_path: str) -> str:
    doc = Document(file_path)
    return "\n".join([para.text for para in doc.paragraphs]).strip()

def parse_pptx(file_path: str) -> str:
    prs = Presentation(file_path)
    text = ""
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, 'text'):
                text += shape.text + "\n"
    return text.strip()

def parse_image(file_path: str) -> str:
    # Requires tesseract installed locally, completely free image processing
    img = Image.open(file_path)
    text = pytesseract.image_to_string(img)
    return text.strip()
