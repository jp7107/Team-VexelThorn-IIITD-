"""orders, payments and receipts; admin settings; crop catalogue; user blocking

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=max(30, *map(len, values)))


def upgrade() -> None:
    op.add_column("users", sa.Column("upi_id", sa.String(length=60), nullable=True))
    op.add_column("users", sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False))

    # Listings now hold *available* stock, which accepted orders reduce, possibly to 0 (sold_out).
    op.drop_constraint("quantity_positive", "listings", type_="check")
    op.create_check_constraint("quantity_non_negative", "listings", "quantity >= 0")
    op.drop_constraint("listing_status", "listings", type_="check")
    op.create_check_constraint("listing_status", "listings", "status IN ('open', 'closed', 'hidden', 'sold_out')")

    op.create_table(
        "orders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("enquiry_id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column("buyer_id", sa.UUID(), nullable=False),
        sa.Column("farmer_id", sa.UUID(), nullable=False),
        sa.Column("crop_code", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("unit", _enum("order_unit", "kg", "quintal", "tonne", "dozen"), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("price_per_unit", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("platform_fee", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", _enum("order_status", "awaiting_payment", "payment_submitted", "paid", "dispatched",
                                  "delivered", "cancelled"), server_default="awaiting_payment", nullable=False),
        sa.Column("payment_method", _enum("payment_method", "online", "upi", "cash"), nullable=True),
        sa.Column("payment_ref", sa.String(length=100), nullable=True),
        sa.Column("gateway_order_id", sa.String(length=60), nullable=True),
        sa.Column("receipt_no", sa.String(length=30), nullable=True),
        sa.Column("cancelled_by", sa.String(length=10), nullable=True),
        sa.Column("cancel_reason", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("quantity > 0", name="order_quantity_positive"),
        sa.CheckConstraint("subtotal >= 0 AND platform_fee >= 0 AND total >= 0", name="order_amounts_non_negative"),
        sa.ForeignKeyConstraint(["enquiry_id"], ["enquiries.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["farmer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("enquiry_id"),
        sa.UniqueConstraint("receipt_no"),
    )
    for col in ("listing_id", "buyer_id", "farmer_id", "status", "gateway_order_id"):
        op.create_index(op.f(f"ix_orders_{col}"), "orders", [col])
    # Gapless-enough, human-friendly receipt numbers (KM-2026-000001).
    op.execute("CREATE SEQUENCE receipt_seq START 1")

    op.create_table(
        "platform_settings",
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("key"),
    )

    catalogue = op.create_table(
        "crop_catalogue",
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("name_en", sa.String(length=60), nullable=False),
        sa.Column("name_hi", sa.String(length=60), nullable=False),
        sa.Column("mandi_commodity", sa.String(length=80), nullable=True),
        sa.Column("marketplace", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )
    # Starting configuration (not demo data): the three crops the leaf model knows. Admins edit or add more.
    op.bulk_insert(catalogue, [
        {"code": "tomato", "name_en": "Tomato", "name_hi": "टमाटर", "mandi_commodity": "Tomato", "sort_order": 1},
        {"code": "potato", "name_en": "Potato", "name_hi": "आलू", "mandi_commodity": "Potato", "sort_order": 2},
        {"code": "maize", "name_en": "Maize", "name_hi": "मक्का", "mandi_commodity": "Maize", "sort_order": 3},
    ])


def downgrade() -> None:
    op.drop_table("crop_catalogue")
    op.drop_table("platform_settings")
    op.execute("DROP SEQUENCE IF EXISTS receipt_seq")
    op.drop_table("orders")
    op.drop_constraint("listing_status", "listings", type_="check")
    op.create_check_constraint("listing_status", "listings", "status IN ('open', 'closed', 'hidden')")
    op.drop_constraint("quantity_non_negative", "listings", type_="check")
    op.create_check_constraint("quantity_positive", "listings", "quantity > 0")
    op.drop_column("users", "is_active")
    op.drop_column("users", "upi_id")
