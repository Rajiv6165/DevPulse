import json
import asyncio
from datetime import datetime, timezone
from core.config import settings
from core.database import get_db_cursor

try:
    import boto3
    from botocore.exceptions import NoCredentialsError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

def format_metric_row(row: dict) -> dict:
    """Formats a database metric row to a standard JSON serializable dict."""
    return {
        "id": str(row["id"]),
        "service_id": str(row["service_id"]),
        "metric_type": row["metric_type"],
        "value": float(row["value"]),
        "timestamp": row["timestamp"].isoformat(),
        "metadata": row["metadata"]
    }

async def archive_service_metrics(service_id: str, service_name: str) -> int:
    """
    Archives metrics older than 24 hours for a specific service.
    Uploads them to S3 and deletes the rows from Supabase.
    """
    if not BOTO3_AVAILABLE:
        print("[Archiver] Skipping archival (boto3 library not installed)")
        return 0
        
    if not settings.AWS_S3_BUCKET_NAME or not settings.AWS_ACCESS_KEY_ID:
        print("[Archiver] Skipping S3 archival (AWS credentials or bucket name not configured)")
        return 0

    # 1. Fetch metrics older than 24 hours
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id, service_id, metric_type, value, timestamp, metadata "
            "FROM metrics "
            "WHERE service_id = %s AND timestamp < NOW() - INTERVAL '24 hours' "
            "ORDER BY timestamp ASC",
            (service_id,)
        )
        rows = cur.fetchall()

    if not rows:
        return 0

    print(f"[Archiver] Found {len(rows)} historical metrics to archive for service: {service_name}")

    # 2. Format as JSONL (newline-delimited JSON)
    jsonl_lines = [json.dumps(format_metric_row(row)) for row in rows]
    jsonl_content = "\n".join(jsonl_lines)

    # 3. Create the S3 partition key path
    now = datetime.now(timezone.utc)
    key_path = f"logs/{now.year}/{now.month:02d}/{now.day:02d}/{service_id}.jsonl"

    # 4. Upload to S3 (run in execution thread to keep loop unblocked)
    try:
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: s3_client.put_object(
                Bucket=settings.AWS_S3_BUCKET_NAME,
                Key=key_path,
                Body=jsonl_content.encode("utf-8")
            )
        )
        print(f"[Archiver] Uploaded {len(rows)} metrics to S3: s3://{settings.AWS_S3_BUCKET_NAME}/{key_path}")
    except NoCredentialsError:
        print("[Archiver] AWS S3 credentials invalid or not provided.")
        return 0
    except Exception as e:
        print(f"[Archiver] S3 Upload failed for {service_id}: {e}")
        return 0

    # 5. Delete metrics from database that were successfully archived
    metric_ids = [str(row["id"]) for row in rows]
    
    # Process deletions in chunks of 500
    chunk_size = 500
    deleted_count = 0
    
    for i in range(0, len(metric_ids), chunk_size):
        chunk = metric_ids[i:i+chunk_size]
        try:
            with get_db_cursor() as cur:
                # Construct query dynamically to match chunk length
                placeholders = ",".join(["%s"] * len(chunk))
                cur.execute(
                    f"DELETE FROM metrics WHERE id IN ({placeholders})",
                    tuple(chunk)
                )
                deleted_count += cur.rowcount
        except Exception as e:
            print(f"[Archiver] DB deletion failed for chunk starting at index {i}: {e}")
            # Do not proceed with deleting other chunks if a db error happens
            break

    print(f"[Archiver] Successfully purged {deleted_count} archived metrics from Supabase database")
    return deleted_count

async def run_log_archiver():
    """Main batch job checking and archiving logs for all active services."""
    print("[Archiver] Starting hourly S3 metric log archival job...")
    
    with get_db_cursor() as cur:
        cur.execute("SELECT id, name FROM services WHERE is_active = TRUE")
        services = cur.fetchall()

    if not services:
        print("[Archiver] No services active to process.")
        return

    total_purged = 0
    for service in services:
        purged = await archive_service_metrics(str(service["id"]), service["name"])
        total_purged += purged

    print(f"[Archiver] hourly S3 metric archival job finished. Total rows purged: {total_purged}")
