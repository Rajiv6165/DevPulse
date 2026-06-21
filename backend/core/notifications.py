import asyncio
import httpx
import resend
from datetime import datetime
from typing import List, Dict, Any, Optional
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

async def send_slack_alert(
    service_name: str, 
    metric_type: str, 
    value: float, 
    severity: str, 
    timestamp: datetime,
    explanation: str,
    incident_context: Optional[Dict[str, Any]] = None,
    predictive_context: Optional[Dict[str, Any]] = None
):
    """Sends a rich Slack Block Kit notification containing explanations, trends, and incident grouping."""
    if not settings.SLACK_WEBHOOK_URL:
        print("[Slack] Webhook URL not configured. Slack alert skipped.")
        return
        
    emoji = "🟢"
    if severity == "critical":
        emoji = "🔴"
    elif severity == "medium":
        emoji = "🟡"
        
    is_predictive = bool(predictive_context and predictive_context.get("breached"))
    header_text = f"{emoji} DevPulse Predictive Warning" if is_predictive else f"{emoji} DevPulse Alert: Anomaly Detected"
    
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": header_text,
                "emoji": True
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Explanation:*\n{explanation}"
            }
        }
    ]

    # Add predictive information if applicable
    if is_predictive:
        minutes = predictive_context.get("predicted_breach_in_minutes", 0.0)
        blocks.append({
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"⏱️ *Predicted to breach threshold in ~{minutes:.1f} minutes*"
                }
            ]
        })

    # Add incident context if available
    if incident_context:
        summary = incident_context.get("summary", "")
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"🚨 *Part of Grouped Incident:*\n{summary}"
            }
        })

    # Add metadata fields
    blocks.append({
        "type": "section",
        "fields": [
            {"type": "mrkdwn", "text": f"*Service:* {service_name}"},
            {"type": "mrkdwn", "text": f"*Metric Type:* {metric_type}"},
            {"type": "mrkdwn", "text": f"*Value:* {value:.2f}"},
            {"type": "mrkdwn", "text": f"*Severity:* {severity.upper()}"},
            {"type": "mrkdwn", "text": f"*Detected At:* {timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}"}
        ]
    })

    # Add action button
    blocks.append({
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
    })
    
    payload = {"blocks": blocks}
    
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
    recent_metrics: List[Dict[str, Any]],
    explanation: str,
    incident_context: Optional[Dict[str, Any]] = None,
    predictive_context: Optional[Dict[str, Any]] = None
):
    """Sends a formatted HTML email alert card using Resend API."""
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

    is_predictive = bool(predictive_context and predictive_context.get("breached"))
    subject_title = "Predictive Warning" if is_predictive else "Anomaly Warning"
    
    # Conditional components for HTML email card
    predictive_html = ""
    if is_predictive:
        minutes = predictive_context.get("predicted_breach_in_minutes", 0.0)
        predictive_html = f"""
        <div style="background-color: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <strong>⏱️ Forecast Alert:</strong> Predicted to breach threshold in ~{minutes:.1f} minutes.
        </div>
        """

    incident_html = ""
    if incident_context:
        summary = incident_context.get("summary", "")
        incident_html = f"""
        <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
            <strong>🚨 Grouped Incident:</strong> {summary}
        </div>
        """
    
    html_content = f"""
    <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6;">
            <div style="background-color: #ffffff; padding: 25px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #e1e4e8; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <div style="border-bottom: 2px solid #eaecef; padding-bottom: 15px; margin-bottom: 20px;">
                    <h2 style="color: #dc3545; margin: 0; font-size: 22px;">⚠️ DevPulse {subject_title}</h2>
                </div>
                
                {predictive_html}
                {incident_html}

                <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                    <strong style="color: #495057; display: block; margin-bottom: 5px;">Description:</strong>
                    <p style="margin: 0; font-size: 15px; color: #212529;">{explanation}</p>
                </div>
                
                <table style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
                    <tr style="background-color: #f1f3f5;">
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left; font-size: 14px;">Field</th>
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left; font-size: 14px;">Value</th>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-size: 14px;">Service Name</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-weight: bold; font-size: 14px;">{service_name}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-size: 14px;">Metric Type</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; text-transform: capitalize; font-size: 14px;">{metric_type}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-size: 14px;">Trigger Value</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; color: #dc3545; font-weight: bold; font-size: 14px;">{value:.2f}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-size: 14px;">Severity</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; text-transform: uppercase; font-weight: bold; color: {'#dc3545' if severity=='critical' else '#ffc107' if severity=='medium' else '#28a745'}; font-size: 14px;">{severity}</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-size: 14px;">Detected At</td>
                        <td style="border: 1px solid #dee2e6; padding: 10px; font-size: 14px;">{timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}</td>
                    </tr>
                </table>
                
                <h3 style="color: #495057; font-size: 16px; margin-bottom: 10px;">Recent Metric History</h3>
                <table style="border-collapse: collapse; width: 100%; margin-bottom: 25px;">
                    <tr style="background-color: #f1f3f5;">
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left; font-size: 13px;">Timestamp</th>
                        <th style="border: 1px solid #dee2e6; padding: 10px; text-align: left; font-size: 13px;">Value</th>
                    </tr>
                    {table_rows}
                </table>
                
                <div style="text-align: center; margin-top: 30px; border-top: 1px solid #eaecef; padding-top: 20px;">
                    <a href="http://localhost:3000" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;">View Dashboard Panel</a>
                </div>
            </div>
        </body>
    </html>
    """
    
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: resend.Emails.send({
            "from": settings.RESEND_SENDER_EMAIL,
            "to": owner_email,
            "subject": f"[DevPulse] {severity.upper()} {subject_title}: {service_name}",
            "html": html_content
        }))
        print(f"[Resend] Email alert sent to {owner_email} for service {service_name}")
    except Exception as e:
        print(f"[Resend] Exception sending email: {e}")

async def dispatch_anomaly_notifications(
    service_id: str, 
    metric_type: str, 
    value: float, 
    severity: str, 
    timestamp: datetime,
    explanation: str,
    incident_context: Optional[Dict[str, Any]] = None,
    predictive_context: Optional[Dict[str, Any]] = None
):
    """
    Orchestrates checking notification rate-limits and spawning
    Slack webhook triggers and Resend email alerts.
    """
    # 1. Verify notification cooldown limit (5 minutes)
    in_cooldown = await check_cooldown(service_id, metric_type)
    if in_cooldown:
        print(f"[Notifications] Cooldown active for {service_id}:{metric_type}. Alert dispatch suppressed.")
        return

    # 2. Gather service details and history
    ctx = await get_alert_context(service_id, metric_type)
    
    # 3. Spawn notifications asynchronously
    await asyncio.gather(
        send_slack_alert(
            ctx["service_name"], 
            metric_type, 
            value, 
            severity, 
            timestamp,
            explanation,
            incident_context,
            predictive_context
        ),
        send_email_alert(
            ctx["owner_email"], 
            ctx["service_name"], 
            metric_type, 
            value, 
            severity, 
            timestamp, 
            ctx["recent_metrics"],
            explanation,
            incident_context,
            predictive_context
        ),
        return_exceptions=True
    )
