"""Gerarchia Owner → Super Admin → altri ruoli: test reali sul backend (dati sintetici, nessuna credenziale reale).

L'Owner è l'account reale indicato da ADMIN_EMAIL (is_owner=true): NON si effettua login con le sue credenziali; per le prove
"come Owner" si crea una sessione di test direttamente nel DB (mfa_verified=true), come già fatto per i test MFA.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyotp
import pytest
import requests
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

API = (os.environ.get("API_URL") or "http://localhost:8001").rstrip("/") + "/api"
QA = ("qa.superadmin@fsl.demo", os.environ["QA_PASSWORD"])
TOTP = pyotp.TOTP(os.environ["QA_TOTP_SECRET"])
PFX = f"own-{uuid.uuid4().hex[:6]}"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _db():
    from motor.motor_asyncio import AsyncIOMotorClient

    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(email, password):
    s = requests.Session()
    hdr = {"X-Client": "api"}
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=hdr)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        r = s.post(f"{API}/auth/mfa/verify", json={"challenge": j["challenge"], "code": TOTP.now()}, headers=hdr)
        assert r.status_code == 200, r.text
        j = r.json()
    s.headers["Authorization"] = f"Bearer {j['access_token']}"
    return s


def session_for(user_doc, *, mfa_verified=True):
    """Sessione di test creata nel DB (nessuna credenziale reale usata)."""
    from app.core.security import create_access_token

    db = _db()
    sid = f"own-{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    _run(db.sessions.insert_one({"_id": sid, "user_id": str(user_doc["_id"]), "refresh_jti": "x", "csrf": "c", "ip": "own-test", "user_agent": "t", "mfa_verified": mfa_verified, "created_at": now, "last_used_at": now, "expires_at": now + timedelta(hours=1), "revoked_at": None}))
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {create_access_token(str(user_doc['_id']), user_doc['email'], sid)}"
    return s


@pytest.fixture(scope="module")
def db():
    return _db()


@pytest.fixture(scope="module")
def owner(db):
    o = _run(db.users.find_one({"is_owner": True}))
    assert o, "nessun Owner nel DB (bootstrap non eseguito)"
    return o


@pytest.fixture(scope="module")
def sa():
    return login(*QA)


@pytest.fixture(scope="module")
def other_sa(sa, db):
    """Secondo Super Admin sintetico (non protetto) creato dal QA SA."""
    email, pwd = f"{PFX}.sa@test.it", f"Sa-{uuid.uuid4().hex[:10]}-9"
    r = sa.post(f"{API}/users", json={"email": email, "full_name": "SA sintetico", "password": pwd, "role": "super_admin"})
    assert r.status_code == 201, r.text
    doc = _run(db.users.find_one({"email": email}))
    yield doc
    _run(db.users.delete_many({"email": {"$regex": f"^{PFX}"}}))
    _run(db.sessions.delete_many({"ip": "own-test"}))


# ---------- unicità ----------
def test_exactly_one_owner_with_unique_index(db, owner):
    assert _run(db.users.count_documents({"is_owner": True})) == 1
    assert "uniq_owner" in _run(db.users.index_information())
    assert owner.get("is_super_admin") and owner.get("status") == "active"
    assert owner["email"] == os.environ["ADMIN_EMAIL"].lower()


def test_second_owner_impossible_at_db_level(db, other_sa):
    from pymongo.errors import DuplicateKeyError

    with pytest.raises(DuplicateKeyError):
        _run(db.users.update_one({"_id": other_sa["_id"]}, {"$set": {"is_owner": True}}))
    assert _run(db.users.count_documents({"is_owner": True})) == 1


def test_owner_field_cannot_be_set_via_repository_or_api(db, other_sa, sa):
    from app.models.domain import User
    from app.repositories.base import Repository

    repo = Repository("users", User)
    _run(repo.update(str(other_sa["_id"]), {"is_owner": True, "full_name": "SA sintetico"}))
    assert not _run(db.users.find_one({"_id": other_sa["_id"]})).get("is_owner")
    # payload API con is_owner: ignorato o rifiutato, mai applicato
    r = sa.post(f"{API}/users", json={"email": f"{PFX}.owner2@test.it", "full_name": "X", "password": f"Pw-{uuid.uuid4().hex[:10]}-9", "role": "super_admin", "is_owner": True})
    assert r.status_code in (201, 422)
    assert _run(db.users.count_documents({"is_owner": True})) == 1
    r = sa.patch(f"{API}/auth/profile", json={"full_name": "QA Super Admin (temp)", "is_owner": True})
    assert r.status_code in (200, 404, 405, 422)
    assert _run(db.users.count_documents({"is_owner": True})) == 1


# ---------- un Super Admin non può toccare l'Owner ----------
def test_super_admin_cannot_delete_disable_reset_or_impersonate_owner(sa, owner, db):
    oid = str(owner["_id"])
    before = _run(db.users.find_one({"_id": owner["_id"]}))
    checks = [
        sa.delete(f"{API}/users/{oid}", params={"confirm_email": owner["email"]}),
        sa.patch(f"{API}/users/{oid}/status", json={"status": "disabled"}),
        sa.post(f"{API}/users/{oid}/temporary-password"),
        sa.post(f"{API}/users/{oid}/mfa/reset"),
        sa.post(f"{API}/auth/impersonate/{oid}"),
        sa.post(f"{API}/users/memberships", json={"user_id": oid, "tournament_id": "x", "role": "secretary"}),
    ]
    for r in checks:
        assert r.status_code in (403, 404), (r.request.method, r.request.url, r.status_code, r.text)
        if r.status_code == 403:
            assert r.json()["detail"]["code"] in ("OWNER_PROTECTED", "FORBIDDEN", "SCOPE_DENIED"), r.text
    after = _run(db.users.find_one({"_id": owner["_id"]}))
    for k in ("password_hash", "mfa_enabled", "mfa_secret", "status", "is_owner", "is_super_admin", "email"):
        assert before.get(k) == after.get(k), k
    assert _run(db.sessions.count_documents({"user_id": oid, "revoked_at": None})) == _run(db.sessions.count_documents({"user_id": oid, "revoked_at": None}))


def test_owner_delete_blocked_even_from_owner_session_and_from_cleanup(owner, db):
    from app.core.errors import ApiError
    from app.services.cleanup import delete_user, disable_test_accounts_in_production

    s = session_for(owner)
    r = s.delete(f"{API}/users/{owner['_id']}", params={"confirm_email": owner["email"]})
    assert r.status_code in (400, 403), r.text  # mai eliminabile, neppure da sé
    with pytest.raises(ApiError) as e:
        _run(delete_user(str(owner["_id"])))
    assert e.value.detail["code"] == "OWNER_PROTECTED"
    # cancellazione massiva / disabilitazione account di test: l'Owner non rientra mai nei pattern e ha un guard esplicito
    from app.services.cleanup import is_test_account

    assert not is_test_account(owner["email"])
    assert owner["email"] not in _run(disable_test_accounts_in_production())
    assert _run(db.users.find_one({"_id": owner["_id"]})) is not None


def test_seed_cannot_replace_owner_or_reset_its_password(db, owner, monkeypatch):
    from app.seed import upsert_user
    from app.services.owner import bootstrap_owner

    monkeypatch.setenv("ADMIN_FORCE_PASSWORD_RESET", "true")
    before = _run(db.users.find_one({"_id": owner["_id"]}))
    _run(upsert_user(owner["email"], "Nuova-Password-Da-Env-123", "X", "super_admin", is_super_admin=True))
    after = _run(db.users.find_one({"_id": owner["_id"]}))
    assert before["password_hash"] == after["password_hash"]
    # bootstrap con un ADMIN_EMAIL diverso non migra la proprietà
    monkeypatch.setenv("ADMIN_EMAIL", QA[0])
    assert _run(bootstrap_owner()) == str(owner["_id"])
    assert _run(db.users.count_documents({"is_owner": True})) == 1
    assert not _run(db.users.find_one({"email": QA[0]})).get("is_owner")


def test_backup_restore_cannot_alter_ownership():
    from app.services.owner import strip_owner_fields

    assert strip_owner_fields({"email": "x", "is_owner": True, "owner_since": 1, "role": "fan"}) == {"email": "x", "role": "fan"}


# ---------- i Super Admin restano pienamente operativi ----------
def test_super_admins_keep_full_powers(sa, other_sa, db):
    s2 = session_for(other_sa)
    r = s2.post(f"{API}/tournaments", json={"mode": "scratch", "name": f"{PFX.upper()} Torneo", "slug": f"{PFX}-t"})
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert s2.get(f"{API}/tournaments/hub").status_code == 200
    assert s2.get(f"{API}/users").status_code == 200
    assert s2.get(f"{API}/security/summary").status_code == 200
    # un SA può creare e gestire un altro SA non protetto
    email = f"{PFX}.sa2@test.it"
    r = s2.post(f"{API}/users", json={"email": email, "full_name": "SA 2", "password": f"Sa-{uuid.uuid4().hex[:10]}-9", "role": "super_admin"})
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    assert s2.patch(f"{API}/users/{uid}/status", json={"status": "disabled"}).status_code == 200
    assert s2.post(f"{API}/users/{uid}/temporary-password").status_code == 200
    assert s2.delete(f"{API}/users/{uid}", params={"confirm_email": email}).status_code == 200
    assert s2.delete(f"{API}/tournaments/{tid}", params={"confirm": f"{PFX}-t"}).status_code == 200


def test_owner_manages_other_super_admins(owner, other_sa, db):
    s = session_for(owner)
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200 and me.json()["user"]["is_owner"] is True
    uid = str(other_sa["_id"])
    assert s.patch(f"{API}/users/{uid}/status", json={"status": "disabled"}).status_code == 200
    assert s.patch(f"{API}/users/{uid}/status", json={"status": "active"}).status_code == 200
    assert s.post(f"{API}/users/{uid}/mfa/reset").status_code == 200
    users = s.get(f"{API}/users").json()
    assert next(u for u in users if u["is_owner"])["role_label"] == "Owner — Fondatore FSL"


def test_user_delete_requires_recent_auth(sa, db):
    email = f"{PFX}.victim@test.it"
    r = sa.post(f"{API}/users", json={"email": email, "full_name": "V", "password": f"Pw-{uuid.uuid4().hex[:10]}-9", "role": "super_admin"})
    uid = r.json()["id"]
    me = sa.get(f"{API}/auth/me").json()["user"]
    sid = _run(db.sessions.find_one({"user_id": me["id"], "revoked_at": None}, sort=[("created_at", -1)]))["_id"]
    _run(db.sessions.update_one({"_id": sid}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(hours=1)}, "$unset": {"reauth_at": ""}}))
    r = sa.delete(f"{API}/users/{uid}", params={"confirm_email": email})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "REAUTH_REQUIRED", r.text
    assert sa.post(f"{API}/auth/reauth", json={"password": QA[1], "code": TOTP.now()}).status_code == 200
    assert sa.delete(f"{API}/users/{uid}", params={"confirm_email": "wrong@test.it"}).status_code == 400
    assert sa.delete(f"{API}/users/{uid}", params={"confirm_email": email}).status_code == 200
    assert _run(db.audit_logs.find_one({"action": "user.delete", "entity_id": uid})) is not None


# ---------- percorsi alternativi sulle credenziali: recupero assistito, token, email, MFA ----------
def test_super_admin_cannot_obtain_reset_link_or_token_for_owner(sa, owner, db):
    before = _run(db.password_resets.count_documents({"user_id": str(owner["_id"]), "used_at": None}))
    r = sa.post(f"{API}/auth/reset-requests/link", json={"email": owner["email"]})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "OWNER_PROTECTED", r.text
    assert _run(db.password_resets.count_documents({"user_id": str(owner["_id"]), "used_at": None})) == before
    # il servizio centrale rifiuta ogni emissione "assistita", da qualunque chiamante
    from app.core.errors import ApiError
    from app.models.domain import User
    from app.routers.auth import create_reset

    with pytest.raises(ApiError) as e:
        _run(create_reset(User.from_mongo(owner), requested_by="qualsiasi-admin"))
    assert e.value.detail["code"] == "OWNER_PROTECTED"
    # un token amministrativo inserito a forza nel DB non completa il reset dell'Owner
    import hashlib
    import secrets as sec

    tok = sec.token_urlsafe(32)
    _run(db.password_resets.insert_one({"user_id": str(owner["_id"]), "email": owner["email"], "token_hash": hashlib.sha256(tok.encode()).hexdigest(), "created_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(hours=1), "used_at": None, "requested_by": "forzato"}))
    r = requests.post(f"{API}/auth/reset-password", json={"token": tok, "password": f"Nuova-{uuid.uuid4().hex[:8]}-9"})
    assert r.status_code == 403, r.text
    assert _run(db.users.find_one({"_id": owner["_id"]}))["password_hash"] == owner["password_hash"]
    # la lista delle richieste in attesa non rivela mai l'Owner
    assert all(d["email"] != owner["email"] for d in sa.get(f"{API}/auth/reset-requests").json())
    # sweep: i token assistiti residui vengono invalidati
    from app.services.owner import sweep_owner_reset_tokens

    _run(db.password_resets.insert_one({"user_id": str(owner["_id"]), "email": owner["email"], "token_hash": "x", "created_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(hours=1), "used_at": None, "requested_by": "altro-admin"}))
    assert _run(sweep_owner_reset_tokens()) >= 1
    assert _run(db.password_resets.count_documents({"user_id": str(owner["_id"]), "used_at": None, "requested_by": {"$ne": "user"}})) == 0


def test_owner_self_service_channels_remain_available(owner, db, monkeypatch):
    """L'Owner può cambiare password volontariamente (percorso autenticato) e il canale personale di recupero resta suo."""
    from app.models.domain import User
    from app.routers.auth import create_reset

    s = session_for(owner)
    r = s.post(f"{API}/auth/password/change", json={"current_password": "password-sbagliata", "new_password": f"Nuova-{uuid.uuid4().hex[:8]}-9"})
    assert r.status_code in (400, 401), r.text  # percorso disponibile: rifiuta solo perché la password attuale non è corretta
    assert _run(db.users.find_one({"_id": owner["_id"]}))["password_hash"] == owner["password_hash"]
    tok = _run(create_reset(User.from_mongo(owner), requested_by="user"))  # canale personale (email verificata / procedura tecnica)
    assert tok and _run(db.password_resets.find_one({"user_id": str(owner["_id"]), "used_at": None, "requested_by": "user"}))
    _run(db.password_resets.update_many({"user_id": str(owner["_id"]), "used_at": None}, {"$set": {"used_at": datetime.now(timezone.utc)}}))
    # senza SMTP il recupero pubblico per l'Owner non produce token consegnabili a terzi
    from app.services import mailer

    monkeypatch.setattr(mailer, "configured", lambda: False)
    r = requests.post(f"{API}/auth/forgot-password", json={"email": owner["email"]})
    assert r.status_code == 200 and r.json().get("owner_procedure") is True and r.json()["assisted"] is False
    assert _run(db.password_resets.count_documents({"user_id": str(owner["_id"]), "used_at": None})) == 0


