from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.availability_block import AvailabilityBlock
from app.schemas.availability_block import (
    AvailabilityBlockCreate,
    AvailabilityBlockRead,
    AvailabilityBlockUpdate,
)
from app.services.dev_user import ensure_dev_user

router = APIRouter(prefix="/availability-blocks", tags=["availability-blocks"])


@router.post("", response_model=AvailabilityBlockRead, status_code=status.HTTP_201_CREATED)
def create_availability_block(
    payload: AvailabilityBlockCreate, db: Session = Depends(get_db)
) -> AvailabilityBlock:
    ensure_dev_user(db, payload.user_id)
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")
    availability_block = AvailabilityBlock(**payload.model_dump())
    db.add(availability_block)
    db.commit()
    db.refresh(availability_block)
    return availability_block


@router.get("", response_model=list[AvailabilityBlockRead])
def list_availability_blocks(
    start_from: datetime | None = None,
    end_to: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[AvailabilityBlock]:
    query = select(AvailabilityBlock)
    if start_from is not None:
        query = query.where(AvailabilityBlock.end_time >= start_from)
    if end_to is not None:
        query = query.where(AvailabilityBlock.start_time <= end_to)
    return list(db.scalars(query.order_by(AvailabilityBlock.start_time.asc())).all())


@router.get("/{availability_block_id}", response_model=AvailabilityBlockRead)
def get_availability_block(
    availability_block_id: int, db: Session = Depends(get_db)
) -> AvailabilityBlock:
    availability_block = db.get(AvailabilityBlock, availability_block_id)
    if availability_block is None:
        raise HTTPException(status_code=404, detail="Availability block not found")
    return availability_block


@router.patch("/{availability_block_id}", response_model=AvailabilityBlockRead)
def update_availability_block(
    availability_block_id: int,
    payload: AvailabilityBlockUpdate,
    db: Session = Depends(get_db),
) -> AvailabilityBlock:
    availability_block = db.get(AvailabilityBlock, availability_block_id)
    if availability_block is None:
        raise HTTPException(status_code=404, detail="Availability block not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(availability_block, field, value)

    if availability_block.end_time <= availability_block.start_time:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")

    db.add(availability_block)
    db.commit()
    db.refresh(availability_block)
    return availability_block


@router.delete("/{availability_block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_availability_block(
    availability_block_id: int, db: Session = Depends(get_db)
) -> None:
    availability_block = db.get(AvailabilityBlock, availability_block_id)
    if availability_block is None:
        raise HTTPException(status_code=404, detail="Availability block not found")
    db.delete(availability_block)
    db.commit()
