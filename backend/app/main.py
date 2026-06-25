from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import availability_blocks, groceries, habits, notifications, plans, tasks
from app.core.config import settings
from app.integrations.google_calendar import routes as google_calendar_routes
from app.integrations.gmail import routes as gmail_routes

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "weekwise-backend"}


@app.get("/api/health")
def api_health_check() -> dict[str, str]:
    return health_check()


app.include_router(tasks.router, prefix="/api")
app.include_router(habits.router, prefix="/api")
app.include_router(availability_blocks.router, prefix="/api")
app.include_router(groceries.router, prefix="/api")
app.include_router(plans.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(google_calendar_routes.router, prefix="/api")
app.include_router(gmail_routes.router, prefix="/api")

if FRONTEND_ASSETS_DIR.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_ASSETS_DIR),
        name="frontend-assets",
    )


if FRONTEND_INDEX.exists():

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_frontend_index() -> FileResponse:
        return FileResponse(FRONTEND_INDEX)

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_frontend_app(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        requested_file = FRONTEND_DIST_DIR / full_path
        if requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(FRONTEND_INDEX)
