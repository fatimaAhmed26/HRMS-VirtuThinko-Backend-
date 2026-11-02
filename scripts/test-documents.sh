#!/bin/bash
# Documents / uploads test. Run: bash scripts/test-documents.sh   
# Needs test-users.sh and test-leave.sh to have run once 
API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d)$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
msg() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('   '+(o.id?'#'+o.id+' '+o.category+' \"'+o.title+'\" '+o.mimeType+' '+o.size+' bytes':o.message))})"; }

# test files
T=$(mktemp -d)
printf '%%PDF-1.4\n%%Sick note for testing\n%%%%EOF\n' > "$T/sick-note.pdf"
printf '%%PDF-1.4\n%%ID copy\n%%%%EOF\n' > "$T/id-copy.pdf"
printf '%%PDF-1.4\n%%HR internal note\n%%%%EOF\n' > "$T/internal.pdf"
printf 'MZ this is really a program' > "$T/fake.pdf"
{ printf '%%PDF-1.4\n'; head -c 6000000 /dev/zero; } > "$T/big.pdf"
EXPIRY=$(node -e "const d=new Date();d.setDate(d.getDate()+20);console.log(d.toISOString().slice(0,10))")

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"
OMAR="Authorization: Bearer $(login omar.saleh Omar@2026x)"
OMAR_EMP=$(curl -s "$API/employees?search=omar" -H "$ADMIN" | get ".items[0].id")
BH_SICK=$(curl -s "$API/leave/types?country=BH" -H "$ADMIN" | get ".find(t=>t.code==='SICK').id")
SA_SICK=$(curl -s "$API/leave/types?country=SA" -H "$ADMIN" | get ".find(t=>t.code==='SICK').id")

echo "=== cleanup: cancel old test leave requests ==="
for ID in $(curl -s "$API/leave/requests?pageSize=100" -H "$ADMIN" | get ".items.filter(r=>['pending_manager','pending_hr','approved'].includes(r.status)).map(r=>r.id).join(' ')"); do
  curl -s -X POST $API/leave/requests/$ID/cancel -H "$ADMIN" > /dev/null; echo "   cancelled #$ID"
done

echo; echo "=== Sara uploads her sick note ==="
curl -s -X POST $API/documents -H "$SARA" -F "file=@$T/sick-note.pdf" -F "category=leave_attachment" > "$T/r.json"; msg < "$T/r.json"
SARA_DOC=$(get .id < "$T/r.json")

echo; echo "=== fake PDF (really a program) -> 400 ==="
curl -s -X POST $API/documents -H "$SARA" -F "file=@$T/fake.pdf" -F "category=personal" | msg

echo; echo "=== 6 MB file -> 400 ==="
curl -s -X POST $API/documents -H "$SARA" -F "file=@$T/big.pdf" -F "category=personal" | msg

echo; echo "=== Sara uploads an ID copy (HR-only category) -> 403 ==="
curl -s -X POST $API/documents -H "$SARA" -F "file=@$T/id-copy.pdf" -F "category=id_copy" | msg

echo; echo "=== Sara uploads for Omar -> 403 ==="
curl -s -X POST $API/documents -H "$SARA" -F "file=@$T/id-copy.pdf" -F "category=personal" -F "employeeId=$OMAR_EMP" | msg

echo; echo "=== HR uploads Omar's ID copy (expires in 20 days) ==="
curl -s -X POST $API/documents -H "$ADMIN" -F "file=@$T/id-copy.pdf" -F "category=id_copy" -F "employeeId=$OMAR_EMP" -F "title=CPR copy" -F "expiryDate=$EXPIRY" > "$T/r.json"; msg < "$T/r.json"
OMAR_ID_DOC=$(get .id < "$T/r.json")

