cd /c/dev/HRMS-VirtuThinko-Backend-
TOKEN=$(curl -s -X POST http://127.0.0.1:5000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"admin@virtuthinko.com","password":"ChangeMe@2026"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

# create department
curl -s -X POST http://127.0.0.1:5000/api/departments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Human Resources"}'; echo

# create employee
curl -s -X POST http://127.0.0.1:5000/api/employees -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"firstName":"Sara","lastName":"Ali","email":"sara@virtuthinko.com","gender":"Female","cprNumber":"950312345","departmentId":1,"jobTitle":"HR Officer","employmentType":"Full-time","hireDate":"2026-01-15","bankName":"BBK","bankAccountNumber":"BH67BMAG00001299123456"}'; echo

# search
curl -s "http://127.0.0.1:5000/api/employees?search=sara" -H "Authorization: Bearer $TOKEN"; echo

# edit
curl -s -X PATCH http://127.0.0.1:5000/api/employees/1 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"jobTitle":"Senior HR Officer"}'; echo

# deactivate
curl -s -X PATCH http://127.0.0.1:5000/api/employees/1/status -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"status":"inactive","reason":"Resigned"}'; echo

# history
curl -s http://127.0.0.1:5000/api/employees/1/history -H "Authorization: Bearer $TOKEN"; echo

# validation error
curl -s -X POST http://127.0.0.1:5000/api/employees -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"firstName":"","email":"bad","cprNumber":"123"}'; echo

#!/bin/bash
# Quick API test for the employees module. Run: bash scripts/test-employees.sh
API=http://127.0.0.1:5000/api
EMAIL=admin@virtuthinko.com
PASSWORD=ChangeMe@2026

echo "=== login ==="
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
echo "token: ${TOKEN:0:20}..."
AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"

echo; echo "=== create department ==="
curl -s -X POST $API/departments -H "$AUTH" -H "$JSON" -d '{"name":"Human Resources"}'; echo

echo; echo "=== list departments ==="
curl -s $API/departments -H "$AUTH"; echo

echo; echo "=== create employee ==="
curl -s -X POST $API/employees -H "$AUTH" -H "$JSON" \
  -d '{"firstName":"Sara","lastName":"Ali","email":"sara@virtuthinko.com","gender":"Female","cprNumber":"950312345","departmentId":1,"jobTitle":"HR Officer","employmentType":"Full-time","hireDate":"2026-01-15","bankName":"BBK","bankAccountNumber":"BH67BMAG00001299123456"}'; echo

echo; echo "=== search 'sara' ==="
curl -s "$API/employees?search=sara" -H "$AUTH"; echo

echo; echo "=== edit job title ==="
curl -s -X PATCH $API/employees/1 -H "$AUTH" -H "$JSON" -d '{"jobTitle":"Senior HR Officer"}'; echo

echo; echo "=== deactivate ==="
curl -s -X PATCH $API/employees/1/status -H "$AUTH" -H "$JSON" -d '{"status":"inactive","reason":"Resigned"}'; echo

echo; echo "=== history ==="
curl -s $API/employees/1/history -H "$AUTH"; echo

echo; echo "=== validation error (should be 400) ==="
curl -s -X POST $API/employees -H "$AUTH" -H "$JSON" -d '{"firstName":"","email":"bad","cprNumber":"123"}'; echo