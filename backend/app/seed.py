"""Idempotent seed: disease classes plus one demo account per role.

Run: python -m app.seed   (needs SEED_DEMO_PASSWORD in the environment or .env)
"""

import sys

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.ml.inference import labels
from app.models import DiseaseClass, User

DEMO_USERS = [
    {"phone": "9000000001", "name": "Demo Admin", "role": "admin", "customer_type": None},
    {"phone": "9000000002", "name": "Demo Farmer (Ramesh)", "role": "farmer", "customer_type": None},
    {"phone": "9000000003", "name": "Demo Farmer (Sunita)", "role": "farmer", "customer_type": None},
    {"phone": "9000000004", "name": "Demo Retail Buyer", "role": "customer", "customer_type": "retail"},
    {"phone": "9000000005", "name": "Demo Wholesaler", "role": "customer", "customer_type": "wholesale"},
]


def seed(db: Session, password: str) -> None:
    for c in labels():
        row = {k: c[k] for k in ("code", "crop_code", "name_en", "name_hi", "is_healthy")}
        db.execute(insert(DiseaseClass).values(**row)
                   .on_conflict_do_update(index_elements=["code"], set_=row))
    password_hash = hash_password(password)
    for u in DEMO_USERS:
        db.execute(insert(User).values(**u, password_hash=password_hash, language="hi",
                                       state="Delhi", district="New Delhi")
                   .on_conflict_do_nothing(index_elements=["phone"]))
    db.commit()


if __name__ == "__main__":
    password = get_settings().SEED_DEMO_PASSWORD
    if len(password) < 8:
        sys.exit("Set SEED_DEMO_PASSWORD (min 8 characters) before seeding.")
    with SessionLocal() as session:
        seed(session, password)
    print(f"Seeded {len(labels())} disease classes and {len(DEMO_USERS)} demo users.")
