class ApplicationError(Exception):
    """Base class for deterministic application-service errors."""


class NotFoundError(ApplicationError):
    """Raised when a required domain record does not exist."""


class ValidationError(ApplicationError):
    """Raised when supplied data violates deterministic domain rules."""


class InvalidStateError(ApplicationError):
    """Raised when an operation is invalid for the record's current state."""


class VersionConflictError(ApplicationError):
    """Raised when a versioned insert conflicts with existing history."""
