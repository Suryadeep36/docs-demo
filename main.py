import os

# =========================================================
# Disable PIR & MKLDNN to fix the ConvertPirAttribute crash
# =========================================================

os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"

import cv2
import fitz  # PyMuPDF
import numpy as np
import torch
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR
from transformers import (
    TrOCRProcessor,
    VisionEncoderDecoderModel,
    ViTImageProcessor,
    RobertaTokenizer,
)

app = FastAPI()

# =========================================================
# PaddleOCR Engine Setup (MKLDNN set to False)
# =========================================================

ocr = PaddleOCR(
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    lang="en",
    enable_mkldnn=False,   # Set to False to prevent the C++ execution error
    det_limit_side_len=1280,
)
# =========================================================
# TrOCR Handwritten Text Engine Setup
# =========================================================

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading TrOCR model on device: {device}")

# Load image processor and tokenizer explicitly to bypass Hugging Face auto-tokenizer bug
feature_extractor = ViTImageProcessor.from_pretrained("microsoft/trocr-base-handwritten")
tokenizer = RobertaTokenizer.from_pretrained("microsoft/trocr-base-handwritten")

trocr_processor = TrOCRProcessor(image_processor=feature_extractor, tokenizer=tokenizer)
trocr_model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten").to(device)
# =========================================================
# Configuration Thresholds
# =========================================================

PDF_DPI = 300
MAX_IMAGE_DIM = 1600               # Scale down massive 4K scans for faster processing
OCR_CONFIDENCE_THRESHOLD = 0.80

BLUR_THRESHOLD = 100.0
DARK_THRESHOLD = 70
BRIGHT_THRESHOLD = 220
LOW_CONTRAST_THRESHOLD = 35.0


# =========================================================
# UTILITY: RESIZE LARGE IMAGES
# =========================================================

def resize_if_too_large(image: np.ndarray, max_dim: int = MAX_IMAGE_DIM) -> np.ndarray:
    """Downscales massive document images to prevent CPU OCR bottlenecks."""
    h, w = image.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return image


# =========================================================
# DESKEW (Fast C++ OpenCV findNonZero)
# =========================================================

def deskew_gray(gray: np.ndarray) -> tuple[np.ndarray, float]:
    """Deskews a grayscale image using native OpenCV C++ non-zero bounding box."""
    try:
        _, thresh = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

        pts = cv2.findNonZero(thresh)
        if pts is None or len(pts) < 100:
            return gray, 0.0

        angle = cv2.minAreaRect(pts)[-1]

        if angle < -45:
            angle = -(90 + angle)
        elif angle > 45:
            angle = 90 - angle
        else:
            angle = -angle

        if abs(angle) < 0.5 or abs(angle) > 15:
            return gray, 0.0

        height, width = gray.shape[:2]
        center = (width // 2, height // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

        rotated = cv2.warpAffine(
            gray,
            matrix,
            (width, height),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated, angle

    except Exception as e:
        print(f"Deskew error: {e}")
        return gray, 0.0


# =========================================================
# SINGLE-PASS IMAGE ENHANCEMENT
# =========================================================

def enhance_image(image: np.ndarray) -> np.ndarray:
    """Consolidates quality check, deskew, and enhancement into a single pass."""
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)

        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        brightness = float(np.mean(gray))
        contrast = float(np.std(gray))

        is_blurry = blur_score < BLUR_THRESHOLD
        is_dark = brightness < DARK_THRESHOLD
        is_low_contrast = contrast < LOW_CONTRAST_THRESHOLD

        gray, angle = deskew_gray(gray)
        if angle != 0:
            print(f"Deskew applied: {angle:.2f} degrees")

        if is_blurry:
            gray = cv2.fastNlMeansDenoising(
                gray, None, h=7, templateWindowSize=7, searchWindowSize=21
            )

        if is_low_contrast or is_dark:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)

        if is_blurry:
            blurred = cv2.GaussianBlur(gray, (0, 0), 1.2)
            gray = cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)

        if is_dark:
            gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)

        return cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)

    except Exception as e:
        print(f"Enhancement error: {e}")
        return image


# =========================================================
# OCR RESULT EXTRACTION
# =========================================================

def extract_ocr_result(result) -> tuple[list, list, float]:
    lines, scores = [], []
    try:
        if not result:
            return [], [], 0.0

        for page in result:
            data = page if isinstance(page, dict) else getattr(page, "json", None)
            if not isinstance(data, dict):
                continue

            for text in data.get("rec_texts", []):
                if text:
                    cleaned = str(text).strip()
                    if cleaned:
                        lines.append(cleaned)

            for score in data.get("rec_scores", []):
                try:
                    scores.append(float(score))
                except (ValueError, TypeError):
                    pass

        confidence = sum(scores) / len(scores) if scores else 0.0
        return lines, scores, float(confidence)

    except Exception as e:
        print(f"OCR result extraction error: {e}")
        return [], [], 0.0


# =========================================================
# RUN OCR
# =========================================================

def run_ocr(image: np.ndarray) -> dict:
    try:
        resized_image = resize_if_too_large(image)
        result = ocr.predict(resized_image)
        lines, scores, confidence = extract_ocr_result(result)
        print(f"OCR | lines={len(lines)} | confidence={confidence:.4f}")

        return {"lines": lines, "scores": scores, "confidence": confidence}

    except Exception as e:
        print(f"OCR error: {e}")
        return {"lines": [], "scores": [], "confidence": 0.0}


# =========================================================
# HANDWRITTEN OCR (TrOCR)
# =========================================================

