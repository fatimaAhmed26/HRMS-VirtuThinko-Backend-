#!/bin/bash
# Team calendar + leave planner reservations.  Run: bash scripts/test-leave-team.sh  (safe to run again)
API=http://127.0.0.1:5000/api
JSON="Content-Type: application/json"
get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
day() { node -e "const d=new Date();d.setUTCDate(d.getUTCDate()+$1);console.log(d.toISOString().slice(0,10))"; }

ADMIN="Authorization: Bearer $(login admin@virtuthinko.com ChangeMe@2026)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }
SARA_USER=$(curl -s "$API/users?search=sara.ali" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$SARA_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}' > /dev/null
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"
ANNUAL=$(curl -s "$API/leave/types?country=BH" -H "$SARA" | get ".find(t=>t.code==='ANNUAL').id")
SICK=$(curl -s "$API/leave/types?country=BH" -H "$SARA" | get ".find(t=>t.code==='SICK').id")

echo "=== 1. reservations ==="
for R in $(curl -s $API/leave/reservations/me -H "$SARA" | get ".map(r=>r.id).join(' ')"); do curl -s -X DELETE $API/leave/reservations/$R -H "$SARA"; done
echo -n "   reserve sick leave -> "; curl -s -X POST $API/leave/reservations -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$SICK,\"startDate\":\"$(day 60)\",\"endDate\":\"$(day 62)\"}" | get .message
echo -n "   reserve in the past -> "; curl -s -X POST $API/leave/reservations -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$ANNUAL,\"startDate\":\"$(day -3)\",\"endDate\":\"$(day -1)\"}" | get .message
RES=$(curl -s -X POST $API/leave/reservations -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$ANNUAL,\"startDate\":\"$(day 60)\",\"endDate\":\"$(day 64)\"}" | get .id)
echo "   annual leave in 60 days -> reservation #$RES $( [ -n "$RES" ] && echo created || echo FAILED )"
echo -n "   overlapping reservation -> "; curl -s -X POST $API/leave/reservations -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$ANNUAL,\"startDate\":\"$(day 62)\",\"endDate\":\"$(day 66)\"}" | get .message

echo; echo "=== 2. calendar ==="
curl -s "$API/leave/calendar?from=$(day 55)&to=$(day 70)" -H "$SARA" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('   Sara sees '+o.leave.length+' approved leave, '+o.reservations.length+' reservation(s): '+o.reservations.map(r=>r.name+' '+r.typeName+(r.mine?' (mine)':'')).join(', '))})"
echo -n "   range over 3 months -> "; curl -s "$API/leave/calendar?from=$(day 0)&to=$(day 120)" -H "$SARA" | get ".details[0].message"

echo; echo "=== 3. a real request replaces the reservation ==="
REQ=$(curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$ANNUAL,\"startDate\":\"$(day 60)\",\"endDate\":\"$(day 64)\"}" | get .id)
echo "   leave request #$REQ submitted"
echo "   reservations left: $(curl -s $API/leave/reservations/me -H "$SARA" | get .length)"
curl -s -X POST $API/leave/requests/$REQ/cancel -H "$SARA" > /dev/null
echo "   (request cancelled again)"