def test_super_admin_can_still_assist_unprotected_users(sa, other_sa):
    r = sa.post(f"{API}/auth/reset-requests/link", json={"email": other_sa["email"]})
    assert r.status_code == 200 and "/reimposta-password?token=" in r.json()["link"]


# ---------- controllo preventivo: inventario dei percorsi che toccano credenziali/account ----------
# Ogni rotta non-GET sotto /auth e /users deve essere classificata qui. Una rotta nuova o rinominata fa fallire il test
# finché non viene esaminata rispetto all'Owner: SELF = agisce solo sull'utente autenticato; PUBLIC = senza bersaglio scelto
# dal chiamante (token/credenziali proprie); TARGET = agisce su un altro account → DEVE essere coperta da un test negativo Owner.
ROUTE_INVENTORY = {
    ("DELETE", "/api/auth/mfa/devices/{device_id}"): "SELF",
    ("DELETE", "/api/auth/sessions/{sid}"): "SELF",
    ("POST", "/api/auth/forgot-password"): "PUBLIC",  # Owner: solo email verificata; senza SMTP nessun token (test_owner_self_service_channels_remain_available)
    ("POST", "/api/auth/google/session"): "PUBLIC",
    ("POST", "/api/auth/impersonate/end"): "SELF",
    ("POST", "/api/auth/login"): "PUBLIC",
    ("POST", "/api/auth/logout"): "SELF",
    ("POST", "/api/auth/logout-all"): "SELF",
    ("POST", "/api/auth/mfa/disable"): "SELF",
    ("POST", "/api/auth/mfa/enable/begin"): "SELF",
    ("POST", "/api/auth/mfa/enable/confirm"): "SELF",
    ("POST", "/api/auth/mfa/recovery/regenerate"): "SELF",
    ("POST", "/api/auth/mfa/setup/begin"): "SELF",
    ("POST", "/api/auth/mfa/setup/confirm"): "SELF",
    ("POST", "/api/auth/mfa/verify"): "PUBLIC",
    ("POST", "/api/auth/password/change"): "SELF",
    ("POST", "/api/auth/reauth"): "SELF",
    ("POST", "/api/auth/refresh"): "PUBLIC",
    ("POST", "/api/auth/register"): "PUBLIC",
    ("POST", "/api/auth/reset-password"): "PUBLIC",  # Owner: token amministrativi rifiutati (test_super_admin_cannot_obtain_reset_link_or_token_for_owner)
    ("POST", "/api/auth/impersonate/{user_id}"): "TARGET",
    ("POST", "/api/auth/reset-requests/link"): "TARGET",
    ("POST", "/api/users"): "PUBLIC",  # crea nuovi account; is_owner nel payload ignorato (test_owner_field_cannot_be_set_via_repository_or_api)
    ("POST", "/api/users/memberships"): "TARGET",
    ("DELETE", "/api/users/memberships/{membership_id}"): "TARGET",
    ("DELETE", "/api/users/{user_id}"): "TARGET",
    ("PATCH", "/api/users/{user_id}/status"): "TARGET",
    ("POST", "/api/users/{user_id}/mfa/reset"): "TARGET",
    ("POST", "/api/users/{user_id}/temporary-password"): "TARGET",
}


