import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from supabase import create_client, Client
from core.config import settings

# Initialize the Supabase Client
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

@contextmanager
def get_db_connection():
    """Context manager for obtaining a raw psycopg2 connection."""
    conn = psycopg2.connect(settings.SUPABASE_DB_URL)
    try:
        yield conn
    finally:
        conn.close()

@contextmanager
def get_db_cursor():
    """Context manager for obtaining a database cursor with automatic transaction handling."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                yield cur
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
