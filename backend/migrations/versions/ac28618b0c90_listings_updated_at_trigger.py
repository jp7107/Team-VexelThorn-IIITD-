"""listings updated_at trigger

Revision ID: ac28618b0c90
Revises: b56ec6eb794b
Create Date: 2026-10-17 19:55:00.000000

The ORM sets updated_at on UPDATE, but any writer outside the ORM (seed script,
psql, a future job) would bypass that. A trigger makes the guarantee live in
the database. IMPLEMENTATION_PLAN.md §14.6 names the column; the plan does not
specify the mechanism, so this is recorded in docs/IMPLEMENTATION_STATUS.md.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ac28618b0c90"
down_revision: str | Sequence[str] | None = "b56ec6eb794b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
            BEGIN
                NEW.updated_at = now();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_listings_set_updated_at
            BEFORE UPDATE ON listings
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TRIGGER IF EXISTS trg_listings_set_updated_at ON listings;"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS set_updated_at();"))