def test_every_account_route_is_classified_and_target_routes_reject_owner(sa, owner, db):
    from app.routers import auth, users

    actual = {(m, "/api" + r.path) for rt in (auth.router, users.router) for r in rt.routes for m in r.methods if m in ("POST", "PATCH", "PUT", "DELETE")}
    assert actual == set(ROUTE_INVENTORY), f"Rotte non classificate: {actual - set(ROUTE_INVENTORY)} / rimosse: {set(ROUTE_INVENTORY) - actual}"
    oid = str(owner["_id"])
    m_owner = _run(db.tournament_memberships.find_one({"user_id": oid})) or {"_id": "000000000000000000000000"}
    calls = {
        ("POST", "/api/auth/impersonate/{user_id}"): lambda: sa.post(f"{API}/auth/impersonate/{oid}"),
        ("POST", "/api/auth/reset-requests/link"): lambda: sa.post(f"{API}/auth/reset-requests/link", json={"email": owner["email"]}),
        ("POST", "/api/users/memberships"): lambda: sa.post(f"{API}/users/memberships", json={"user_id": oid, "tournament_id": "x", "role": "secretary"}),
        ("DELETE", "/api/users/memberships/{membership_id}"): lambda: sa.delete(f"{API}/users/memberships/{m_owner['_id']}"),
        ("DELETE", "/api/users/{user_id}"): lambda: sa.delete(f"{API}/users/{oid}", params={"confirm_email": owner["email"]}),
        ("PATCH", "/api/users/{user_id}/status"): lambda: sa.patch(f"{API}/users/{oid}/status", json={"status": "disabled"}),
        ("POST", "/api/users/{user_id}/mfa/reset"): lambda: sa.post(f"{API}/users/{oid}/mfa/reset"),
        ("POST", "/api/users/{user_id}/temporary-password"): lambda: sa.post(f"{API}/users/{oid}/temporary-password"),
    }
    targets = {k for k, v in ROUTE_INVENTORY.items() if v == "TARGET"}
    assert targets == set(calls), "ogni rotta TARGET deve avere una chiamata negativa contro l'Owner"
    before = _run(db.users.find_one({"_id": owner["_id"]}))
    for key, call in calls.items():
        r = call()
        assert r.status_code in (403, 404), (key, r.status_code, r.text)
    after = _run(db.users.find_one({"_id": owner["_id"]}))
    assert before == after, "il documento Owner non deve cambiare in alcun campo"
