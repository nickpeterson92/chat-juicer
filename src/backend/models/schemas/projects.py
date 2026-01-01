"""
Project-related API schemas.

Provides request/response models for project CRUD operations.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.schemas.base import PaginationMeta

# =============================================================================
# Request Models
# =============================================================================


class CreateProjectRequest(BaseModel):
    """Request body for creating a new project."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Q1 Research",
                "description": "Market research and competitive analysis for Q1",
            }
        }
    )

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Project name",
        json_schema_extra={"example": "Q1 Research"},
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
        description="Project description",
        json_schema_extra={"example": "Market research and competitive analysis"},
    )


class UpdateProjectRequest(BaseModel):
    """Request body for updating an existing project."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Q1 Research Updated",
                "description": "Updated description",
            }
        }
    )

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="Updated project name",
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
        description="Updated project description",
    )


# =============================================================================
# Response Models
# =============================================================================


class ProjectResponse(BaseModel):
    """Project entity with all metadata."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Q1 Research",
                "description": "Market research and competitive analysis",
                "session_count": 5,
                "created_at": "2026-01-01T10:00:00Z",
                "updated_at": "2026-01-01T12:00:00Z",
            }
        }
    )

    id: str = Field(..., description="Project UUID")
    name: str = Field(..., description="Project name")
    description: str | None = Field(default=None, description="Project description")
    session_count: int = Field(default=0, description="Number of sessions in project")
    created_at: datetime | None = Field(default=None, description="Creation timestamp")
    updated_at: datetime | None = Field(default=None, description="Last update timestamp")


class ProjectListResponse(BaseModel):
    """Paginated list of projects."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "projects": [
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "name": "Q1 Research",
                        "session_count": 5,
                    }
                ],
                "pagination": {
                    "offset": 0,
                    "limit": 50,
                    "total_count": 1,
                    "has_more": False,
                },
            }
        }
    )

    projects: list[ProjectResponse] = Field(..., description="List of projects")
    pagination: PaginationMeta = Field(..., description="Pagination metadata")


class DeleteProjectResponse(BaseModel):
    """Response from project deletion."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Project deleted successfully",
            }
        }
    )

    success: bool = Field(..., description="Whether the operation succeeded")
    message: str | None = Field(default=None, description="Result message")
