import os, sqlite3, hashlib, secrets
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from typing import Literal

import jwt
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE = os.path.dirname(__file__)
DB = os.path.join(BASE, "purchase.db")
SECRET = os.getenv(
    "JWT_SECRET", "development-only-change-this-secret-before-production"
)
ALGORITHM = "HS256"
COOKIE_NAME = "purchase_session"
COOKIE_SECURE = "true"
app = FastAPI(title="Project Purchase API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://dragonheart.local:5173",
        "https://dragonheart.local:5173",
        "http://dragonheart.local",
        "https://dragonheart.local",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def conn():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    finally:
        db.close()


def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 310000
    ).hex()
    return f"{salt}${digest}"


def check_password(password, encoded):
    salt, _ = encoded.split("$", 1)
    return secrets.compare_digest(hash_password(password, salt), encoded)


def setup():
    with conn() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','employee')));
        CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
        CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, section TEXT NOT NULL CHECK(section IN ('fabrication','busbar','switchgear')), invoice TEXT NOT NULL, invoice_date TEXT NOT NULL, name TEXT NOT NULL, weight TEXT, price REAL NOT NULL, supplier_id INTEGER, created_by INTEGER NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(supplier_id) REFERENCES suppliers(id), FOREIGN KEY(created_by) REFERENCES users(id));
        CREATE TABLE IF NOT EXISTS sessions (jti TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id));
        """)
        if not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            db.executemany(
                "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",
                [
                    (
                        "Alex Morgan",
                        "owner@purchase.app",
                        hash_password("owner123"),
                        "owner",
                    ),
                    (
                        "Jordan Lee",
                        "employee@purchase.app",
                        hash_password("employee123"),
                        "employee",
                    ),
                ],
            )
            db.executemany(
                "INSERT INTO suppliers (name) VALUES (?)",
                [
                    (x,)
                    for x in [
                        "Schneider Electric",
                        "ABB India",
                        "Siemens",
                        "L&T Electrical",
                        "Legrand",
                    ]
                ],
            )
            db.execute(
                "INSERT INTO projects (name,client,status) VALUES ('Aurora Tech Park','Aurora Developments','active')"
            )
            p = db.execute(
                "SELECT id FROM projects WHERE name='Aurora Tech Park'"
            ).fetchone()[0]
            owner = db.execute("SELECT id FROM users WHERE role='owner'").fetchone()[0]
            schneider = db.execute(
                "SELECT id FROM suppliers WHERE name='Schneider Electric'"
            ).fetchone()[0]
            db.executemany(
                "INSERT INTO purchases (project_id,section,invoice,invoice_date,name,weight,price,supplier_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
                [
                    (
                        p,
                        "fabrication",
                        "FAB-1048",
                        "2026-07-12",
                        "Steel Frame Assembly",
                        "2,450 kg",
                        148000,
                        None,
                        owner,
                    ),
                    (
                        p,
                        "busbar",
                        "BUS-772",
                        "2026-07-18",
                        "400A Busbar Trunking",
                        None,
                        92400,
                        None,
                        owner,
                    ),
                    (
                        p,
                        "switchgear",
                        "SW-311",
                        "2026-07-21",
                        "ACB Panel - 1600A",
                        None,
                        285000,
                        schneider,
                        owner,
                    ),
                ],
            )
            db.execute(
                "INSERT INTO projects (name,client,status) VALUES ('Greenfield Hospital','Greenfield Healthcare','active')"
            )


setup()


class Login(BaseModel):
    email: str
    password: str


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    client: str = Field(min_length=1, max_length=100)


class PurchaseIn(BaseModel):
    invoice: str
    date: str
    name: str
    price: float = Field(ge=0)
    weight: str | None = None
    supplier_id: int | None = None


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def current_user(request: Request):
    try:
        token = request.cookies.get(COOKIE_NAME)
        if not token:
            raise jwt.PyJWTError("Missing session cookie")
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        with conn() as db:
            session = db.execute(
                "SELECT revoked, expires_at FROM sessions WHERE jti=? AND user_id=?",
                (payload["jti"], int(payload["sub"])),
            ).fetchone()
        if not session or session["revoked"]:
            raise jwt.PyJWTError("Revoked session")
        user = {
            "id": int(payload["sub"]),
            "name": payload["name"],
            "role": payload["role"],
        }
        return user
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired session")


def owner(user=Depends(current_user)):
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Owner permission required")
    return user


@app.post("/auth/login")
def login(body: Login, response: Response):
    with conn() as db:
        row = db.execute(
            "SELECT * FROM users WHERE email=?", (body.email.lower(),)
        ).fetchone()
    if not row or not check_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    user = {"id": row["id"], "name": row["name"], "role": row["role"]}
    expiry = datetime.now(timezone.utc) + timedelta(hours=8)
    jti = str(uuid4())
    token = jwt.encode(
        {
            "sub": str(user["id"]),
            "name": user["name"],
            "role": user["role"],
            "exp": expiry,
            "jti": jti,
        },
        SECRET,
        algorithm=ALGORITHM,
    )
    with conn() as db:
        db.execute(
            "INSERT INTO sessions(jti,user_id,expires_at) VALUES(?,?,?)",
            (jti, user["id"], expiry.isoformat()),
        )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=8 * 60 * 60,
        path="/",
    )
    return {"user": user}


@app.get("/auth/me")
def get_current_user(user=Depends(current_user)):
    return {"user": user}


@app.post("/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            with conn() as db:
                db.execute(
                    "UPDATE sessions SET revoked=1 WHERE jti=?", (payload.get("jti"),)
                )
        except jwt.PyJWTError:
            pass
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


def serialize_project(db, p, include_details):
    result = {
        "id": p["id"],
        "name": p["name"],
        "client": p["client"],
        "status": p["status"],
    }
    rows = db.execute(
        "SELECT p.*, s.name supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE project_id=? ORDER BY p.id DESC",
        (p["id"],),
    ).fetchall()
    result["total"] = sum(r["price"] for r in rows)
    if include_details:
        result["sections"] = {x: [] for x in ("fabrication", "busbar", "switchgear")}
        for r in rows:
            result["sections"][r["section"]].append(
                dict(
                    id=r["id"],
                    invoice=r["invoice"],
                    date=r["invoice_date"],
                    name=r["name"],
                    weight=r["weight"],
                    price=r["price"],
                    supplier=r["supplier"],
                    supplier_id=r["supplier_id"],
                )
            )
    return result


@app.get("/projects")
def list_projects(user=Depends(current_user)):
    with conn() as db:
        projects = [
            serialize_project(db, p, user["role"] == "owner")
            for p in db.execute("SELECT * FROM projects ORDER BY id DESC")
        ]
    if user["role"] != "owner":
        for p in projects:
            p.pop("total", None)
    return projects


@app.get("/suppliers")
def list_suppliers(user=Depends(current_user)):
    with conn() as db:
        return [
            dict(x) for x in db.execute("SELECT id,name FROM suppliers ORDER BY name")
        ]


@app.post("/projects")
def create_project(body: ProjectIn, user=Depends(owner)):
    with conn() as db:
        cur = db.execute(
            "INSERT INTO projects(name,client) VALUES (?,?)", (body.name, body.client)
        )
        row = db.execute(
            "SELECT * FROM projects WHERE id=?", (cur.lastrowid,)
        ).fetchone()
        return serialize_project(db, row, True)


@app.patch("/projects/{project_id}/complete")
def complete_project(project_id: int, user=Depends(owner)):
    with conn() as db:
        if not db.execute(
            'UPDATE projects SET status="complete" WHERE id=?', (project_id,)
        ).rowcount:
            raise HTTPException(404, detail="Project not found")
    return {"ok": True}


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, user=Depends(owner)):
    with conn() as db:
        db.execute("DELETE FROM purchases WHERE project_id=?", (project_id,))
        db.execute("DELETE FROM projects WHERE id=?", (project_id,))
    return {"ok": True}


@app.post("/projects/{project_id}/purchases/{section}")
def add_purchase(
    project_id: int,
    section: Literal["fabrication", "busbar", "switchgear"],
    body: PurchaseIn,
    user=Depends(current_user),
):
    with conn() as db:
        project = db.execute(
            "SELECT * FROM projects WHERE id=?", (project_id,)
        ).fetchone()
        if not project:
            raise HTTPException(404, detail="Project not found")
        if project["status"] == "complete":
            raise HTTPException(400, detail="Completed projects cannot be changed")
        if section == "switchgear":
            if (
                not body.supplier_id
                or not db.execute(
                    "SELECT 1 FROM suppliers WHERE id=?", (body.supplier_id,)
                ).fetchone()
            ):
                raise HTTPException(400, detail="Choose a valid supplier")
        cur = db.execute(
            "INSERT INTO purchases(project_id,section,invoice,invoice_date,name,weight,price,supplier_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
            (
                project_id,
                section,
                body.invoice,
                body.date,
                body.name,
                body.weight if section == "fabrication" else None,
                body.price,
                body.supplier_id if section == "switchgear" else None,
                user["id"],
            ),
        )
        row = db.execute(
            "SELECT p.*,s.name supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?",
            (cur.lastrowid,),
        ).fetchone()
    return dict(
        id=row["id"],
        invoice=row["invoice"],
        date=row["invoice_date"],
        name=row["name"],
        weight=row["weight"],
        price=row["price"],
        supplier=row["supplier"],
        supplier_id=row["supplier_id"],
    )


@app.delete("/purchases/{purchase_id}")
def delete_purchase(purchase_id: int, user=Depends(owner)):
    with conn() as db:
        if not db.execute("DELETE FROM purchases WHERE id=?", (purchase_id,)).rowcount:
            raise HTTPException(404, detail="Purchase not found")
    return {"ok": True}


@app.post("/suppliers")
def add_supplier(body: SupplierIn, user=Depends(owner)):
    with conn() as db:
        try:
            cur = db.execute(
                "INSERT INTO suppliers(name) VALUES(?)", (body.name.strip(),)
            )
            return {"id": cur.lastrowid, "name": body.name.strip()}
        except sqlite3.IntegrityError:
            raise HTTPException(400, detail="Supplier already exists")


@app.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, user=Depends(owner)):
    with conn() as db:
        if db.execute(
            "SELECT 1 FROM purchases WHERE supplier_id=?", (supplier_id,)
        ).fetchone():
            raise HTTPException(
                400, detail="Supplier is used by a purchase and cannot be deleted"
            )
        if not db.execute("DELETE FROM suppliers WHERE id=?", (supplier_id,)).rowcount:
            raise HTTPException(404, detail="Supplier not found")
    return {"ok": True}
