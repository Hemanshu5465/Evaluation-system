from __future__ import annotations

from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func
from sqlalchemy.orm import Session

T = TypeVar("T")


class PageParams(BaseModel):
    page: int = 1
    page_size: int = 20


def page_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    total_pages: int


def paginate(db: Session, stmt: Select, params: PageParams) -> tuple[list, int, int]:
    total = db.scalar(select_count(stmt)) or 0
    total_pages = max(1, (total + params.page_size - 1) // params.page_size)
    rows = db.scalars(
        stmt.limit(params.page_size).offset((params.page - 1) * params.page_size)
    ).all()
    return list(rows), total, total_pages


def select_count(stmt: Select):
    return stmt.with_only_columns(func.count()).order_by(None)
