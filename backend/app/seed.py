"""Idempotent setup. By default it adds nothing but what the app needs to run:

  python -m app.seed                   disease classes (from the model's labels) and, if ADMIN_PHONE and
                                       ADMIN_PASSWORD are set, the first admin account
  python -m app.seed --content         also load the verified starter schemes and knowledge-base articles
                                       (admins can edit or delete them afterwards)
  python -m app.seed --demo            also add demo users, [DEMO] listings and labelled demo prices
                                       (needs SEED_DEMO_PASSWORD; for local testing only)
  python -m app.seed --purge-demo      remove every demo account, [DEMO] listing and demo price row

Everything else (crops, settings, prices, schemes, updates, articles) is maintained from the admin console.
"""

import argparse
import sys
from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.kb_articles import KB_ARTICLES, PRODUCTIVITY_ARTICLES
from app.ml.inference import labels

from app.models import DiseaseClass, Enquiry, KbArticle, Listing, MarketPrice, Order, Scheme, User

DEMO_USERS = [
    {"phone": "9000000001", "name": "Demo Admin", "role": "admin", "customer_type": None},
    {"phone": "9000000002", "name": "Demo Farmer (Ramesh)", "role": "farmer", "customer_type": None},
    {"phone": "9000000003", "name": "Demo Farmer (Sunita)", "role": "farmer", "customer_type": None},
    {"phone": "9000000004", "name": "Demo Retail Buyer", "role": "customer", "customer_type": "retail"},
    {"phone": "9000000005", "name": "Demo Wholesaler", "role": "customer", "customer_type": "wholesale"},
]


def seed_required(db: Session) -> list[str]:
    done = []
    for c in labels():
        row = {k: c[k] for k in ("code", "crop_code", "name_en", "name_hi", "is_healthy")}
        db.execute(insert(DiseaseClass).values(**row)
                   .on_conflict_do_update(index_elements=["code"], set_=row))
    done.append(f"{len(labels())} disease classes")
    s = get_settings()
    if s.ADMIN_PHONE and s.ADMIN_PASSWORD:
        if len(s.ADMIN_PASSWORD) < 8:
            sys.exit("ADMIN_PASSWORD must be at least 8 characters.")
        db.execute(insert(User).values(phone=s.ADMIN_PHONE, name=s.ADMIN_NAME, role="admin",
                                       password_hash=hash_password(s.ADMIN_PASSWORD), language="en",
                                       state="Delhi", district="New Delhi")
                   .on_conflict_do_nothing(index_elements=["phone"]))
        done.append(f"admin {s.ADMIN_PHONE}")
    db.commit()
    return done


def seed_content(db: Session) -> None:
    _seed_schemes(db)
    _seed_kb(db)
    db.commit()


def seed_demo(db: Session, password: str) -> None:
    password_hash = hash_password(password)
    for u in DEMO_USERS:
        db.execute(insert(User).values(**u, password_hash=password_hash, language="hi",
                                       state="Delhi", district="New Delhi")
                   .on_conflict_do_nothing(index_elements=["phone"]))
    db.flush()
    _seed_demo_listings(db)
    _seed_demo_prices(db)
    db.commit()


def purge_demo(db: Session) -> dict[str, int]:
    # Admins are kept so the console stays reachable; replace them via ADMIN_PHONE and block the demo one.
    demo_ids = list(db.scalars(select(User.id).where(User.phone.in_([u["phone"] for u in DEMO_USERS]),
                                                     User.role != "admin")))
    demo_listings = select(Listing.id).where(Listing.title.like("[DEMO]%") | Listing.farmer_id.in_(demo_ids))
    touched = Order.listing_id.in_(demo_listings) | Order.buyer_id.in_(demo_ids) | Order.farmer_id.in_(demo_ids)
    counts = {
        "orders": db.execute(delete(Order).where(touched)).rowcount,
        "enquiries": db.execute(delete(Enquiry).where(Enquiry.listing_id.in_(demo_listings)
                                                      | Enquiry.buyer_id.in_(demo_ids))).rowcount,
        "listings": db.execute(delete(Listing).where(Listing.id.in_(demo_listings))).rowcount,
        "users": db.execute(delete(User).where(User.id.in_(demo_ids))).rowcount,
        "prices": db.execute(delete(MarketPrice).where(MarketPrice.is_demo.is_(True))).rowcount,
    }
    db.commit()
    return counts


# Visibly labelled so nobody mistakes them for real produce (plan §7).
DEMO_LISTINGS = [
    ("9000000002", "tomato", "[DEMO] Hybrid tomatoes, firm and red", "8", "quintal", "1600", "1"),
    ("9000000002", "potato", "[DEMO] Potatoes, cold-store grade", "40", "quintal", "1100", "5"),
    ("9000000003", "maize", "[DEMO] Dry maize grain", "500", "kg", "22", None),
]


def _seed_demo_listings(db: Session) -> None:
    for phone, crop, title, qty, unit, price, min_qty in DEMO_LISTINGS:
        farmer = db.scalar(select(User).where(User.phone == phone))
        if farmer is None or db.scalar(select(Listing.id).where(Listing.farmer_id == farmer.id,
                                                                Listing.title == title)):
            continue
        db.add(Listing(farmer_id=farmer.id, crop_code=crop, title=title, quantity=Decimal(qty), unit=unit,
                       price_per_unit=Decimal(price), min_order_qty=Decimal(min_qty) if min_qty else None,
                       description="Demo listing for testing the marketplace.",
                       state=farmer.state, district=farmer.district))


