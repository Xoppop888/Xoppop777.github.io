import base64
import io
import os
import re
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel
from paddleocr import PaddleOCR

app = FastAPI(title="Auto China Calculator PaddleOCR")
SERVICE_TOKEN = os.getenv("PADDLEOCR_SERVICE_TOKEN", "")


class OCRRequest(BaseModel):
    image: str


@lru_cache(maxsize=1)
def get_ocr():
    # Chinese + English is the relevant combination for Chinese vehicle plates.
    return PaddleOCR(lang="ch", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)


def decode_image(value: str) -> np.ndarray:
    match = re.match(r"^data:image/[^;]+;base64,(.+)$", value, re.S)
    raw = base64.b64decode(match.group(1) if match else value, validate=True)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    if image.width * image.height > 16_000_000:
        raise ValueError("image is too large")
    return np.asarray(image)


def to_box(poly) -> list[float] | None:
    """Полигон PaddleOCR -> [x_min, y_min, x_max, y_max]."""
    try:
        points = np.asarray(poly, dtype=float).reshape(-1, 2)
    except (ValueError, TypeError):
        return None
    if points.size == 0:
        return None
    return [
        float(points[:, 0].min()),
        float(points[:, 1].min()),
        float(points[:, 0].max()),
        float(points[:, 1].max()),
    ]


@app.get("/health")
def health():
    return {"ok": True, "provider": "PaddleOCR", "model": "PP-OCRv5"}


@app.post("/ocr")
def ocr(request: OCRRequest, x_service_token: str | None = Header(default=None)):
    if SERVICE_TOKEN and x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="invalid service token")
    try:
        image = decode_image(request.image)
        result = get_ocr().predict(image)
        lines = []
        for page in result:
            data = getattr(page, "json", None)
            data = data() if callable(data) else data
            data = data or {}
            res = data.get("res", data)
            texts = res.get("rec_texts", [])
            scores = res.get("rec_scores", [])
            # Рамки нужны парсеру шильдика: значение берётся из бокса справа/снизу от метки поля.
            polys = res.get("rec_polys", res.get("dt_polys", []))
            for i, text in enumerate(texts):
                if str(text).strip():
                    lines.append(
                        {
                            "text": str(text).strip(),
                            "confidence": float(scores[i]) if i < len(scores) else None,
                            "box": to_box(polys[i]) if i < len(polys) else None,
                        }
                    )
        return {"lines": lines, "provider": "PaddleOCR", "model": "PP-OCRv5"}
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"OCR failed: {exc}") from exc