def run_trocr_on_crop(image_crop: np.ndarray) -> str:
    """Passes a cropped image of a text line into TrOCR."""
    try:
        pil_img = Image.fromarray(image_crop).convert("RGB")
        pixel_values = trocr_processor(images=pil_img, return_tensors="pt").pixel_values.to(device)
        
        with torch.no_grad():
            generated_ids = trocr_model.generate(pixel_values)
            
        text = trocr_processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return text.strip()
    except Exception as e:
        print(f"TrOCR error: {e}")
        return ""

def ocr_handwritten_image(image: np.ndarray) -> list:
    """Uses PaddleOCR to find text boxes, then TrOCR to read the handwritten contents."""
    try:
        # Use PaddleOCR's detection pass to find text bounding box coordinates
        resized_img = resize_if_too_large(image)
        raw_result = ocr.predict(resized_img)
        
        lines = []
        if raw_result and len(raw_result) > 0:
            for page in raw_result:
                # Handle box extractions if available from PaddleOCR
                dt_polys = getattr(page, "dt_polys", []) if hasattr(page, "dt_polys") else []
                
                for poly in dt_polys:
                    # Convert polygon coordinates to bounding box
                    pts = np.array(poly, dtype=np.int32)
                    x, y, w, h = cv2.boundingRect(pts)
                    
                    # Crop text box from image (with padding)
                    crop = resized_img[max(0, y-5):y+h+5, max(0, x-5):x+w+5]
                    if crop.size > 0:
                        text = run_trocr_on_crop(crop)
                        if text:
                            lines.append(text)
                            
        return lines
    except Exception as e:
        print(f"Handwritten OCR error: {e}")
        return []

# =========================================================
# SMART OCR (Handles Printed + Handwritten Text)
# =========================================================

def smart_ocr(image: np.ndarray) -> list:
    print("Running PaddleOCR on original image...")
    original = run_ocr(image)

    # 1. Standard printed text path (High Confidence)
    if (
        len(original["lines"]) > 0
        and original["confidence"] >= OCR_CONFIDENCE_THRESHOLD
    ):
        print("Printed text detected with high confidence → no fallback needed")
        return original["lines"]

    # 2. Try Image Enhancement first for blurry/dark printed text
    print("Low confidence → Enhancing image...")
    enhanced_image = enhance_image(image)
    enhanced = run_ocr(enhanced_image)

    if enhanced["confidence"] >= OCR_CONFIDENCE_THRESHOLD:
        print("Enhanced printed OCR result selected")
        return enhanced["lines"]

    # 3. Handwriting Fallback Path (Runs TrOCR if PaddleOCR confidence remains poor)
    print("Printed OCR confidence still low → Switching to Handwritten (TrOCR) Engine...")
    handwritten_lines = ocr_handwritten_image(image)

    if len(handwritten_lines) > 0:
        print("TrOCR handwritten extraction selected")
        return handwritten_lines

    # Default fallback to best available result
    return enhanced["lines"] if enhanced["confidence"] > original["confidence"] else original["lines"]

# =========================================================
# ZERO-COPY DECODERS
# =========================================================

def render_pdf_page_to_numpy(page, dpi=PDF_DPI) -> np.ndarray:
    """Direct PyMuPDF buffer view to NumPy array without intermediate copies."""
    zoom = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)


def bytes_to_numpy(image_bytes: bytes) -> np.ndarray:
    """Direct C++ image decoding via OpenCV."""
    np_arr = np.frombuffer(image_bytes, np.uint8)
    image_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise ValueError("Could not decode image bytes")
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)


# =========================================================
# PROCESS PDF PAGE
# =========================================================

def process_pdf_page(page) -> dict:
    native_text = page.get_text("text").strip()
    native_lines = [line.strip() for line in native_text.split("\n") if line.strip()]

    # Digital PDF fast-path
    if native_lines and sum(len(x) for x in native_lines) >= 20:
        print("Digital PDF → native text extracted")
        return {
            "native_text_lines": native_lines,
            "ocr_image_lines": [],
            "combined_page_text": "\n".join(native_lines),
        }

    # Scanned PDF path
    print(f"Scanned PDF → rendering page at {PDF_DPI} DPI")
    image = render_pdf_page_to_numpy(page)
    ocr_lines = smart_ocr(image)

    return {
        "native_text_lines": native_lines,
        "ocr_image_lines": ocr_lines,
        "combined_page_text": "\n".join(native_lines + ocr_lines),
    }


# =========================================================
# API ENDPOINT
# =========================================================

@app.post("/ocr")
def recognize(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    file_bytes = file.file.read()

    # Handle PDF Documents
    if filename.endswith(".pdf") or file.content_type == "application/pdf":
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")

        pdf_results = []
        try:
            for page_num in range(len(doc)):
                print(f"\nProcessing page {page_num + 1}/{len(doc)}")
                result = process_pdf_page(doc[page_num])
                pdf_results.append({"page": page_num + 1, **result})
        finally:
            doc.close()

        full_document_text = "\n".join(
            page["combined_page_text"] for page in pdf_results
        )

        return {
            "type": "pdf",
            "total_pages": len(pdf_results),
            "full_text": full_document_text,
            "pages": pdf_results,
        }

    # Handle Standalone Images
    elif filename.endswith((".png", ".jpg", ".jpeg", ".webp", ".tiff")):
        try:
            image = bytes_to_numpy(file_bytes)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

        lines = smart_ocr(image)
        return {"type": "image", "text": "\n".join(lines), "lines": lines}

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a PDF or an image (PNG, JPG, JPEG, WEBP, TIFF).",
        )