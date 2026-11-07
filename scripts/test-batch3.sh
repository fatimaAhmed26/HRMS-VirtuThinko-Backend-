API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
fmt() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let o;try{o=JSON.parse(d)}catch{console.log('   (no JSON) '+d.slice(0,80));return}
if(o&&o.message&&o.id===undefined){console.log('   '+o.message+(o.details?' '+JSON.stringify(o.details):''));return}
try{console.log($1)}catch(e){console.log('   ? '+e.message)}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }
HR_ROLE=$(curl -s $API/roles -H "$ADMIN" | get ".find(r=>r.name==='HR Admin').id")
OMAR_EMP=$(curl -s "$API/employees?search=omar" -H "$ADMIN" | get ".items[0].id")
SARA_EMP=$(curl -s "$API/employees?search=sara" -H "$ADMIN" | get ".items[0].id")

# two HR users: one for Bahrain, one for Saudi (created once, scope reset every run)
hr_user() { # username email scope
  curl -s -X POST $API/users -H "$ADMIN" -H "$JSON" -d "{\"username\":\"$1\",\"email\":\"$2\",\"roleIds\":[$HR_ROLE],\"entityScope\":\"$3\"}" > /dev/null
  local ID=$(curl -s "$API/users?search=$1" -H "$ADMIN" | get ".items[0].id")
  curl -s -X PATCH $API/users/$ID -H "$ADMIN" -H "$JSON" -d "{\"entityScope\":\"$3\"}" > /dev/null
  curl -s -X POST $API/users/$ID/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"HrScope@2026x"}' > /dev/null
  echo $ID
}
HRBH_ID=$(hr_user hr.bh hr.bh@virtuthinko.com BH)
HRSA_ID=$(hr_user hr.sa hr.sa@virtuthinko.com SA)
HRBH="Authorization: Bearer $(login hr.bh HrScope@2026x)"
HRSA="Authorization: Bearer $(login hr.sa HrScope@2026x)"

echo "=== 1. users have an entity scope ==="
curl -s $API/users/$HRBH_ID -H "$ADMIN" | fmt "'   '+o.username+': '+o.roles.map(r=>r.name).join(', ')+', scope '+o.entityScope"
curl -s $API/users/$HRSA_ID -H "$ADMIN" | fmt "'   '+o.username+': '+o.roles.map(r=>r.name).join(', ')+', scope '+o.entityScope"
echo -n "   invalid scope -> "; curl -s -X PATCH $API/users/$HRBH_ID -H "$ADMIN" -H "$JSON" -d '{"entityScope":"UK"}' | get ".details[0].message"

echo; echo "=== 2. employees ==="
countries="'   '+o.items.length+' employee(s), countries: '+[...new Set(o.items.map(e=>e.country))].join('/')"
echo -n "   admin (ALL): "; curl -s "$API/employees?pageSize=100" -H "$ADMIN" | fmt "$countries" | sed 's/^ *//'
echo -n "   hr.bh:       "; curl -s "$API/employees?pageSize=100" -H "$HRBH" | fmt "$countries" | sed 's/^ *//'
echo -n "   hr.sa:       "; curl -s "$API/employees?pageSize=100" -H "$HRSA" | fmt "$countries" | sed 's/^ *//'
echo -n "   hr.bh opens Omar (SA) -> "; curl -s $API/employees/$OMAR_EMP -H "$HRBH" | get .message
echo -n "   hr.bh edits Omar -> "; curl -s -X PATCH $API/employees/$OMAR_EMP -H "$HRBH" -H "$JSON" -d '{"jobTitle":"X"}' | get .message
echo -n "   hr.bh adds an SA employee -> "; curl -s -X POST $API/employees -H "$HRBH" -H "$JSON" -d '{"firstName":"Test","lastName":"Saudi","email":"test.sa@virtuthinko.com","country":"SA"}' | get .message
echo -n "   hr.bh moves Sara to SA -> "; curl -s -X PATCH $API/employees/$SARA_EMP -H "$HRBH" -H "$JSON" -d '{"country":"SA"}' | get .message
curl -s $API/employees/$SARA_EMP -H "$HRBH" | fmt "'   hr.bh opens Sara (BH) -> '+o.firstName+' '+o.lastName+' ('+o.country+')'"

