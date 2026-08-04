"""Category ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import Boolean, Column, Integer, String

from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    colour = Column(String(7), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default="true")
