"""Enumerations used across HomeSOC components."""

from enum import Enum


class Platform(str, Enum):
    MACOS = "macos"
    NETWORK = "network"


class EventCategory(str, Enum):
    PROCESS = "process"
    FILE = "file"
    NETWORK = "network"
    AUTHENTICATION = "auth"
    AUTHORIZATION = "authz"
    SERVICE = "service"
    SYSTEM = "system"


class Severity(str, Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AgentStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


class AlertStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"
