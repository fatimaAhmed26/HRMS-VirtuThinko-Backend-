API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"
PERIOD=2027-03

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
fmt() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let o;try{o=JSON.parse(d)}catch{console.log('   (no JSON) '+d.slice(0,80));return}
if(o&&o.message&&o.id===undefined){console.log('   '+o.message+(o.details?' '+JSON.stringify(o.details):''));return}
try{console.log($1)}catch(e){console.log('   ? '+e.message)}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
day() { node -e "const d=new Date();d.setUTCDate(d.getUTCDate()+$1);console.log(d.toISOString().slice(0,10))"; }

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }
SARA_EMP=$(curl -s "$API/employees?search=sara" -H "$ADMIN" | get ".items[0].id")
OMAR_EMP=$(curl -s "$API/employees?search=omar" -H "$ADMIN" | get ".items[0].id")
ALI=$(curl -s "$API/employees?search=ali.intern" -H "$ADMIN" | get ".items[0].id")
LAYLA=$(curl -s "$API/employees?search=layla" -H "$ADMIN" | get ".items[0].id")
[ -z "$ALI" ] || [ -z "$LAYLA" ] && { echo "Run scripts/test-batch1.sh first (it creates Ali the intern and Layla)"; exit 1; }

# remove draft runs for this period from an earlier attempt
for ID in $(curl -s "$API/payroll/runs?period=$PERIOD" -H "$ADMIN" | get ".map(r=>r.id).join(' ')"); do
  [ "$(curl -s $API/payroll/runs/$ID -H "$ADMIN" | get .status)" != "draft" ] && curl -s -X POST $API/payroll/runs/$ID/return -H "$ADMIN" > /dev/null
  curl -s -X DELETE $API/payroll/runs/$ID -H "$ADMIN" > /dev/null
done

echo "=== 1. contracts: internship stipends and the three states ==="
echo -n "   internship contract for Sara (not an intern) -> "
curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$SARA_EMP,\"contractType\":\"internship\",\"startDate\":\"2026-09-01\",\"endDate\":\"2027-08-31\",\"basicSalary\":200}" | get .message
echo -n "   unlimited contract for Ali (an intern) -> "
curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$ALI,\"contractType\":\"unlimited\",\"startDate\":\"2026-09-01\",\"basicSalary\":200}" | get .message
echo -n "   internship without an end date -> "
curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$ALI,\"contractType\":\"internship\",\"startDate\":\"2026-09-01\",\"basicSalary\":200}" | get ".details[0].message"
if [ -z "$(curl -s "$API/contracts?employeeId=$ALI&state=Active" -H "$ADMIN" | get "[0]?.id")" ]; then
  curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$ALI,\"contractType\":\"internship\",\"startDate\":\"2026-09-01\",\"endDate\":\"2027-08-31\",\"basicSalary\":200,\"housingAllowance\":50}" > /dev/null
fi
curl -s "$API/contracts?employeeId=$ALI&state=Active" -H "$ADMIN" | fmt "'   Ali: '+o[0].contractNumber+' '+o[0].contractType+', stipend '+o[0].basicSalary+' '+o[0].currency+', housing '+o[0].housingAllowance+' (ignored for interns)'"
# Omar's SA contract ends 2026-12-15 - renew it so he is paid in $PERIOD (the old one becomes Inactive)
OMAR_END=$(curl -s "$API/contracts?employeeId=$OMAR_EMP&state=Active" -H "$ADMIN" | get "[0]?.endDate?.slice(0,10)")
if [ -z "$OMAR_END" ] || [[ "$OMAR_END" < "$PERIOD-31" ]]; then
  curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$OMAR_EMP,\"contractType\":\"limited\",\"startDate\":\"2026-12-16\",\"endDate\":\"2028-12-15\",\"basicSalary\":12500,\"housingAllowance\":3000,\"transportAllowance\":1000}" > /dev/null
fi
# Layla gets a contract that is then terminated -> Ended
if [ -z "$(curl -s "$API/contracts?employeeId=$LAYLA" -H "$ADMIN" | get "[0]?.id")" ]; then
  LC=$(curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$LAYLA,\"contractType\":\"limited\",\"startDate\":\"2025-01-01\",\"endDate\":\"2027-01-01\",\"basicSalary\":700}" | get .id)
  curl -s -X POST $API/contracts/$LC/terminate -H "$ADMIN" -H "$JSON" -d '{"reason":"Moved to a new PO"}' > /dev/null
