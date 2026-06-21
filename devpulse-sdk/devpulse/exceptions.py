class DevPulseError(Exception):
    """Base exception for DevPulse SDK."""
    pass

class DevPulseConnectionError(DevPulseError):
    """Raised when the DevPulse server is unreachable during configuration or health checks."""
    pass

class DevPulseConfigError(DevPulseError):
    """Raised on invalid SDK configuration settings (e.g. missing api_key)."""
    pass
