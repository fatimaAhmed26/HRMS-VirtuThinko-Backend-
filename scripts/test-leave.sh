#!/bin/bash
# Leave module test. Run: bash scripts/test-leave.sh   (safe to run again)
API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d)$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
show() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('   '+(o.id?'#'+o.id+' '+o.leaveType.code+' '+o.days+' days -> '+o.status+(o.payBreakdown?'  pay='+JSON.stringify(o.payBreakdown):''):o.message+(o.details?' '+JSON.stringify(o.details):'')))})"; }

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"

echo "=== setup: Omar (Saudi employee, manager = Sara) ==="
curl -s -X POST $API/employees -H "$ADMIN" -H "$JSON" -d '{"firstName":"Omar","lastName":"Saleh","email":"omar@virtuthinko.com","gender":"Male","country":"SA","departmentId":1,"managerId":1,"jobTitle":"Accountant","hireDate":"2020-01-01"}' > /dev/null
OMAR_EMP=$(curl -s "$API/employees?search=omar" -H "$ADMIN" | get ".items[0].id")
EMP_ROLE=$(curl -s $API/roles -H "$ADMIN" | get ".find(r=>r.name==='Employee').id")
curl -s -X POST $API/users -H "$ADMIN" -H "$JSON" -d "{\"username\":\"omar.saleh\",\"employeeId\":$OMAR_EMP,\"roleIds\":[$EMP_ROLE]}" > /dev/null
OMAR_USER=$(curl -s "$API/users?search=omar.saleh" -H "$ADMIN" | get ".items[0].id")
SARA_USER=$(curl -s "$API/users?search=sara.ali" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$OMAR_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Omar@2026x"}' > /dev/null
curl -s -X POST $API/users/$SARA_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}' > /dev/null
echo "   Omar employee #$OMAR_EMP, user #$OMAR_USER"

echo; echo "=== cleanup: cancel old test requests ==="
for ID in $(curl -s "$API/leave/requests?pageSize=100" -H "$ADMIN" | get ".items.filter(r=>['pending_manager','pending_hr','approved'].includes(r.status)).map(r=>r.id).join(' ')"); do
  curl -s -X POST $API/leave/requests/$ID/cancel -H "$ADMIN" > /dev/null; echo "   cancelled #$ID"
done

OMAR="Authorization: Bearer $(login omar.saleh Omar@2026x)"
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"

echo; echo "=== leave types: Bahrain vs Saudi ==="
echo -n "   BH: "; curl -s "$API/leave/types?country=BH" -H "$ADMIN" | get ".map(t=>t.code+'='+t.days).join(', ')"
echo -n "   SA: "; curl -s "$API/leave/types?country=SA" -H "$ADMIN" | get ".map(t=>t.code+'='+t.days).join(', ')"
SA_ANNUAL=$(curl -s "$API/leave/types?country=SA" -H "$ADMIN" | get ".find(t=>t.code==='ANNUAL').id")
SA_MATERNITY=$(curl -s "$API/leave/types?country=SA" -H "$ADMIN" | get ".find(t=>t.code==='MATERNITY').id")
BH_SICK=$(curl -s "$API/leave/types?country=BH" -H "$ADMIN" | get ".find(t=>t.code==='SICK').id")

echo; echo "=== Omar balances (Saudi, 6+ years -> 30 annual days) ==="
curl -s $API/leave/balances/me -H "$OMAR" | get ".balances.filter(b=>b.allowance==='yearly').map(b=>'   '+b.code+': entitlement '+b.entitlement+', used '+b.used+', pending '+b.pending+', remaining '+b.remaining).join('\n')"

echo; echo "=== Sara balances (Bahrain, hired Jan 2026 -> accrued 2.5/month) ==="
curl -s $API/leave/balances/me -H "$SARA" | get ".balances.filter(b=>b.allowance==='yearly').map(b=>'   '+b.code+': entitlement '+b.entitlement+', remaining '+b.remaining).join('\n')"