echo; echo "=== HR uploads an internal note about Omar (hidden from him) ==="
curl -s -X POST $API/documents -H "$ADMIN" -F "file=@$T/internal.pdf" -F "category=other" -F "employeeId=$OMAR_EMP" -F "title=Internal HR note" -F "visibleToEmployee=false" > "$T/r.json"; msg < "$T/r.json"
INTERNAL_DOC=$(get .id < "$T/r.json")

echo; echo "=== Omar's documents (should NOT include the internal note) ==="
curl -s $API/documents/me -H "$OMAR" | get ".map(d=>'   #'+d.id+' '+d.category+' \"'+d.title+'\"').join('\n')"

echo; echo "=== Omar downloads his ID copy -> 200 ==="
CODE=$(curl -s -o "$T/dl.pdf" -w "%{http_code}" $API/documents/$OMAR_ID_DOC/download -H "$OMAR")
echo "   HTTP $CODE, first line: $(head -c 8 "$T/dl.pdf")"

echo; echo "=== Omar downloads the internal note -> 403 ==="
curl -s $API/documents/$INTERNAL_DOC/download -H "$OMAR" | msg

echo; echo "=== Omar downloads Sara's sick note -> 403 ==="
curl -s $API/documents/$SARA_DOC/download -H "$OMAR" | msg

echo; echo "=== Sara requests sick leave with her uploaded note ==="
curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_SICK,\"startDate\":\"2026-11-10\",\"endDate\":\"2026-11-12\",\"attachmentId\":$SARA_DOC}" > "$T/r.json"
SARA_LEAVE=$(get .id < "$T/r.json")
echo "   request #$SARA_LEAVE -> $(get .status < "$T/r.json"), attachment: $(get .attachment.originalName < "$T/r.json")"

echo; echo "=== Omar uploads a sick note and requests leave (his manager is Sara) ==="
OMAR_NOTE=$(curl -s -X POST $API/documents -H "$OMAR" -F "file=@$T/sick-note.pdf" -F "category=leave_attachment" | get .id)
curl -s -X POST $API/leave/requests -H "$OMAR" -H "$JSON" -d "{\"leaveTypeId\":$SA_SICK,\"startDate\":\"2026-11-15\",\"endDate\":\"2026-11-16\",\"attachmentId\":$OMAR_NOTE}" > "$T/r.json"
echo "   request #$(get .id < "$T/r.json") -> $(get .status < "$T/r.json")"

echo; echo "=== Sara (Omar's manager) opens his sick note -> 200 ==="
echo "   HTTP $(curl -s -o /dev/null -w "%{http_code}" $API/documents/$OMAR_NOTE/download -H "$SARA")"

echo; echo "=== Omar tries to attach Sara's document to his leave -> 400 ==="
curl -s -X POST $API/leave/requests -H "$OMAR" -H "$JSON" -d "{\"leaveTypeId\":$SA_SICK,\"startDate\":\"2026-11-20\",\"endDate\":\"2026-11-20\",\"attachmentId\":$SARA_DOC}" | msg

echo; echo "=== HR: documents expiring within 30 days ==="
curl -s "$API/documents?expiringWithinDays=30" -H "$ADMIN" | get ".items.map(d=>'   #'+d.id+' '+d.employee.firstName+' \"'+d.title+'\" expires '+d.expiryDate.slice(0,10)).join('\n')"

echo; echo "=== HR deletes Sara's note while it's on an active leave -> 400 ==="
curl -s -X DELETE $API/documents/$SARA_DOC -H "$ADMIN" | msg

echo; echo "=== cancel the leave, then delete -> 204, then it's gone (404) ==="
curl -s -X POST $API/leave/requests/$SARA_LEAVE/cancel -H "$SARA" > /dev/null
echo "   delete: HTTP $(curl -s -o /dev/null -w "%{http_code}" -X DELETE $API/documents/$SARA_DOC -H "$ADMIN")"
curl -s $API/documents/$SARA_DOC -H "$ADMIN" | msg

echo; echo "=== Omar cannot list all documents -> 403 ==="
curl -s $API/documents -H "$OMAR" | msg

rm -rf "$T"