echo; echo "=== 3. contracts, documents, leave ==="
curl -s "$API/contracts" -H "$HRBH" | fmt "'   hr.bh contracts: '+o.length+', employees: '+[...new Set(o.map(c=>c.employee.country))].join('/')"
OMAR_CT=$(curl -s "$API/contracts?employeeId=$OMAR_EMP&state=Active" -H "$ADMIN" | get "[0]?.id")
echo -n "   hr.bh opens Omar's contract -> "; curl -s $API/contracts/$OMAR_CT -H "$HRBH" | get .message
curl -s "$API/contracts/$OMAR_CT" -H "$HRSA" | fmt "'   hr.sa opens Omar\\'s contract -> '+o.contractNumber+' '+o.state"
curl -s "$API/documents?pageSize=100" -H "$HRSA" | fmt "'   hr.sa documents: '+o.total+' (Sara\\'s BH documents hidden)'"
curl -s "$API/leave/requests?pageSize=100" -H "$HRBH" | fmt "'   hr.bh leave requests: '+o.total+', employees: '+([...new Set(o.items.map(r=>r.employee.country))].join('/')||'-')"
echo -n "   hr.bh views Omar's leave balance -> "; curl -s $API/leave/balances/$OMAR_EMP -H "$HRBH" | get .message
SA_TYPE=$(curl -s "$API/leave/types?country=SA" -H "$ADMIN" | get "[0].id")
echo -n "   hr.bh edits an SA leave type -> "; curl -s -X PATCH $API/leave/types/$SA_TYPE -H "$HRBH" -H "$JSON" -d '{"description":"x"}' | get .message

echo; echo "=== 4. payroll ==="
curl -s "$API/payroll/runs" -H "$HRBH" | fmt "'   hr.bh runs: '+o.map(r=>r.period+' '+r.entity).join(', ')"
curl -s "$API/payroll/runs" -H "$HRSA" | fmt "'   hr.sa runs: '+o.map(r=>r.period+' '+r.entity).join(', ')"
SA_RUN=$(curl -s "$API/payroll/runs?entity=SA" -H "$ADMIN" | get "[0]?.id")
echo -n "   hr.bh opens the SA run -> "; curl -s $API/payroll/runs/$SA_RUN -H "$HRBH" | get .message
echo -n "   hr.bh lists ?entity=SA -> "; curl -s "$API/payroll/runs?entity=SA" -H "$HRBH" | get .message
echo -n "   hr.bh creates an SA run -> "; curl -s -X POST $API/payroll/runs -H "$HRBH" -H "$JSON" -d '{"period":"2027-04","entity":"SA"}' | get .message
OMAR_SLIP=$(curl -s $API/payroll/runs/$SA_RUN -H "$ADMIN" | get ".payslips[0]?.id")
echo -n "   hr.bh opens Omar's payslip -> "; curl -s $API/payroll/payslips/$OMAR_SLIP -H "$HRBH" | get .message

echo; echo "=== 5. reports and dashboard ==="
curl -s "$API/reports/employees" -H "$HRBH" | fmt "'   hr.bh employee report: '+o.rows.length+' row(s), countries: '+[...new Set(o.rows.map(r=>r.country))].join('/')"
echo -n "   hr.bh report ?country=SA -> "; curl -s "$API/reports/employees?country=SA" -H "$HRBH" | get .message
curl -s "$API/reports/payroll?period=2027-03" -H "$HRSA" | fmt "'   hr.sa payroll report: '+o.subtitle"
curl -s "$API/dashboard/admin" -H "$HRBH" | fmt "'   hr.bh dashboard: entities '+o.entities+', '+o.employees.active+' active, payroll '+o.payroll.latestRuns.map(r=>r.entity+' '+r.period+' '+r.status).join(', ')"
curl -s "$API/dashboard/admin" -H "$ADMIN" | fmt "'   admin dashboard: entities '+o.entities+', '+o.employees.active+' active, payroll '+o.payroll.latestRuns.map(r=>r.entity+' '+r.period+' '+r.status).join(', ')"

echo; echo "=== 6. requests and notifications go to the right HR ==="
OMAR_USER=$(curl -s "$API/users?search=omar.saleh" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$OMAR_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Omar@2026x"}' > /dev/null
OMAR="Authorization: Bearer $(login omar.saleh Omar@2026x)"
TYPE=$(curl -s $API/requests/types -H "$OMAR" | get ".find(t=>!t.requiresAttachment).id")
REQ=$(curl -s -X POST $API/requests -H "$OMAR" -H "$JSON" -d "{\"typeId\":$TYPE,\"purpose\":\"Scope test $(date +%s)\"}" | get .id)
echo "   Omar (SA) submits request #$REQ"
last() { curl -s "$API/notifications?pageSize=5" -H "$1" | get ".items.some(n=>n.link==='/requests/$REQ')?'notified':'not notified'"; }
echo "   hr.sa: $(last "$HRSA") | hr.bh: $(last "$HRBH")"
echo -n "   hr.bh opens the request -> "; curl -s $API/requests/$REQ -H "$HRBH" | get .message
curl -s "$API/requests/$REQ" -H "$HRSA" | fmt "'   hr.sa opens the request -> '+o.reference+' '+o.status"
curl -s -X POST $API/requests/$REQ/cancel -H "$OMAR" > /dev/null; echo "   (request cancelled again)"