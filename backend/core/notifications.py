import asyncio
import httpx
import resend
from datetime import datetime
from typing import List, Dict, Any
from core.config import settings
from core.database import get_db_cursor
from core.redis import async_redis_client

# Configure resend key globally
resend.api_key = settings.RESEND_API_KEY

async def check_cooldown(service_id: str, metric_type: str) -> bool:
    """
    Checks if a notification cooldown is active for this service and metric type.
    Returns True if cooldown is active, False otherwise.
    """
    cooldown_key = f"devpulse:cooldown:{service_id}:{metric_type}"
    try:
        exists = await async_redis_client.get(cooldown_key)
        if exists:
            return True
            
        # Set cooldown key with a 5-minute (300s) TTL
        await async_redis_client.set(cooldown_key, "active", ex=300)
        return False
    except Exception as e:
        print(f"[Cooldown] Redis error checking cooldown: {e}")
        # Default to false in case of Redis failure so we don't block critical notifications
        return False

async def get_alert_context(service_id: str, metric_type: str) -> Dict[str, Any]:
    """Retrieves service owner email, service name, and historical metrics for alert copy."""
    context = {
        "service_name": "Unknown Service",
        "owner_email": "alerts@devpulse.com",
        "recent_metrics": []
    }
    
    try:
        with get_db_cursor() as cur:
            # Get Service & Owner details
            cur.execute(
                "SELECT s.name as service_name, u.email as owner_email "
                "FROM services s "
                "JOIN users u ON s.owner_id = u.id "
                "WHERE s.id = %s",
                (service_id,)
            )
            srv_record = cur.fetchone()
            if srv_record:
                context["service_name"] = srv_record["service_name"]
                context["owner_email"] = srv_record["owner_email"]
                
            # Get recent 5 metrics
            cur.execute(
                "SELECT timestamp, value FROM metrics "
                "WHERE service_id = %s AND metric_type = %s "
                "ORDER BY timestamp DESC LIMIT 5",
                (service_id, metric_type)
            )
            history = cur.fetchall()
            context["recent_metrics"] = [
                {"timestamp": row["timestamp"].strftime("%Y-%m-%d %H:%M:%S UTC"), "value": float(row["value"])}
                for row in history
            ]
    except Exception as e:
        print(f"[Notifications] Error fetching alert context: {e}")
        
    return context

async def send_slack_alert(service_name: str, metric_type: str, value: float, severity: str, timestamp: datetime):
    """Sends a rich Slack Block Kit notification for the anomaly."""
    if not settings.SLACK_WEBHOOK_URL:
        print("[Slack] Webhook URL not configured. Slack alert skipped.")
        return
        
    emoji = "🟢"
    if severity == "critical":
        emoji = "🔴"
    elif severity == "medium":
        emoji = "🟡"
        
    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} DevPulse Alert: Anomaly Detected",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Service:* {service_name}"},
                    {"type": "mrkdwn", "text": f"*Metric Type:* {metric_type}"},
                    {"type": "mrkdwn", "text": f"*Value:* {value:.2f}"},
                    {"type": "mrkdwn", "text": f"*Severity:* {severity.upper()}"},
                    {"type": "mrkdwn", "text": f"*Detected At:* {timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}"}
                ]
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View Dashboard"
                        },
                        "url": "http://localhost:3000",
                        "style": "primary"
                      }
                ]
            }
        ]
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(settings.SLACK_WEBHOOK_URL, json=payload, timeout=5.0)
            if resp.status_code == 200:
                print(f"[Slack] Alert sent for service: {service_name}")
            else:
                print(f"[Slack] Webhook failed with status {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[Slack] Exception sending alert: {e}")

async def send_email_alert(
    owner_email: str, 
    service_name: str, 
    metric_type: str, 
    value: float, 
    severity: str, 
    timestamp: datetime, 
    recent_metrics: List[Dict[str, Any]]
):
    """Sends a formatted HTML email alert using Resend API."""
    if not settings.RESEND_API_KEY:
        print("[Resend] Resend API key not configured. Email alert skipped.")
        return
        
    table_rows = "".join(
        f"<tr>"
        f"<td style='border: 1px solid #ddd; padding: 8px;'>{m['timestamp']}</td>"
        f"<td style='border: 1px solid #ddd; padding: 8px;'>{m['value']:.2f}</td>"
        f"</tr>"
        for m in recent_metrics
    )
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; max-width: 600px; margin: 0 auto; border: 1px solid #e9ecef;">
                <h2 style="color: #dc3545; margin-top: 0;">⚠️ DevPulse Anomaly Warning</h2>
                <p>An anomalous reading has been detected in your monitored service:</p>
                
                <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
                    <tr style="background-color: #f1f3f5;">
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left;">Field</th>
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left;">Value</th>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">Service Name</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-weight: bold;">{service_name}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">Metric Type</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">{metric_type}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">Trigger Value</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; color: #dc3545; font-weight: bold;">{value:.2f}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">Severity</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; text-transform: uppercase; font-weight: bold; color: #ffc107;">{severity}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">Detected At</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px;">{timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}</td>
                    </tr>
                </table>
                
                <h3 style="color: #495057;">Recent Metrics Table</h3>
                <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
                    <tr style="background-color: #f1f3f5;">
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left;">Timestamp</th>
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left;">Value</th>
                    </tr>
                    {table_rows}
                </table>
                
                <p style="text-align: center; margin-top: 30px;">
                    <a href="http://localhost:3000" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">View Dashboard Panel</a>
                </p>
            </div>
        </body>
    </html>
    """
    
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: resend.Emails.send({
            "from": settings.RESEND_SENDER_EMAIL,
            "to": owner_email,
            "subject": f"[DevPulse] {severity.upper()} Alert: Anomaly in {service_name}",
            "html": html_content
        }))
        print(f"[Resend] Email alert sent to {owner_email} for service {service_name}")
    except Exception as e:
        print(f"[Resend] Exception sending email: {e}")

async def dispatch_anomaly_notifications(service_id: str, metric_type: str, value: float, severity: str, timestamp: datetime):
    """
    Orchestrates checking notification rate-limits and spawning
    Slack webhook triggers and Resend email alerts.
    """
    # 1. Verify notification cooldown limit (5 minutes)
    in_cooldown = await check_cooldown(service_id, metric_type)
    if in_cooldown:
        print(f"[Notifications] Cooldown active for {service_id}:{metric_type}. Alert dispatch skipped.")
        return

    # 2. Gather service details and history
    ctx = await get_alert_context(service_id, metric_type)
    
    # 3. Spawn notifications asynchronously
    await asyncio.gather(
        send_slack_alert(ctx["service_name"], metric_type, value, severity, timestamp),
        send_email_alert(ctx["owner_email"], ctx["service_name"], metric_type, value, severity, timestamp, ctx["recent_metrics"]),
        return_exceptions=True
    )
