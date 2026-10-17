import logging

from fastapi import FastAPI

from app.core import errors
from app.routers import analyses, assistant, auth, content, marketplace, me, ops, prices

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="KisanSetu API", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
errors.install(app)

for router in (ops.router, auth.router, me.router, analyses.router, assistant.router, marketplace.router, prices.router, content.router):
    app.include_router(router, prefix="/api/v1")
