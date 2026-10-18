import logging

from fastapi import FastAPI, Request

from app.core import errors
from app.core.config import get_settings
from app.routers import analyses, assistant, auth, content, irrigation, marketplace, me, ops, prices, support

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

PROD = get_settings().ENV == "prod"
# API docs only outside production: the live contract doesn't need to be public.
app = FastAPI(title="Kisan Mitra API", version="0.1.0", docs_url=None if PROD else "/api/docs",
              redoc_url=None, openapi_url=None if PROD else "/api/openapi.json")

# No CORSMiddleware on purpose: the browser reaches the API same-origin through the Next.js /api rewrite, so no
# other site may read responses, and the SameSite=Lax session cookie isn't sent on cross-site POSTs (plan §21.1).
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",  # responses carry personal data; nothing should cache them
}
if PROD:
    SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


errors.install(app)

for router in (ops.router, auth.router, me.router, analyses.router, assistant.router, marketplace.router,
               prices.router, content.router, irrigation.router, support.router):
    app.include_router(router, prefix="/api/v1")
