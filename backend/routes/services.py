import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from core.database import get_db_cursor
from core.security import get_current_user_id
from models.service import ServiceCreate, ServiceResponse

router = APIRouter(prefix="/services", tags=["services"])

@router.get("/", response_model=List[ServiceResponse])
def list_services(current_user_id: str = Depends(get_current_user_id)):
    """Retrieve all services owned by the authenticated user."""
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id, name, description, api_key, owner_id, created_at, is_active "
            "FROM services WHERE owner_id = %s AND is_active = TRUE "
            "ORDER BY created_at DESC",
            (current_user_id,)
        )
        services = cur.fetchall()
    return services

@router.post("/", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(payload: ServiceCreate, current_user_id: str = Depends(get_current_user_id)):
    """Create a new monitored service and generate a unique API key for the SDK."""
    if not payload.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Service name cannot be empty"
        )
        
    # Generate a unique API key with prefix
    api_key = f"dp_{secrets.token_hex(24)}"
    
    try:
        with get_db_cursor() as cur:
            cur.execute(
                "INSERT INTO services (name, description, api_key, owner_id) "
                "VALUES (%s, %s, %s, %s) "
                "RETURNING id, name, description, api_key, owner_id, created_at, is_active",
                (payload.name.strip(), payload.description, api_key, current_user_id)
            )
            new_service = cur.fetchone()
    except Exception as e:
         raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during service creation: {str(e)}"
        )
        
    return new_service
