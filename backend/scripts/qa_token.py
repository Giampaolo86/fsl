"""Stampa un Bearer token per l'account QA (login + MFA TOTP). Uso: python3 scripts/qa_token.py"""
import os
import sys

import pyotp
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env"))
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
H = {"X-Client": "api"}
r = requests.post(f"{API}/auth/login", json={"email": "qa.superadmin@fsl.demo", "password": os.environ["QA_PASSWORD"]}, headers=H)
j = r.json()
if j.get("challenge"):
    j = requests.post(f"{API}/auth/mfa/verify", json={"challenge": j["challenge"], "code": pyotp.TOTP(os.environ["QA_TOTP_SECRET"]).now()}, headers=H).json()
if not j.get("access_token"):
    sys.exit(f"login fallito: {j}")
print(j["access_token"])
