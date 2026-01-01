"""
Project management API routes.

Provides CRUD operations for projects.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from api.dependencies import Projects
from api.middleware.auth import CurrentUser
from models.schemas.base import PaginationMeta
from models.schemas.projects import (
    CreateProjectRequest,
    DeleteProjectResponse,
    ProjectListResponse,
    ProjectResponse,
    UpdateProjectRequest,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
    description="Create a new project for organizing sessions and context.",
)
async def create_project(
    request: CreateProjectRequest,
    user: CurrentUser,
    projects: Projects,
) -> ProjectResponse:
    """Create a new project."""
    result = await projects.create_project(
        user_id=user["id"],
        name=request.name,
        description=request.description,
    )
    return ProjectResponse(**result)


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List all projects",
    description="Get paginated list of user's projects.",
)
async def list_projects(
    user: CurrentUser,
    projects: Projects,
    offset: int = 0,
    limit: int = 50,
) -> ProjectListResponse:
    """List all projects for the current user."""
    result = await projects.list_projects(
        user_id=user["id"],
        offset=offset,
        limit=limit,
    )
    return ProjectListResponse(
        projects=[ProjectResponse(**p) for p in result["projects"]],
        pagination=PaginationMeta(
            offset=offset,
            limit=limit,
            total_count=result["total_count"],
            has_more=result["has_more"],
        ),
    )


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a specific project",
    description="Get project details by ID.",
)
async def get_project(
    project_id: UUID,
    user: CurrentUser,
    projects: Projects,
) -> ProjectResponse:
    """Get a specific project."""
    result = await projects.get_project(user_id=user["id"], project_id=project_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return ProjectResponse(**result)


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update a project",
    description="Update project name or description.",
)
async def update_project(
    project_id: UUID,
    request: UpdateProjectRequest,
    user: CurrentUser,
    projects: Projects,
) -> ProjectResponse:
    """Update a project."""
    result = await projects.update_project(
        user_id=user["id"],
        project_id=project_id,
        name=request.name,
        description=request.description,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return ProjectResponse(**result)


@router.delete(
    "/{project_id}",
    response_model=DeleteProjectResponse,
    summary="Delete a project",
    description="Delete a project. Sessions are preserved but unassigned.",
)
async def delete_project(
    project_id: UUID,
    user: CurrentUser,
    projects: Projects,
) -> DeleteProjectResponse:
    """Delete a project."""
    deleted = await projects.delete_project(user_id=user["id"], project_id=project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return DeleteProjectResponse(
        success=True,
        message="Project deleted successfully",
    )