fi
curl -s "$API/contracts?employeeId=$OMAR_EMP" -H "$ADMIN" | fmt "'   Omar: '+o.map(c=>c.contractNumber+' '+c.state).join(', ')"
curl -s "$API/contracts?employeeId=$LAYLA" -H "$ADMIN" | fmt "'   Layla: '+o.map(c=>c.contractNumber+' '+c.state).join(', ')"
for S in Active Inactive Ended; do
  curl -s "$API/contracts?state=$S" -H "$ADMIN" | fmt "'   filter state=$S: '+o.length+' contract(s), all '+[...new Set(o.map(c=>c.state))].join('/')"
done

echo; echo "=== 2. payroll per entity ($PERIOD) ==="
echo -n "   run without an entity -> "; curl -s -X POST $API/payroll/runs -H "$ADMIN" -H "$JSON" -d "{\"period\":\"$PERIOD\"}" | get ".details[0].message"
BH_RUN=$(curl -s -X POST $API/payroll/runs -H "$ADMIN" -H "$JSON" -d "{\"period\":\"$PERIOD\",\"entity\":\"BH\"}" | get .id)
SA_RUN=$(curl -s -X POST $API/payroll/runs -H "$ADMIN" -H "$JSON" -d "{\"period\":\"$PERIOD\",\"entity\":\"SA\"}" | get .id)
echo -n "   second BH run for the same month -> "; curl -s -X POST $API/payroll/runs -H "$ADMIN" -H "$JSON" -d "{\"period\":\"$PERIOD\",\"entity\":\"BH\"}" | get .message
curl -s $API/payroll/runs/$BH_RUN -H "$ADMIN" | fmt "'   BH run #'+o.id+': '+o.payslips.map(p=>p.employeeName+' '+p.netSalary+' '+p.currency).join(', ')"
curl -s $API/payroll/runs/$SA_RUN -H "$ADMIN" | fmt "'   SA run #'+o.id+': '+o.payslips.map(p=>p.employeeName+' '+p.netSalary+' '+p.currency).join(', ')"
curl -s $API/payroll/runs/$BH_RUN -H "$ADMIN" | fmt "'   BH skipped: '+(o.warnings||[]).filter(w=>w.skipped).map(w=>w.employee+' ('+w.message+')').join('; ')"
curl -s "$API/payroll/runs?entity=SA" -H "$ADMIN" | fmt "'   runs list ?entity=SA: '+o.map(r=>r.period+' '+r.entity).join(', ')"
ALI_SLIP=$(curl -s $API/payroll/runs/$BH_RUN -H "$ADMIN" | get ".payslips.find(p=>p.employeeId===$ALI)?.id")
curl -s $API/payroll/payslips/$ALI_SLIP -H "$ADMIN" | fmt "'   Ali payslip: earnings '+o.earnings.map(i=>i.name+' '+i.amount).join(', ')+' | deductions: '+(o.deductions.length||'none')+' | employer SI: '+(o.employerContributions.length||'none')+' | net '+o.netSalary"
echo "   payroll report (both entities):"
curl -s "$API/reports/payroll?period=$PERIOD" -H "$ADMIN" | fmt "'     '+o.subtitle+' - '+o.rows.filter(r=>r.code==='TOTAL').map(r=>r.currency+' net '+r.net).join(', ')"

echo; echo "=== 3. outsourced deployment alerts (3 months, 2 months, 1 month, 7 days) ==="
alerts() { curl -s "$API/notifications?pageSize=100" -H "$ADMIN" | fmt "o.items.filter(n=>n.title.includes('Layla')&&n.title.startsWith('Deployment')).map(n=>'     '+n.title+' | '+n.body).join('\n')||'     (none)'"; }
curl -s -X PATCH $API/employees/$LAYLA -H "$ADMIN" -H "$JSON" -d "{\"deploymentEnd\":\"$(day 45)\"}" > /dev/null
curl -s -X POST $API/settings/run-checks -H "$ADMIN" > /dev/null
echo "   deployment ends in 45 days -> HR notifications:"; alerts
curl -s -X PATCH $API/employees/$LAYLA -H "$ADMIN" -H "$JSON" -d "{\"deploymentEnd\":\"$(day 5)\"}" > /dev/null
curl -s -X POST $API/settings/run-checks -H "$ADMIN" > /dev/null
curl -s -X POST $API/settings/run-checks -H "$ADMIN" > /dev/null
echo "   ends in 5 days (checks run twice - no duplicates):"; alerts
curl -s -X PATCH $API/employees/$LAYLA -H "$ADMIN" -H "$JSON" -d '{"deploymentEnd":"2027-01-01"}' > /dev/null
echo "   (Layla's deployment end set back to 2027-01-01)"