# Demo mandi prices for when no DATAGOV_API_KEY is set. Flagged is_demo, so every screen labels them
# "demo data, not real prices" (plan §14.2). The numbers are placeholders, not market data.
DEMO_PRICES = [
    ("Tomato", "Delhi", "North Delhi", "Azadpur", 1200, 1800, 1500),
    ("Tomato", "Uttar Pradesh", "Agra", "Agra", 1000, 1600, 1300),
    ("Potato", "Delhi", "North Delhi", "Azadpur", 900, 1300, 1100),
    ("Potato", "Uttar Pradesh", "Agra", "Agra", 800, 1200, 1000),
    ("Maize", "Madhya Pradesh", "Indore", "Indore", 1900, 2300, 2100),
    ("Maize", "Bihar", "Purnea", "Gulabbagh", 1800, 2200, 2000),
]


def _seed_demo_prices(db: Session) -> None:
    today = date.today()
    for commodity, state, district, market, lo, hi, modal in DEMO_PRICES:
        db.execute(insert(MarketPrice).values(
            commodity=commodity, variety="", state=state, district=district, market=market, arrival_date=today,
            min_price=lo, max_price=hi, modal_price=modal, source="Kisan Mitra demo data", is_demo=True,
        ).on_conflict_do_nothing(constraint="one_price_per_market_day"))


# Written only from the official pages, checked on 2026-10-17 (plan §14.3). Re-check before demo day.
# Soil Health Card (soilhealth.dac.gov.in) and PMKSY (pmksy.gov.in) returned 403 then; an admin should add
# them from their official pages rather than from memory.
SCHEMES = [
    {
        "name": "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
        "summary": "Income support for landholding farmer families, paid directly in three equal instalments a year.",
        "eligibility_text": "Landholding farmer families (husband, wife and minor children), identified by the State or "
                            "UT government. eKYC is mandatory. Not eligible: institutional landholders, holders of "
                            "constitutional posts, people who paid income tax in the last assessment year, serving or "
                            "retired government employees (except Multi Tasking Staff/Group D), pensioners with "
                            "Rs 10,000 or more a month, and registered professionals such as doctors, engineers, "
                            "lawyers, chartered accountants and architects.",
        "benefit_text": "Rs 6,000 per year in three equal instalments.",
        "official_url": "https://pmkisan.gov.in/",
    },
    {
        "name": "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
        "summary": "Government-sponsored crop insurance scheme. The official portal lets farmers apply for crop "
                   "insurance, calculate the premium and check their application status.",
        "eligibility_text": "Check who can enrol, premium rates and deadlines on the official portal.",
        "benefit_text": None,
        "official_url": "https://pmfby.gov.in/",
    },
    {
        "name": "Kisan Credit Card (KCC)",
        "summary": "Adequate and timely bank credit for farming operations through a Kisan Credit Card.",
        "eligibility_text": "Owner cultivators (individual or joint borrowers); tenant farmers, oral lessees and "
                            "sharecroppers; Self Help Groups or Joint Liability Groups of farmers.",
        "benefit_text": "The Government of India gives 2% interest subvention and a 3% prompt repayment incentive, "
                        "making credit available at 4% a year. This applies on an overall limit of Rs 3 lakh a year "
                        "(maximum Rs 2 lakh for farmers only in animal husbandry and/or fisheries).",
        "official_url": "https://www.myscheme.gov.in/schemes/kcc",
    },
]


def _seed_schemes(db: Session) -> None:
    for scheme in SCHEMES:
        if not db.scalar(select(Scheme.id).where(Scheme.name == scheme["name"])):
            db.add(Scheme(**scheme, states=[], last_verified_at=date(2026, 10, 17), published=True))



def _seed_kb(db: Session) -> None:
    articles = [(a, "disease") for a in KB_ARTICLES] + [(a, "productivity") for a in PRODUCTIVITY_ARTICLES]
    for article, topic in articles:
        if not db.scalar(select(KbArticle.id).where(KbArticle.title == article["title"],
                                                    KbArticle.source_url == article["source_url"])):
            db.add(KbArticle(**article, topic=topic, language="en", verified_by="Kisan Mitra team",
                             verified_at=date(2026, 10, 18)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Set up the database (see the module docstring).")
    parser.add_argument("--content", action="store_true", help="load verified starter schemes and articles")
    parser.add_argument("--demo", action="store_true", help="add demo users, listings and prices (testing only)")
    parser.add_argument("--purge-demo", action="store_true", help="remove all demo data")
    args = parser.parse_args()
    with SessionLocal() as session:
        if args.purge_demo:
            print("Removed demo data:", purge_demo(session))
            sys.exit()
        done = seed_required(session)
        if args.content:
            seed_content(session)
            done.append(f"{len(SCHEMES)} verified schemes, {len(KB_ARTICLES) + len(PRODUCTIVITY_ARTICLES)} KB articles")
        if args.demo:
            password = get_settings().SEED_DEMO_PASSWORD
            if len(password) < 8:
                sys.exit("Set SEED_DEMO_PASSWORD (min 8 characters) for --demo.")
            seed_demo(session, password)
            done.append(f"{len(DEMO_USERS)} demo users, demo listings and prices")
    print("Seeded: " + "; ".join(done))
