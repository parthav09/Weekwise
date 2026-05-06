from sqlalchemy.orm import Session

from app.models.user import User


def ensure_dev_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user:
        return user

    user = User(
        id=user_id,
        name="Development User",
        email=f"dev-user-{user_id}@weekwise.local",
    )
    db.add(user)
    db.flush()
    return user

