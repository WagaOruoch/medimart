import json
import os
import re
import sqlite3
import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
CONFIG_ENV_PATH = os.environ.get("MEDIMART_CONFIG_PATH")
CONFIG_PATH = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path(CONFIG_ENV_PATH).expanduser().resolve() if CONFIG_ENV_PATH else BASE_DIR / "config.json"
with CONFIG_PATH.open(encoding="utf-8") as file:
    CONFIG = json.load(file)
if os.environ.get("ADMIN_PASSWORD"):
    CONFIG["admin_password"] = os.environ["ADMIN_PASSWORD"]
DB_PATH = Path(os.environ.get("MEDIMART_DB_PATH", str(CONFIG_PATH.with_suffix(".db")))).expanduser().resolve()
PUBLIC_DIR = BASE_DIR / "public"

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db():
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price INTEGER NOT NULL CHECK (price >= 0),
                stock INTEGER NOT NULL CHECK (stock >= 0),
                requires_rx INTEGER NOT NULL DEFAULT 0,
                emoji TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                address TEXT NOT NULL,
                payment TEXT NOT NULL,
                total INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS order_items (
                order_id INTEGER NOT NULL REFERENCES orders(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                qty INTEGER NOT NULL,
                price INTEGER NOT NULL,
                PRIMARY KEY (order_id, product_id)
            );
            CREATE TABLE IF NOT EXISTS stock_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL REFERENCES products(id),
                change INTEGER NOT NULL,
                reason TEXT NOT NULL,
                created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            for product in CONFIG.get("products", []):
                db.execute(
                    """INSERT INTO products
                       (name, category, price, stock, requires_rx, emoji)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        str(product["name"]).strip(),
                        str(product["category"]).strip(),
                        int(product["price"]),
                        max(0, int(product["stock"])),
                        1 if product.get("requires_rx") else 0,
                        str(product.get("emoji", "💊"))[:8],
                    ),
                )


def clean_text(value, field, max_length):
    if not isinstance(value, str):
        raise ValueError(f"{field} is required")
    value = re.sub(r"\s+", " ", value).strip()
    if not value or len(value) > max_length:
        raise ValueError(f"{field} is invalid")
    return value


def admin_required():
    return request.headers.get("X-Admin-Key") == CONFIG.get("admin_password")


def require_admin():
    if not admin_required():
        return jsonify({"error": "Unauthorized"}), 401
    return None


@app.get("/")
def storefront():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/admin.html")
def admin_page():
    return send_from_directory(PUBLIC_DIR, "admin.html")


@app.get("/api/config")
def api_config():
    return jsonify(
        {
            "name": CONFIG.get("name", "MediMart"),
            "tagline": CONFIG.get("tagline", ""),
            "primary": CONFIG.get("primary", "#0A7E8C"),
            "currency": CONFIG.get("currency", "KES"),
            "currency_symbol": CONFIG.get("currency_symbol", "KSh"),
            "delivery_fee": int(CONFIG.get("delivery_fee", 0)),
        }
    )


@app.get("/api/products")
def api_products():
    with get_db() as db:
        products = [dict(row) for row in db.execute("SELECT * FROM products ORDER BY id")]
    return jsonify(products)


@app.post("/api/orders")
def api_orders():
    payload = request.get_json(silent=True) or {}
    try:
        name = clean_text(payload.get("name"), "Name", 100)
        phone = clean_text(payload.get("phone"), "Phone", 30)
        address = clean_text(payload.get("address"), "Address", 300)
        payment = clean_text(payload.get("payment"), "Payment", 40)
        if payment not in {"Pay on delivery", "Card demo", "Bank transfer demo"}:
            raise ValueError("Invalid payment method")
        raw_items = payload.get("items")
        if not isinstance(raw_items, list) or not raw_items or len(raw_items) > 100:
            raise ValueError("Your cart is empty")
        items = []
        seen = set()
        for raw_item in raw_items:
            product_id = int(raw_item.get("product_id"))
            qty = int(raw_item.get("qty"))
            if product_id in seen or qty < 1 or qty > 1000:
                raise ValueError("Invalid cart item")
            seen.add(product_id)
            items.append((product_id, qty))
    except (TypeError, ValueError, AttributeError):
        return jsonify({"error": "Please check your delivery and cart details."}), 400

    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")
        total = int(CONFIG.get("delivery_fee", 0))
        checked = []
        for product_id, qty in items:
            product = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
            if product is None:
                raise ValueError("A product in your cart no longer exists.")
            if qty > product["stock"]:
                raise ValueError(f"Only {product['stock']} left of {product['name']}")
            total += product["price"] * qty
            checked.append((product, qty))
        cursor = db.execute(
            "INSERT INTO orders (name, phone, address, payment, total) VALUES (?, ?, ?, ?, ?)",
            (name, phone, address, payment, total),
        )
        order_id = cursor.lastrowid
        for product, qty in checked:
            db.execute(
                "INSERT INTO order_items (order_id, product_id, qty, price) VALUES (?, ?, ?, ?)",
                (order_id, product["id"], qty, product["price"]),
            )
            db.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, product["id"]))
            db.execute(
                "INSERT INTO stock_log (product_id, change, reason) VALUES (?, ?, ?)",
                (product["id"], -qty, f"Order #{order_id}"),
            )
        db.commit()
        return jsonify({"order_id": order_id, "total": total})
    except ValueError as error:
        db.rollback()
        return jsonify({"error": str(error)}), 400
    except sqlite3.Error:
        db.rollback()
        return jsonify({"error": "Unable to place the order. Please try again."}), 500
    finally:
        db.close()


@app.get("/api/admin/orders")
def admin_orders():
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized
    with get_db() as db:
        rows = db.execute(
            """SELECT o.*, GROUP_CONCAT(p.name || ' x' || oi.qty, ', ') AS items
               FROM orders o
               LEFT JOIN order_items oi ON oi.order_id = o.id
               LEFT JOIN products p ON p.id = oi.product_id
               GROUP BY o.id ORDER BY o.id DESC"""
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.get("/api/admin/stock_log")
def admin_stock_log():
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized
    with get_db() as db:
        rows = db.execute(
            """SELECT l.*, p.name FROM stock_log l
               JOIN products p ON p.id = l.product_id
               ORDER BY l.id DESC LIMIT 200"""
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/admin/products")
def admin_products():
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized
    payload = request.get_json(silent=True) or {}
    try:
        name = clean_text(payload.get("name"), "Product name", 100)
        category = clean_text(payload.get("category"), "Category", 50)
        price = int(payload.get("price"))
        stock = int(payload.get("stock"))
        emoji = clean_text(payload.get("emoji", "💊"), "Emoji", 8)
        requires_rx = 1 if payload.get("requires_rx") else 0
        if price < 0 or stock < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Please provide valid product details."}), 400
    with get_db() as db:
        cursor = db.execute(
            """INSERT INTO products (name, category, price, stock, requires_rx, emoji)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, category, price, stock, requires_rx, emoji),
        )
        product_id = cursor.lastrowid
        if stock:
            db.execute(
                "INSERT INTO stock_log (product_id, change, reason) VALUES (?, ?, ?)",
                (product_id, stock, "Initial stock"),
            )
    return jsonify({"id": product_id}), 201


@app.post("/api/admin/restock")
def admin_restock():
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized
    payload = request.get_json(silent=True) or {}
    try:
        product_id = int(payload.get("product_id"))
        quantity = int(payload.get("quantity"))
        if quantity < 1 or quantity > 10000:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Enter a valid restock quantity."}), 400
    with get_db() as db:
        if db.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            return jsonify({"error": "Product not found."}), 404
        db.execute("UPDATE products SET stock = stock + ? WHERE id = ?", (quantity, product_id))
        db.execute(
            "INSERT INTO stock_log (product_id, change, reason) VALUES (?, ?, ?)",
            (product_id, quantity, "Restock"),
        )
    return jsonify({"ok": True})


@app.post("/api/admin/order_status")
def admin_order_status():
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized
    payload = request.get_json(silent=True) or {}
    try:
        order_id = int(payload.get("order_id"))
        status = clean_text(payload.get("status"), "Status", 20)
        if status not in {"Pending", "Shipped", "Delivered", "Cancelled"}:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid order status."}), 400
    with get_db() as db:
        cursor = db.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
        if cursor.rowcount == 0:
            return jsonify({"error": "Order not found."}), 404
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "5000"))
    print(f"{CONFIG.get('name', 'MediMart')} running at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
