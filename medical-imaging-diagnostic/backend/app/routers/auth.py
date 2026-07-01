"""Auth + tenant onboarding."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from ..database import get_session
from ..deps import get_current_user, require_admin
from ..models import Organization, Role, User
from ..schemas import OrgSignup, Token, UserCreate, UserRead
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=Token, status_code=201)
def signup(payload: OrgSignup, session: Session = Depends(get_session)) -> Token:
    """Create a new organization (tenant) and its first admin in one call."""
    if session.exec(select(Organization).where(Organization.slug == payload.org_slug)).first():
        raise HTTPException(400, "Organization slug already taken")
    if session.exec(select(User).where(User.email == payload.admin_email)).first():
        raise HTTPException(400, "Email already registered")

    org = Organization(name=payload.org_name, slug=payload.org_slug)
    session.add(org)
    session.commit()
    session.refresh(org)

    admin = User(
        org_id=org.id,
        email=payload.admin_email,
        full_name=payload.admin_name,
        hashed_password=hash_password(payload.admin_password),
        role=Role.admin,
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)

    token = create_access_token(user_id=admin.id, org_id=org.id, role=admin.role.value)
    return Token(access_token=token, user_id=admin.id, org_id=org.id, role=admin.role.value)


@router.post("/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> Token:
    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    token = create_access_token(user_id=user.id, org_id=user.org_id, role=user.role.value)
    return Token(access_token=token, user_id=user.id, org_id=user.org_id, role=user.role.value)


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/users", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> User:
    """Admin adds a doctor/radiologist to their own organization."""
    if session.exec(select(User).where(User.email == payload.email)).first():
        raise HTTPException(400, "Email already registered")
    user = User(
        org_id=admin.org_id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        specialty=payload.specialty,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.get("/users", response_model=list[UserRead])
def list_users(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[User]:
    return session.exec(select(User).where(User.org_id == user.org_id)).all()