echo; echo "=== Omar requests annual leave Sun 1 - Sat 7 Nov (Saudi counts working days -> 5) ==="
curl -s -X POST $API/leave/requests -H "$OMAR" -H "$JSON" -d "{\"leaveTypeId\":$SA_ANNUAL,\"startDate\":\"2026-11-01\",\"endDate\":\"2026-11-07\",\"reason\":\"Family trip\"}" > /tmp/omar_req.json
show < /tmp/omar_req.json
REQ=$(get .id < /tmp/omar_req.json)

echo; echo "=== Omar overlapping request (should be 409) ==="
curl -s -X POST $API/leave/requests -H "$OMAR" -H "$JSON" -d "{\"leaveTypeId\":$SA_ANNUAL,\"startDate\":\"2026-11-05\",\"endDate\":\"2026-11-06\"}" | show

echo; echo "=== Omar requests maternity leave (should be 400: Female only) ==="
curl -s -X POST $API/leave/requests -H "$OMAR" -H "$JSON" -d "{\"leaveTypeId\":$SA_MATERNITY,\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-10\",\"attachmentUrl\":\"x.pdf\"}" | show

echo; echo "=== Omar tries to approve his own leave (should be 403) ==="
curl -s -X POST $API/leave/requests/$REQ/approve -H "$OMAR" | show

echo; echo "=== Sara (manager) sees pending approvals ==="
curl -s $API/leave/requests/pending -H "$SARA" | get ".map(r=>'   #'+r.id+' '+r.employee.firstName+' '+r.leaveType.code+' '+r.status).join('\n')"

echo; echo "=== Sara approves -> goes to HR ==="
curl -s -X POST $API/leave/requests/$REQ/approve -H "$SARA" -H "$JSON" -d '{"comment":"Enjoy"}' | show

echo; echo "=== HR (admin) approves -> approved ==="
curl -s -X POST $API/leave/requests/$REQ/approve -H "$ADMIN" -H "$JSON" -d '{}' | show

echo; echo "=== approval history ==="
curl -s $API/leave/requests/$REQ -H "$OMAR" | get ".approvals.map(a=>'   '+a.stage+': '+a.decision+' by '+a.approverName+(a.comment?' (\"'+a.comment+'\")':'')).join('\n')"

echo; echo "=== Omar balance after approval (30 - 5 = 25) ==="
curl -s $API/leave/balances/me -H "$OMAR" | get ".balances.filter(b=>b.code==='ANNUAL').map(b=>'   remaining '+b.remaining)[0]"

echo; echo "=== Sara sick leave without certificate (should be 400) ==="
curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_SICK,\"startDate\":\"2026-11-10\",\"endDate\":\"2026-11-27\"}" | show

echo; echo "=== Sara sick leave 18 days (Bahrain: 15 full pay, then half pay) ==="
curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_SICK,\"startDate\":\"2026-11-10\",\"endDate\":\"2026-11-27\",\"attachmentUrl\":\"medical.pdf\"}" > /tmp/sara_req.json
show < /tmp/sara_req.json
SREQ=$(get .id < /tmp/sara_req.json)

echo; echo "=== HR rejects without a reason (should be 400) ==="
curl -s -X POST $API/leave/requests/$SREQ/reject -H "$ADMIN" -H "$JSON" -d '{}' | show

echo; echo "=== HR rejects with a reason ==="
curl -s -X POST $API/leave/requests/$SREQ/reject -H "$ADMIN" -H "$JSON" -d '{"comment":"Certificate not readable"}' | show

echo; echo "=== Omar requests then cancels ==="
CREQ=$(curl -s -X POST $API/leave/requests -H "$OMAR" -H "$JSON" -d "{\"leaveTypeId\":$SA_ANNUAL,\"startDate\":\"2026-12-06\",\"endDate\":\"2026-12-07\"}" | get .id)
curl -s -X POST $API/leave/requests/$CREQ/cancel -H "$OMAR" | show

echo; echo "=== Omar cannot see all requests (should be 403) ==="
curl -s $API/leave/requests -H "$OMAR" | show