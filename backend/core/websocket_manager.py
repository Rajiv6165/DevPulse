from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # Map of user_id (str) -> Set of active WebSockets
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        """Accept connection and track it under the user's ID."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        """Untrack websocket connection on disconnection."""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: str, message: Any):
        """Send message to all active websocket connections of a specific user."""
        if user_id in self.active_connections:
            # Copy set to list to prevent size changes during iteration
            websockets = list(self.active_connections[user_id])
            for websocket in websockets:
                try:
                    await websocket.send_json(message)
                except Exception:
                    self.disconnect(user_id, websocket)

    async def broadcast_alert(self, service_owner_id: str, alert_data: Any):
        """Broadcasts an anomaly alert immediately to the service owner if connected."""
        await self.broadcast_to_user(service_owner_id, {
            "event": "alert",
            "data": alert_data
        })

# Instantiate the global manager
manager = ConnectionManager()
