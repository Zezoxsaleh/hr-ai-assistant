from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.ai.providers.errors import (
    ProviderError,
    ProviderInvalidRequestError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from app.api.v1.router import api_router
from app.core.config import settings
from app.services.errors import (
    ConflictError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
    VersionConflictError,
)


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, debug=settings.debug)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=settings.cors_allow_methods,
        allow_headers=["*"],
    )

    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(InvalidStateError)
    async def invalid_state_handler(request: Request, exc: InvalidStateError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(VersionConflictError)
    async def version_conflict_handler(request: Request, exc: VersionConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(ProviderRateLimitError)
    async def provider_rate_limit_handler(
        request: Request, exc: ProviderRateLimitError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={
                "detail": "AI provider rate limit reached. Try again later.",
                "error_type": "rate_limit",
            },
        )

    @app.exception_handler(ProviderError)
    async def provider_error_handler(request: Request, exc: ProviderError) -> JSONResponse:
        if isinstance(exc, ProviderTimeoutError):
            message = "AI provider timed out. Try again."
            error_type = "timeout"
        elif isinstance(exc, ProviderInvalidRequestError):
            message = "AI provider rejected the request."
            error_type = "invalid_request"
        else:
            message = "AI provider is currently unavailable. Try again."
            error_type = "unavailable"
        return JSONResponse(
            status_code=503,
            content={
                "detail": message,
                "error_type": error_type,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
