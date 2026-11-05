
API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
fmt() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let o;try{o=JSON.parse(d)}catch{console.log('   (no JSON) '+d.slice(0,80));return}
if(o&&o.message&&o.id===undefined){console.log('   '+o.message+(o.details?' '+JSON.stringify(o.details):''));return}
try{console.log($1)}catch(e){console.log('   ? '+e.message)}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
day() { node -e "const d=new Date();d.setUTCDate(d.getUTCDate()+$1);console.log(d.toISOString().slice(0,10))"; }

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }
SARA_USER=$(curl -s "$API/users?search=sara.ali" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$SARA_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Sara@2026x"}' > /dev/null
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"
SARA_EMP=$(curl -s "$API/employees?search=sara" -H "$ADMIN" | get ".items[0].id")
EMP_ROLE=$(curl -s $API/roles -H "$ADMIN" | get ".find(r=>r.name==='Employee').id")

echo "=== 1. payroll is hidden from employees ==="
SLIP=$(curl -s "$API/payroll/runs" -H "$ADMIN" | get "[0]?.id")
SLIP=$(curl -s "$API/payroll/runs/$SLIP" -H "$ADMIN" | get ".payslips[0]?.id")
echo -n "   Sara opens a payslip -> "; curl -s $API/payroll/payslips/$SLIP -H "$SARA" | get .message
echo -n "   Sara opens 'my payslips' -> "; curl -s $API/payroll/payslips/me -H "$SARA" | get .message
echo "   HR opens the payslip PDF -> HTTP $(curl -s -o /dev/null -w '%{http_code}' $API/payroll/payslips/$SLIP/pdf -H "$ADMIN")"
curl -s $API/dashboard/me -H "$SARA" | fmt "'   Sara home cards: '+Object.keys(o.cards).join(', ')"
curl -s $API/contracts/me -H "$SARA" | fmt "'   Sara contract shows salary? '+(o[0] && 'basicSalary' in o[0] ? 'YES - wrong' : 'no')"

echo; echo "=== 2. employment types & interns ==="
echo -n "   old type 'Contract' -> "; curl -s -X POST $API/employees -H "$ADMIN" -H "$JSON" -d '{"firstName":"X","lastName":"Y","email":"x.y@virtuthinko.com","employmentType":"Contract"}' | get ".details[0].message"
curl -s -X POST $API/employees -H "$ADMIN" -H "$JSON" -d '{"firstName":"Ali","lastName":"Intern","email":"ali.intern@virtuthinko.com","employmentType":"Intern","departmentId":1,"jobTitle":"IT Intern","hireDate":"2026-09-01"}' > /dev/null
INTERN=$(curl -s "$API/employees?search=ali.intern" -H "$ADMIN" | get ".items[0].id")
curl -s "$API/employees?employmentType=Intern" -H "$ADMIN" | fmt "'   interns list: '+o.items.map(e=>e.firstName+' '+e.lastName+' ('+e.employmentType+')').join(', ')"
echo -n "   portal account for the intern -> "; curl -s -X POST $API/users -H "$ADMIN" -H "$JSON" -d "{\"username\":\"ali.intern\",\"employeeId\":$INTERN,\"roleIds\":[$EMP_ROLE]}" | get .message
echo -n "   make Sara (who has a login) an intern -> "; curl -s -X PATCH $API/employees/$SARA_EMP -H "$ADMIN" -H "$JSON" -d '{"employmentType":"Intern"}' | get .message

echo; echo "=== 3. client companies & outsourced staff ==="
curl -s -X POST $API/clients -H "$ADMIN" -H "$JSON" -d '{"name":"BBK","annualLeaveDays":21}' > /dev/null
curl -s -X POST $API/clients -H "$ADMIN" -H "$JSON" -d '{"name":"BNP Paribas","annualLeaveDays":25}' > /dev/null
echo -n "   duplicate client -> "; curl -s -X POST $API/clients -H "$ADMIN" -H "$JSON" -d '{"name":"BBK","annualLeaveDays":30}' | get .message
BBK=$(curl -s $API/clients -H "$ADMIN" | get ".find(c=>c.name==='BBK').id")
curl -s -X PATCH $API/clients/$BBK -H "$ADMIN" -H "$JSON" -d '{"annualLeaveDays":21}' > /dev/null
echo -n "   outsourced without a client -> "; curl -s -X POST $API/employees -H "$ADMIN" -H "$JSON" -d '{"firstName":"Layla","lastName":"Mahmood","email":"layla@virtuthinko.com","employmentType":"Outsourced"}' | get .message
curl -s -X POST $API/employees -H "$ADMIN" -H "$JSON" -d "{\"firstName\":\"Layla\",\"lastName\":\"Mahmood\",\"email\":\"layla@virtuthinko.com\",\"gender\":\"Female\",\"employmentType\":\"Outsourced\",\"clientCompanyId\":$BBK,\"clientSupervisor\":\"Ahmed (BBK IT)\",\"poNumber\":\"PO-2026-117\",\"deploymentStart\":\"2025-01-01\",\"deploymentEnd\":\"2027-01-01\",\"departmentId\":1,\"jobTitle\":\"Support Engineer\",\"hireDate\":\"2025-01-01\"}" > /dev/null
LAYLA=$(curl -s "$API/employees?search=layla" -H "$ADMIN" | get ".items[0].id")
curl -s $API/employees/$LAYLA -H "$ADMIN" | fmt "'   Layla: '+o.employmentType+' at '+o.clientCompany.name+', PO '+o.poNumber+', supervisor '+o.clientSupervisor"
curl -s -X POST $API/users -H "$ADMIN" -H "$JSON" -d "{\"username\":\"layla.m\",\"employeeId\":$LAYLA,\"roleIds\":[$EMP_ROLE]}" > /dev/null
LAYLA_USER=$(curl -s "$API/users?search=layla.m" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$LAYLA_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Layla@2026x"}' > /dev/null
LAYLA_T="Authorization: Bearer $(login layla.m Layla@2026x)"
curl -s $API/leave/balances/me -H "$LAYLA_T" | fmt "'   Layla annual leave (BBK days): '+o.balances.find(b=>b.code==='ANNUAL').entitlement"
curl -s -X PATCH $API/clients/$BBK -H "$ADMIN" -H "$JSON" -d '{"annualLeaveDays":24}' > /dev/null
curl -s $API/leave/balances/me -H "$LAYLA_T" | fmt "'   after BBK changes to 24 days: '+o.balances.find(b=>b.code==='ANNUAL').entitlement"
curl -s $API/clients -H "$ADMIN" | fmt "o.map(c=>'   client '+c.name+': '+c.annualLeaveDays+' days, '+c.activeStaff+' staff').join('\n')"
curl -s -X PATCH $API/clients/$BBK -H "$ADMIN" -H "$JSON" -d '{"annualLeaveDays":21}' > /dev/null

echo; echo "=== 4. leave notice rule (annual: over 4 days needs 14 days notice) ==="
BH_ANNUAL=$(curl -s "$API/leave/types?country=BH" -H "$ADMIN" | get ".find(t=>t.code==='ANNUAL').id")
curl -s "$API/leave/types?country=BH" -H "$ADMIN" | fmt "'   BH annual rule: up to '+o.find(t=>t.code==='ANNUAL').noticeFreeDays+' days anytime, otherwise '+o.find(t=>t.code==='ANNUAL').noticeDays+' days notice'"
echo -n "   6 days starting in 7 days -> "; curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_ANNUAL,\"startDate\":\"$(day 7)\",\"endDate\":\"$(day 12)\"}" | get ".message||o.status"
R1=$(curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_ANNUAL,\"startDate\":\"$(day 1)\",\"endDate\":\"$(day 3)\"}" | get .id)
echo "   3 days starting tomorrow -> request #$R1 $( [ -n "$R1" ] && echo accepted || echo FAILED )"
R2=$(curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_ANNUAL,\"startDate\":\"$(day 40)\",\"endDate\":\"$(day 45)\"}" | get .id)
echo "   6 days starting in 40 days -> request #$R2 $( [ -n "$R2" ] && echo accepted || echo FAILED )"
for R in $R1 $R2; do curl -s -X POST $API/leave/requests/$R/cancel -H "$SARA" > /dev/null; done
echo "   (both cancelled again)"