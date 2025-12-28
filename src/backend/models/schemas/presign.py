"""
Presigned URL response models for S3 file operations.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PresignedUploadResponse(BaseModel):
    """Response for presigned upload URL request."""

    upload_url: str = Field(..., description="Presigned PUT URL for direct S3 upload")
    file_key: str = Field(..., description="S3 object key for the uploaded file")
    expires_in: int = Field(..., description="URL expiry time in seconds")


class PresignedDownloadResponse(BaseModel):
    """Response for presigned download URL request."""

    download_url: str = Field(..., description="Presigned GET URL for direct S3 download")
    expires_in: int = Field(..., description="URL expiry time in seconds")


class PresignedUploadRequest(BaseModel):
    """Request for presigned upload URL."""

    filename: str = Field(..., description="Name of the file to upload")
    content_type: str | None = Field(None, description="MIME type of the file")
    folder: str = Field(default="sources", description="Folder within session (sources, output)")
