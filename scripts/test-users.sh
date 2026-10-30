#!/bin/bash
# Quick API test for the users module. Run: bash scripts/test-users.sh
API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"

# read a field from JSON on stdin, e.g.  ... | get accessToken
get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d)$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }

login() {
  curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}"
}

echo "=== admin login ==="
ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD | get .accessToken)"

echo; echo "=== roles ==="
ROLES=$(curl -s $API/roles -H "$ADMIN")
echo "$ROLES" | get ".map(r=>r.id+' '+r.name).join(', ')"
EMPLOYEE_ROLE=$(echo "$ROLES" | get ".find(r=>r.name==='Employee').id")
MANAGER_ROLE=$(echo "$ROLES" | get ".find(r=>r.name==='Manager').id")

echo; echo "=== make sure employee 1 is active ==="
curl -s -X PATCH $API/employees/1/status -H "$ADMIN" -H "$JSON" -d '{"status":"active"}' | get .status

echo; echo "=== create user for employee 1 (temp password) ==="
curl -s -X POST $API/users -H "$ADMIN" -H "$JSON" \
  -d "{\"username\":\"sara.ali\",\"employeeId\":1,\"roleIds\":[$EMPLOYEE_ROLE]}"; echo

USER_ID=$(curl -s "$API/users?search=sara.ali" -H "$ADMIN" | get ".items[0].id")
echo "user id: $USER_ID"

echo; echo "=== admin sets a known password ==="
curl -s -X POST $API/users/$USER_ID/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}'; echo

echo; echo "=== sara logs in ==="
SARA="Authorization: Bearer $(login sara.ali Sara@2026x | get .accessToken)"

echo; echo "=== sara: own profile /employees/me (should work) ==="
curl -s $API/employees/me -H "$SARA" | get ".employeeCode"

echo; echo "=== sara: list all employees (should be 403) ==="
curl -s $API/employees -H "$SARA"; echo

echo; echo "=== sara changes own password ==="
curl -s -X PATCH $API/users/me/password -H "$SARA" -H "$JSON" -d '{"currentPassword":"Sara@2026x","newPassword":"Sara@2026y"}'; echo
curl -s -X POST $API/users/$USER_ID/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}' > /dev/null

echo; echo "=== weak password rejected (should be 400) ==="
curl -s -X POST $API/users/$USER_ID/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"123"}'; echo

echo; echo "=== admin gives sara Manager + Employee roles ==="
curl -s -X PUT $API/users/$USER_ID/roles -H "$ADMIN" -H "$JSON" -d "{\"roleIds\":[$MANAGER_ROLE,$EMPLOYEE_ROLE]}" | get ".roles.map(r=>r.name).join(', ')"

echo; echo "=== admin deactivates sara ==="
curl -s -X PATCH $API/users/$USER_ID/status -H "$ADMIN" -H "$JSON" -d '{"status":"inactive"}' | get .status

echo; echo "=== sara tries to log in (should fail) ==="
login sara.ali Sara@2026x; echo

echo; echo "=== admin reactivates sara ==="
curl -s -X PATCH $API/users/$USER_ID/status -H "$ADMIN" -H "$JSON" -d '{"status":"active"}' | get .status

echo; echo "=== admin tries to deactivate themself (should be 400) ==="
curl -s -X PATCH $API/users/1/status -H "$ADMIN" -H "$JSON" -d '{"status":"inactive"}'; echo

echo; echo "=== list users ==="
curl -s $API/users -H "$ADMIN" | get ".items.map(u=>u.username+' ['+u.roles.map(r=>r.name).join(', ')+'] '+u.status).join('\n')"