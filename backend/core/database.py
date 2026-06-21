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

def init_db():
    """Initializes database tables like incidents if they don't exist."""
    print("[Database] Ensuring database tables and indexes exist...")
    try:
        with get_db_cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS incidents (
                    id UUID PRIMARY KEY,
                    root_cause_service_id UUID REFERENCES services(id) ON DELETE CASCADE,
                    affected_service_ids UUID[] NOT NULL,
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    resolved_at TIMESTAMP WITH TIME ZONE,
                    summary TEXT
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents (started_at);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_incidents_resolved_at ON incidents (resolved_at);")
        print("[Database] Database initialization succeeded.")
    except Exception as e:
        print(f"[Database] Error initializing database tables: {e}")

