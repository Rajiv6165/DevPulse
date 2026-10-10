from core.database import get_db_cursor
from core.security import create_access_token, get_password_hash, verify_password
from fastapi import APIRouter, HTTPException, status
from models.user import TokenResponse, UserLogin, UserRegister
from psycopg2.errors import UniqueViolation

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister):
    """Register a new user and return a JWT access token."""
    email = payload.email.lower().strip()
    if not email or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required"
        )
    
    hashed_pwd = get_password_hash(payload.password)
    
    try:
        with get_db_cursor() as cur:
            cur.execute(
                "INSERT INTO users (email, hashed_password) VALUES (%s, %s) RETURNING id",
                (email, hashed_pwd)
            )
            user = cur.fetchone()
            user_id = user["id"]
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error occurred: {e!s}"
        )
        
    access_token = create_access_token(data={"sub": str(user_id)})
    return TokenResponse(access_token=access_token)

@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin):
    """Authenticate credentials and return a JWT access token."""
    email = payload.email.lower().strip()
    
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id, hashed_password FROM users WHERE email = %s",
            (email,)
        )
        user = cur.fetchone()
        
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": str(user["id"])})
    return TokenResponse(access_token=access_token)
