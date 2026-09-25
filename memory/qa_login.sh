#!/bin/bash
# Uso: source /app/memory/qa_login.sh [email] [password]  → esporta TOKEN, API_URL, TID (Serie A dei Bambini)
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
EMAIL=${1:-direttore@fsl.demo}; PASS=${2:-Demo1234!}
CODE=$(python3 -c "import pyotp;print(pyotp.TOTP('GCB473SZYPJMXCDKMAB7G72HPJDGHY4C').now())")
R=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -H "X-Client: api" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
CH=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('challenge',''))")
if [ -n "$CH" ]; then R=$(curl -s -X POST "$API_URL/api/auth/mfa/verify" -H "Content-Type: application/json" -H "X-Client: api" -d "{\"challenge\":\"$CH\",\"code\":\"$CODE\"}"); fi
export TOKEN=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
export API_URL
export TID=$(curl -s "$API_URL/api/public/tournaments/la-serie-a-dei-bambini" | python3 -c "import sys,json;print(json.load(sys.stdin)['tournament']['id'])")
echo "TOKEN=${TOKEN:0:12}… TID=$TID"
