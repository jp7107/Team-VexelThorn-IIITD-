"""Platform parameters the admin maintains from the console instead of code.

One JSON row (platform_settings.key = "platform"), validated by PlatformConfig; missing keys take the defaults
below. Secrets (payment gateway keys, data.gov.in key) stay in the environment, never in the database.
"""

import time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PlatformSetting

KEY = "platform"


class PlatformConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Payments
    payments_online: bool = True  # only offered when the gateway keys are configured too
    payments_upi: bool = True
    payments_cash: bool = True
    platform_fee_percent: Decimal = Field(Decimal("0"), ge=0, le=10, max_digits=4, decimal_places=2)
    unpaid_order_hours: int = Field(48, ge=1, le=720)  # unpaid orders are cancelled and stock returned after this

    # Help page. Defaults are the Kisan Call Centre facts checked on dackkms.gov.in (2026-10-17).
    helpline_number: str = Field("1800-180-1551", max_length=30)
    helpline_short: str = Field("1551", max_length=10)
    helpline_open_hour: int = Field(6, ge=0, le=23)
    helpline_close_hour: int = Field(22, ge=1, le=24)
    helpline_languages: int = Field(22, ge=1, le=50)
    support_phone: str = Field("", max_length=20)
    support_email: str = Field("", max_length=120)

    # Features
    show_demo_prices: bool = False  # labelled demo mandi rows when no live price source is configured
    assistant_enabled: bool = True
    announcement: str = Field("", max_length=300)  # shown on every signed-in page while set


_cache: tuple[float, PlatformConfig] | None = None
TTL_S = 30


def get_config(db: Session) -> PlatformConfig:
    global _cache
    if _cache and time.monotonic() - _cache[0] < TTL_S:
        return _cache[1]
    row = db.get(PlatformSetting, KEY)
    config = PlatformConfig(**(row.value if row else {}))
    _cache = (time.monotonic(), config)
    return config


def save_config(db: Session, config: PlatformConfig, admin_id) -> PlatformConfig:
    global _cache
    row = db.get(PlatformSetting, KEY)
    value = config.model_dump(mode="json")
    if row is None:
        db.add(PlatformSetting(key=KEY, value=value, updated_by=admin_id))
    else:
        row.value, row.updated_by = value, admin_id
    db.commit()
    _cache = None
    return config


def reset_cache() -> None:
    global _cache
    _cache = None


def online_payments_configured() -> bool:
    s = get_settings()
    return bool(s.RAZORPAY_KEY_ID and s.RAZORPAY_KEY_SECRET)
