import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DocumentCreate(BaseModel):
    original_filename: str
    mime_type: str | None = None
    document_type: str | None = None


class DocumentOut(BaseModel):
    id: uuid.UUID
    original_filename: str
    file_path: str | None
    mime_type: str | None
    document_type: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExtractionBase(BaseModel):
    raw_llm_output: dict[str, Any]
    extracted_data: dict[str, Any]


class ExtractionCreate(ExtractionBase):
    document_type: str | None = None


class ExtractionUpdate(BaseModel):
    extracted_data: dict[str, Any]
    finalize: bool = False


class ExtractionOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    raw_llm_output: dict[str, Any]
    extracted_data: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    finalized_at: datetime | None

    model_config = {"from_attributes": True}


class DocumentWithExtraction(DocumentOut):
    extraction: ExtractionOut | None = None
