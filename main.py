import io
import numpy as np
import fitz 
from fastapi import FastAPI, UploadFile, File, HTTPException
from paddleocr import PaddleOCR
from PIL import Image

app = FastAPI()

ocr = PaddleOCR(use_doc_orientation_classify=True, use_doc_unwarping=True, lang="en")

def process_image_bytes(image_bytes: bytes) -> list:
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(image)
        
        result = ocr.predict(img_array)
        
        lines = []
        if result:
            for page in result:
                if "rec_texts" in page:
                    for text_line in page["rec_texts"]:
                        if text_line:  
                            lines.append(text_line)
                            
        return lines
    except Exception as e:
        print(f"OCR processing error: {e}")
        return []

@app.post("/ocr")
async def recognize(file: UploadFile = File(...)):
    filename = file.filename.lower()
    file_bytes = await file.read()
    
    if filename.endswith(".pdf") or file.content_type == "application/pdf":
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")
            
        pdf_results = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            native_text = page.get_text("text").strip()
            native_lines = [line.strip() for line in native_text.split("\n") if line.strip()]
            
            ocr_lines = []
            image_list = page.get_images(full=True)
            
            for img_info in image_list:
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                
                detected_text = process_image_bytes(image_bytes)
                ocr_lines.extend(detected_text)
            
            pdf_results.append({
                "page": page_num + 1,
                "native_text_lines": native_lines,
                "ocr_image_lines": ocr_lines,
                "combined_page_text": "\n".join(native_lines + ocr_lines)
            })
            
        full_document_text = "\n".join([p["combined_page_text"] for p in pdf_results])
        
        return {
            "type": "pdf",
            "total_pages": len(doc),
            "full_text": full_document_text,
            "pages": pdf_results
        }

    elif filename.endswith((".png", ".jpg", ".jpeg", ".webp", ".tiff")):
        lines = process_image_bytes(file_bytes)
        
        return {
            "type": "image",
            "text": "\n".join(lines),
            "lines": lines
        }
        
    else:
        raise HTTPException(
            status_code=400, 
            detail="Unsupported file format. Please upload a PDF or an image (PNG, JPG, JPEG, WEBP, TIFF)."
        )