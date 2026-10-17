"""Operational CLI. Admin creation is deliberately not an API endpoint.

Usage:
    uv run python -m app.cli create-admin --phone 9999900000 --name "Ops Admin"

The password is read from the terminal prompt, or from stdin with
`--password-stdin` for scripted environments. It is never taken from argv
(which lands in shell history and the process table), never logged, and never
committed. This is the documented provisioning path required by plan §2.1.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from app.config import get_settings
from app.db import get_session_factory
from app.errors import AppError
from app.logging_config import configure_logging
from app.models import User
from app.schemas import normalize_phone
from app.security import hash_password


def _read_password(password_stdin: bool) -> str:
    if password_stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("Password for the admin account: ")
        if password != getpass.getpass("Repeat password: "):
            raise SystemExit("Passwords do not match.")
    if len(password) < 12:
        raise SystemExit("Admin passwords must be at least 12 characters.")
    return password


def create_admin(phone: str, name: str, lang: str, password_stdin: bool) -> int:
    try:
        normalized = normalize_phone(phone)
    except ValueError:
        print("Invalid phone number.", file=sys.stderr)
        return 2

    password = _read_password(password_stdin)
    session = get_session_factory()()
    try:
        existing = session.scalar(select(User).where(User.phone == normalized))
        if existing is not None:
            print(f"A user with phone {normalized} already exists (role={existing.role}).", file=sys.stderr)
            return 1
        session.add(
            User(
                phone=normalized,
                name=name,
                password_hash=hash_password(password),
                role="admin",
                language=lang,
                is_new=False,
            )
        )
        session.commit()
    finally:
        session.close()

    print(f"Created admin account for {normalized}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    configure_logging(get_settings().log_level)
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    admin = sub.add_parser("create-admin", help="Create the seeded admin account")
    admin.add_argument("--phone", required=True)
    admin.add_argument("--name", required=True)
    admin.add_argument("--lang", default="hi", choices=["en", "hi"])
    admin.add_argument("--password-stdin", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        try:
            return create_admin(args.phone, args.name, args.lang, args.password_stdin)
        except AppError as exc:
            print(f"{exc.code}: {exc.message}", file=sys.stderr)
            return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
