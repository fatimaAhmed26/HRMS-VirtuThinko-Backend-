#!/bin/bash
# Security checks against the running API.  Run: bash scripts/test-security.sh  (safe to run again)
API=http://127.0.0.1:5000/api
JSON="Content-Type: application/json"
JAR=$(mktemp)
get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }

ADMIN="Authorization: Bearer $(login admin@virtuthinko.com ChangeMe@2026)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }
SARA_USER=$(curl -s "$API/users?search=sara.ali" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$SARA_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}' > /dev/null
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"

echo "=== 1. tokens (all should be 401) ==="
echo "   no token: $(code $API/employees)"
FORGED=$(node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const h=b({alg:'HS256',typ:'JWT'}),p=b({sub:'1',permissions:['employee:view'],exp:9e9});console.log(h+'.'+p+'.'+c.createHmac('sha256','guessed-secret').update(h+'.'+p).digest('base64url'))")
echo "   forged token: $(code $API/employees -H "Authorization: Bearer $FORGED")"
NONE=$(node -e "const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');console.log(b({alg:'none'})+'.'+b({sub:'1',permissions:['employee:view'],exp:9e9})+'.')")
echo "   'alg: none' token: $(code $API/employees -H "Authorization: Bearer $NONE")"

echo; echo "=== 2. an employee cannot reach HR data (all should be 403) ==="
for p in /employees /payroll/runs /audit /settings /users /leave/requests; do echo "   $p: $(code $API$p -H "$SARA")"; done

echo; echo "=== 3. logout ends the session ==="
curl -s -c $JAR -X POST $API/auth/login -H "$JSON" -d '{"identifier":"sara.ali","password":"Sara@2026x"}' > /dev/null
echo "   refresh before logout: $(code -b $JAR -c $JAR -X POST $API/auth/refresh)  (200)"
cp $JAR $JAR.old
curl -s -b $JAR -X POST $API/auth/logout > /dev/null
echo "   old refresh cookie after logout: $(code -b $JAR.old -X POST $API/auth/refresh)  (401)"

echo; echo "=== 4. password reset ends the session ==="
curl -s -c $JAR -X POST $API/auth/login -H "$JSON" -d '{"identifier":"sara.ali","password":"Sara@2026x"}' > /dev/null
curl -s -X POST $API/users/$SARA_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}' > /dev/null
echo "   refresh after HR reset her password: $(code -b $JAR -X POST $API/auth/refresh)  (401)"

echo; echo "=== 5. password guessing is blocked ==="
CODES=""
for i in 1 2 3 4 5 6; do CODES="$CODES $(code -X POST $API/auth/login -H "$JSON" -d '{"identifier":"nobody.security-test","password":"guess"}')"; done
echo "   6 wrong passwords:$CODES  (401 x5 then 429)"

echo; echo "=== 6. other checks ==="
echo "   200 KB request body: $(node -e "process.stdout.write(JSON.stringify({identifier:'a',password:'x'.repeat(200000)}))" | code -X POST $API/auth/login -H "$JSON" --data-binary @-)  (413)"
echo "   CORS for another website: '$(curl -s -D - -o /dev/null $API/health -H 'Origin: https://evil.example' | grep -i '^access-control-allow-origin' | tr -d '\r')' (must not be evil.example)"
echo "   reachable from other computers? Only if this shows 0.0.0.0:"
(netstat -ano 2>/dev/null || ss -ltn) | grep ':5000 ' | grep -i listen | head -2 | sed 's/^/     /'
rm -f $JAR $JAR.old
