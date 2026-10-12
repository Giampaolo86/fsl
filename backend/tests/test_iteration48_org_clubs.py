"""Iteration 48 – Società FSL (org_clubs) end-to-end regression.

Covers:
- Super admin crea società FSL (POST /api/org-clubs) + duplicati 409
- Invito FSL globale + check-invite pubblico (fsl=true, tournament=None)
- Registrazione responsabile club (register-club) → ruolo club_manager senza membership
- Flusso bozza profilo responsabile (PUT /me/club/profile → pending_review) + gruppi
- Enroll a torneo: squadre create con profilo copiato; re-enroll idempotente
- Sincronizzazione profilo unico tra org_club e copie club per-torneo
- Approval su torneo propaga description a entrambe le copie
- Regressione invito dal torneo (fsl=false)
- Endpoint pubblico team: roster_pending_review field
"""
import os
import secrets
import time
import pyotp
import pytest
import requests

def _env(key):
    val = os.environ.get(key)
    if val:
        return val
    try:
        for line in open("/app/frontend/.env").read().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
    return None


BASE_URL = (_env("REACT_APP_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"
QA_EMAIL = "qa.superadmin@fsl.demo"
QA_PASSWORD = os.environ.get("QA_PASSWORD") or open("/app/backend/.env").read().split('QA_PASSWORD="')[1].split('"')[0]
QA_TOTP = os.environ.get("QA_TOTP_SECRET") or open("/app/backend/.env").read().split('QA_TOTP_SECRET="')[1].split('"')[0]
CLUB_PASS = open("/app/backend/.env").read().split('CLUB_TEST_PASSWORD="')[1].split('"')[0]

RUN_ID = secrets.token_hex(3).upper()
ORG_NAME = f"QA Test FSL {RUN_ID}"


def _bearer(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "X-Client": "api"}


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": QA_EMAIL, "password": QA_PASSWORD}, headers={"X-Client": "api"})
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = pyotp.TOTP(QA_TOTP).now()
        r = s.post(f"{API}/auth/mfa/verify", json={"challenge": data["challenge"], "code": code}, headers={"X-Client": "api"})
        assert r.status_code == 200, r.text
        data = r.json()
    assert data.get("access_token")
    return data["access_token"]


@pytest.fixture(scope="module")
def state():
    return {}


def test_01_create_org_club(admin_token, state):
    r = requests.post(f"{API}/org-clubs", headers=_bearer(admin_token), json={"name": ORG_NAME, "city": "Roma"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == ORG_NAME and data["org_key"]
    state["org_key"] = data["org_key"]


def test_02_create_duplicate_409(admin_token, state):
    r = requests.post(f"{API}/org-clubs", headers=_bearer(admin_token), json={"name": ORG_NAME, "city": "Roma"})
    assert r.status_code == 409


def test_03_registry_lists_new(admin_token, state):
    r = requests.get(f"{API}/org-clubs", headers=_bearer(admin_token))
    assert r.status_code == 200
    items = r.json()["items"]
    row = next((x for x in items if x["org_key"] == state["org_key"]), None)
    assert row, f"org_key {state['org_key']} not in registry"
    assert row["manager"] is None
    assert row["tournaments"] == []
    # Prefer stable seeded tournaments (La Serie A dei Bambini, Torneo degli Amici)
    actives = [t for t in r.json()["tournaments"] if t["status"] == "active"]
    preferred_ids = {"6a9b5b045d9e0985643d0a9f", "6a9b5b045d9e0985643d0ad2"}
    chosen = [t for t in actives if t["id"] in preferred_ids]
    if len(chosen) < 2:
        chosen = actives[:2]
    state["tournaments"] = chosen[:2]
    # fetch slugs
    for t in state["tournaments"]:
        tr = requests.get(f"{API}/tournaments/{t['id']}", headers=_bearer(admin_token))
        if tr.status_code == 200:
            t["slug"] = tr.json().get("slug") or tr.json().get("tournament", {}).get("slug")
    assert len(state["tournaments"]) >= 2


def test_04_create_invite(admin_token, state):
    r = requests.post(f"{API}/org-clubs/{state['org_key']}/invite", headers=_bearer(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["code"].startswith("FSL-")
    state["invite_code"] = data["code"]


def test_05_public_invite_fsl_true(state):
    r = requests.get(f"{API}/public/invites/{state['invite_code']}")
    assert r.status_code == 200
    data = r.json()
    assert data.get("fsl") is True
    assert data.get("tournament") in (None, {})
    assert data["club"]["name"] == ORG_NAME


def test_06_register_club_manager(state):
    email = f"qa.mgr.{RUN_ID.lower()}@fsl.demo"
    pwd = f"Qa_{RUN_ID}_Mgr9!"
    r = requests.post(
        f"{API}/auth/register-club",
        headers={"Content-Type": "application/json", "X-Client": "api"},
        json={"code": state["invite_code"], "email": email, "password": pwd, "full_name": f"QA Mgr {RUN_ID}", "privacy_accepted": True},
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("access_token")
    state["mgr_email"] = email
    state["mgr_pwd"] = pwd
    state["mgr_token"] = data["access_token"]
    me = requests.get(f"{API}/auth/me", headers=_bearer(data["access_token"]))
    assert me.status_code == 200
    mdata = me.json()
    assert mdata["user"]["role"] == "club_manager"
    assert len(mdata["user"].get("memberships", [])) == 0


def test_07_registry_shows_manager_now(admin_token, state):
    r = requests.get(f"{API}/org-clubs", headers=_bearer(admin_token))
    row = next(x for x in r.json()["items"] if x["org_key"] == state["org_key"])
    assert row["manager"] is not None
    assert row["manager"]["email"] == state["mgr_email"]


def test_08_invite_again_409(admin_token, state):
    r = requests.post(f"{API}/org-clubs/{state['org_key']}/invite", headers=_bearer(admin_token))
    assert r.status_code == 409


def test_09_manager_club_profile(state):
    r = requests.get(f"{API}/me/club/profile", headers=_bearer(state["mgr_token"]))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["club"]["name"] == ORG_NAME
    assert data["upload_tournament_id"] == "org"


def test_10_manager_put_profile_pending(state):
    r = requests.put(
        f"{API}/me/club/profile",
        headers=_bearer(state["mgr_token"]),
        json={"motto": f"Motto QA {RUN_ID}", "colors": {"primary": "#112233", "secondary": "#AABBCC"}},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("approval_status") == "pending_review"


def test_11_manager_create_group(state):
    r = requests.post(f"{API}/me/club/groups", headers=_bearer(state["mgr_token"]), json={"category": "2016"})
    assert r.status_code in (200, 201), r.text
    g = r.json()
    state["group_id"] = g.get("id") or g.get("group", {}).get("id")
    assert state["group_id"]


def test_12_registry_has_draft_and_pending(admin_token, state):
    r = requests.get(f"{API}/org-clubs", headers=_bearer(admin_token))
    row = next(x for x in r.json()["items"] if x["org_key"] == state["org_key"])
    assert row["has_draft"] is True
    assert row["pending_groups"] >= 1


def test_13_admin_approve_profile(admin_token, state):
    r = requests.post(f"{API}/org-clubs/{state['org_key']}/profile/review", headers=_bearer(admin_token), json={"action": "approve"})
    assert r.status_code == 200
    p = requests.get(f"{API}/org-clubs/{state['org_key']}/profile", headers=_bearer(admin_token)).json()
    assert p["approval_status"] == "approved"
    assert p["profile"].get("motto") == f"Motto QA {RUN_ID}"


def test_14_enroll_tournament(admin_token, state):
    t1 = state["tournaments"][0]
    r = requests.post(
        f"{API}/org-clubs/{state['org_key']}/enroll",
        headers=_bearer(admin_token),
        json={"tournament_id": t1["id"], "categories": ["2017"], "group_ids": [state["group_id"]]},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["created"] is True
    teams = data["teams"]
    assert len(teams) == 2
    state["tid1"] = t1["id"]
    state["club_id_1"] = data["club"]["id"]
    state["club_slug_1"] = data["club"]["slug"]
    state["t1_slug"] = t1.get("slug") or data.get("tournament", {}).get("slug")
    state["team_ids_t1"] = [t["id"] for t in teams]
    # verify profile synced
    cp = requests.get(f"{API}/tournaments/{t1['id']}/clubs/{data['club']['id']}/profile", headers=_bearer(admin_token))
    assert cp.status_code == 200
    cpd = cp.json()
    prof = cpd.get("profile") or cpd.get("club", {}).get("profile") or {}
    # motto could sit under 'profile' or on club dict
    merged = {**(cpd.get("profile") or {}), **{k: v for k, v in cpd.items() if k == "motto"}}
    assert any(v == f"Motto QA {RUN_ID}" for v in [merged.get("motto"), prof.get("motto"), cpd.get("club", {}).get("motto")]), cpd


def test_15_me_has_membership(state):
    me = requests.get(f"{API}/auth/me", headers=_bearer(state["mgr_token"])).json()
    tids = [m.get("tournament_id") for m in me["user"].get("memberships", [])]
    assert state["tid1"] in tids


def test_16_me_overview_shows_groups(state):
    r = requests.get(f"{API}/me/club/overview", headers=_bearer(state["mgr_token"]))
    assert r.status_code == 200
    data = r.json()
    tourn_blocks = data.get("tournaments") or []
    tb = next((b for b in tourn_blocks if b["tournament"]["id"] == state["tid1"]), None)
    assert tb is not None, data
    assert len(tb.get("groups") or []) >= 1


def test_17_reenroll_idempotent(admin_token, state):
    r = requests.post(
        f"{API}/org-clubs/{state['org_key']}/enroll",
        headers=_bearer(admin_token),
        json={"tournament_id": state["tid1"], "categories": ["2017"], "group_ids": []},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["created"] is False


def test_18_enroll_second_tournament_and_sync(admin_token, state):
    t2 = state["tournaments"][1]
    r = requests.post(
        f"{API}/org-clubs/{state['org_key']}/enroll",
        headers=_bearer(admin_token),
        json={"tournament_id": t2["id"], "categories": ["2015"], "group_ids": []},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    state["tid2"] = t2["id"]
    state["club_id_2"] = data["club"]["id"]

    # sync via org-clubs PUT profile
    r = requests.put(
        f"{API}/org-clubs/{state['org_key']}/profile",
        headers=_bearer(admin_token),
        json={"motto": "Motto unico"},
    )
    assert r.status_code == 200
    for tid, cid in [(state["tid1"], state["club_id_1"]), (state["tid2"], state["club_id_2"])]:
        cp = requests.get(f"{API}/tournaments/{tid}/clubs/{cid}/profile", headers=_bearer(admin_token)).json()
        got = cp.get("motto") or (cp.get("profile") or {}).get("motto") or cp.get("club", {}).get("motto")
        assert got == "Motto unico", (tid, cp)


def test_19_sync_from_tournament_side(admin_token, state):
    r = requests.put(
        f"{API}/tournaments/{state['tid1']}/clubs/{state['club_id_1']}/profile",
        headers=_bearer(admin_token),
        json={"motto": "Dal torneo"},
    )
    assert r.status_code == 200, r.text
    # second tournament copy
    cp2 = requests.get(f"{API}/tournaments/{state['tid2']}/clubs/{state['club_id_2']}/profile", headers=_bearer(admin_token)).json()
    got2 = cp2.get("motto") or (cp2.get("profile") or {}).get("motto") or cp2.get("club", {}).get("motto")
    assert got2 == "Dal torneo", cp2
    # org-club central
    op = requests.get(f"{API}/org-clubs/{state['org_key']}/profile", headers=_bearer(admin_token)).json()
    assert (op.get("profile") or {}).get("motto") == "Dal torneo"


def test_20_manager_draft_description_review_on_tournament(admin_token, state):
    r = requests.put(
        f"{API}/me/club/profile",
        headers=_bearer(state["mgr_token"]),
        json={"description": f"Nuova desc {RUN_ID}"},
    )
    assert r.status_code == 200
    assert r.json().get("approval_status") == "pending_review"
    # staff list
    r = requests.get(f"{API}/tournaments/{state['tid1']}/profile-reviews", headers=_bearer(admin_token))
    assert r.status_code == 200
    body = r.json()
    items = body if isinstance(body, list) else (body.get("items") or body.get("clubs") or [])
    assert any((c.get("club_id") or c.get("id")) == state["club_id_1"] for c in items), items
    # approve on tournament
    r = requests.post(
        f"{API}/tournaments/{state['tid1']}/clubs/{state['club_id_1']}/profile/review",
        headers=_bearer(admin_token),
        json={"action": "approve"},
    )
    assert r.status_code == 200
    # both tournament copies have description
    for tid, cid in [(state["tid1"], state["club_id_1"]), (state["tid2"], state["club_id_2"])]:
        cp = requests.get(f"{API}/tournaments/{tid}/clubs/{cid}/profile", headers=_bearer(admin_token)).json()
        desc = cp.get("description") or (cp.get("profile") or {}).get("description") or cp.get("club", {}).get("description")
        assert desc == f"Nuova desc {RUN_ID}", (tid, cp)
    op = requests.get(f"{API}/org-clubs/{state['org_key']}/profile", headers=_bearer(admin_token)).json()
    assert op["approval_status"] == "approved"


def test_21_tournament_invite_still_works(admin_token, state):
    r = requests.post(
        f"{API}/tournaments/{state['tid1']}/clubs/{state['club_id_1']}/invite",
        headers=_bearer(admin_token),
    )
    assert r.status_code in (200, 201), r.text
    code = r.json().get("code")
    assert code
    pub = requests.get(f"{API}/public/invites/{code}").json()
    assert pub.get("fsl") is False
    assert pub.get("tournament") is not None


def test_22_public_team_roster_pending_field(admin_token, state):
    team_id = state["team_ids_t1"][0]
    slug = state.get("t1_slug")
    if not slug:
        tr = requests.get(f"{API}/tournaments/{state['tid1']}", headers=_bearer(admin_token)).json()
        slug = tr.get("slug") or tr.get("tournament", {}).get("slug")
    r = requests.get(f"{API}/public/tournaments/{slug}/teams/{team_id}")
    assert r.status_code == 200, (slug, team_id, r.text)
    data = r.json()
    assert "roster_pending_review" in data
    assert isinstance(data["roster_pending_review"], bool)
    assert "roster" in data and isinstance(data["roster"], list)


def test_99_cleanup(admin_token, state):
    """Cleanup via mongosh."""
    import subprocess
    import json as _json

    mongo_url = open("/app/backend/.env").read().split('MONGO_URL="')[1].split('"')[0]
    db_name = open("/app/backend/.env").read().split('DB_NAME="')[1].split('"')[0]
    org_key = state.get("org_key")
    mgr_email = state.get("mgr_email")
    tids = [state.get("tid1"), state.get("tid2")]
    tids = [t for t in tids if t]
    cids = [state.get("club_id_1"), state.get("club_id_2")]
    cids = [c for c in cids if c]
    js = f"""
    const orgKey = {_json.dumps(org_key)};
    const mgrEmail = {_json.dumps(mgr_email)};
    const cids = {_json.dumps(cids)};
    const tids = {_json.dumps(tids)};
    db.org_clubs.deleteMany({{org_key: orgKey}});
    db.clubs.deleteMany({{org_club_id: orgKey}});
    db.clubs.deleteMany({{id: {{$in: cids}}}});
    db.teams.deleteMany({{club_id: {{$in: cids}}}});
    db.org_groups.deleteMany({{org_key: orgKey}});
    db.club_invites.deleteMany({{org_key: orgKey}});
    if (mgrEmail) {{
      const u = db.users.findOne({{email: mgrEmail}});
      if (u) {{
        db.tournament_memberships.deleteMany({{user_id: u.id}});
        db.users.deleteOne({{email: mgrEmail}});
      }}
    }}
    print("cleanup ok");
    """
    res = subprocess.run(["mongosh", mongo_url + "/" + db_name, "--quiet", "--eval", js], capture_output=True, text=True, timeout=30)
    print("CLEANUP:", res.stdout, res.stderr)
    assert "cleanup ok" in res.stdout
