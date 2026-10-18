"""backfill orders for enquiries accepted before orders existed, and take their stock off the listing

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Only listings with a price can become orders; at most the stock that is left is sold (oldest first).
    # One statement, so only the orders inserted here are taken off the listings.
    op.execute("""
        WITH todo AS (
            SELECT e.id AS enquiry_id, l.id AS listing_id, e.buyer_id, l.farmer_id, l.crop_code, l.title, l.unit,
                   e.quantity, l.price_per_unit,
                   SUM(e.quantity) OVER (PARTITION BY l.id ORDER BY e.responded_at, e.created_at) AS running,
                   l.quantity AS stock
            FROM enquiries e JOIN listings l ON l.id = e.listing_id
            WHERE e.status = 'accepted' AND l.price_per_unit IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.enquiry_id = e.id)
        ), inserted AS (
            INSERT INTO orders (id, enquiry_id, listing_id, buyer_id, farmer_id, crop_code, title, unit, quantity,
                                price_per_unit, subtotal, platform_fee, total, status, created_at)
            SELECT gen_random_uuid(), enquiry_id, listing_id, buyer_id, farmer_id, crop_code, title, unit, quantity,
                   price_per_unit, ROUND(quantity * price_per_unit, 2), 0, ROUND(quantity * price_per_unit, 2),
                   'awaiting_payment', now()
            FROM todo WHERE running <= stock
            RETURNING listing_id, quantity
        )
        UPDATE listings l SET quantity = l.quantity - s.sold,
               status = CASE WHEN l.quantity - s.sold = 0 AND l.status = 'open' THEN 'sold_out' ELSE l.status END
        FROM (SELECT listing_id, SUM(quantity) AS sold FROM inserted GROUP BY listing_id) s
        WHERE s.listing_id = l.id
    """)


def downgrade() -> None:
    pass  # data backfill: nothing to undo structurally
