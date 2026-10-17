"""Logging setup: plain, structured-enough lines; no secrets by construction."""

from __future__ import annotations

import logging


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s level=%(levelname)s logger=%(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
        force=True,
    )
    # Access logs duplicate our own middleware line.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
