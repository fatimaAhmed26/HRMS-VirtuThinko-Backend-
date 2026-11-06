PERIOD=${1:-2026-11}
API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
fmt() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let o;try{o=JSON.parse(d)}catch{console.log('   (no JSON) '+d.slice(0,80));return}
if(o&&o.message&&o.id===undefined){console.log('   '+o.message+(o.details?' '+JSON.stringify(o.details):''));return}
try{console.log($1)}catch(e){console.log('   ? '+e.message)}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
slip() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);if(s.message){console.log('   '+s.message);return}
const p=(l)=>l.map(i=>'     '+(i.name+(i.rate!==undefined?' ('+i.rate+'%)':'')).padEnd(38)+String(i.amount).padStart(12)+(i.note?'   '+i.note:'')).join('\n');
console.log('   '+s.employeeName+' ('+s.country+', '+s.currency+')');
console.log('   Earnings:\n'+p(s.earnings));console.log('   Deductions:\n'+p(s.deductions));
console.log('   '+'Gross'.padEnd(40)+String(s.grossSalary).padStart(12));console.log('   '+'Total deductions'.padEnd(40)+String(s.totalDeductions).padStart(12));
console.log('   '+'NET'.padEnd(40)+String(s.netSalary).padStart(12));console.log('   Employer cost:\n'+p(s.employerContributions));})"; }

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }

echo "=== setup (period $PERIOD) ==="
SARA_EMP=$(curl -s "$API/employees?search=sara" -H "$ADMIN" | get ".items[0].id")
OMAR_EMP=$(curl -s "$API/employees?search=omar" -H "$ADMIN" | get ".items[0].id")
curl -s -X PATCH $API/employees/$SARA_EMP -H "$ADMIN" -H "$JSON" -d '{"isNational":true}' > /dev/null
curl -s -X PATCH $API/employees/$OMAR_EMP -H "$ADMIN" -H "$JSON" -d '{"isNational":false}' > /dev/null
echo "   Sara = Bahraini national (BH), Omar = expatriate (SA)"

# payroll officer account (prepares payroll; admin approves = separation of duties)
PO_ROLE=$(curl -s $API/roles -H "$ADMIN" | get ".find(r=>r.name==='Payroll Officer').id")
curl -s -X POST $API/users -H "$ADMIN" -H "$JSON" -d "{\"username\":\"payroll.officer\",\"email\":\"payroll@virtuthinko.com\",\"roleIds\":[$PO_ROLE]}" > /dev/null
PO_USER=$(curl -s "$API/users?search=payroll.officer" -H "$ADMIN" | get ".items[0].id")
curl -s -X POST $API/users/$PO_USER/reset-password -H "$ADMIN" -H "$JSON" -d '{"password":"Payroll@2026x"}' > /dev/null
OFFICER="Authorization: Bearer $(login payroll.officer Payroll@2026x)"
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"
OMAR="Authorization: Bearer $(login omar.saleh Omar@2026x)"

# remove an unfinished run for this period from an earlier attempt
OLD=$(curl -s $API/payroll/runs -H "$ADMIN" | get ".find(r=>r.period==='$PERIOD')?.id")
if [ -n "$OLD" ]; then
  STATUS=$(curl -s $API/payroll/runs/$OLD -H "$ADMIN" | get .status)
  if [ "$STATUS" = "processed" ] || [ "$STATUS" = "paid" ]; then
    echo "   Payroll $PERIOD is already $STATUS - run again with a new month, e.g.: bash scripts/test-payroll.sh 2026-12"; exit 1
  fi
  [ "$STATUS" != "draft" ] && curl -s -X POST $API/payroll/runs/$OLD/return -H "$ADMIN" > /dev/null
  curl -s -X DELETE $API/payroll/runs/$OLD -H "$OFFICER" > /dev/null; echo "   removed unfinished run #$OLD"
fi
for ID in $(curl -s "$API/leave/requests?pageSize=100" -H "$ADMIN" | get ".items.filter(r=>['pending_manager','pending_hr','approved'].includes(r.status)).map(r=>r.id).join(' ')"); do
  curl -s -X POST $API/leave/requests/$ID/cancel -H "$ADMIN" > /dev/null
done

echo; echo "=== contracts (salary source, BR-4.10) ==="
curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$SARA_EMP,\"contractType\":\"unlimited\",\"startDate\":\"2026-01-15\",\"basicSalary\":800,\"housingAllowance\":200,\"transportAllowance\":50}" | fmt "'   Sara: #'+o.id+' '+o.currency+' basic '+o.basicSalary+' housing '+o.housingAllowance+' transport '+o.transportAllowance"
curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$OMAR_EMP,\"contractType\":\"limited\",\"startDate\":\"2020-01-01\",\"endDate\":\"2026-12-15\",\"basicSalary\":12000,\"housingAllowance\":3000,\"transportAllowance\":1000}" | fmt "'   Omar: #'+o.id+' '+o.currency+' basic '+o.basicSalary+' housing '+o.housingAllowance+' transport '+o.transportAllowance"
echo -n "   Sara's contracts (only 1 active): "; curl -s "$API/contracts?employeeId=$SARA_EMP" -H "$ADMIN" | get ".map(c=>'#'+c.id+' '+c.status).join(', ')"
echo -n "   contracts expiring within 60 days: "; curl -s "$API/contracts?expiringWithinDays=60" -H "$ADMIN" | get ".map(c=>c.employee.firstName+' ends '+c.endDate.slice(0,10)).join(', ')"
echo -n "   limited contract without end date -> "; curl -s -X POST $API/contracts -H "$ADMIN" -H "$JSON" -d "{\"employeeId\":$OMAR_EMP,\"contractType\":\"limited\",\"startDate\":\"2026-01-01\",\"basicSalary\":1}" | get ".details[0].message"

echo; echo "=== leave in $PERIOD ==="
BH_UNPAID=$(curl -s "$API/leave/types?country=BH" -H "$ADMIN" | get ".find(t=>t.code==='UNPAID').id")
BH_SICK=$(curl -s "$API/leave/types?country=BH" -H "$ADMIN" | get ".find(t=>t.code==='SICK').id")
U=$(curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_UNPAID,\"startDate\":\"$PERIOD-09\",\"endDate\":\"$PERIOD-10\",\"reason\":\"Personal\"}" | get .id)
printf '%%PDF-1.4\n%%note\n' > /tmp/payroll-note.pdf
NOTE=$(curl -s -X POST $API/documents -H "$SARA" -F "file=@/tmp/payroll-note.pdf" -F "category=leave_attachment" | get .id)
S=$(curl -s -X POST $API/leave/requests -H "$SARA" -H "$JSON" -d "{\"leaveTypeId\":$BH_SICK,\"startDate\":\"$PERIOD-12\",\"endDate\":\"$PERIOD-29\",\"attachmentId\":$NOTE}" | get .id)
for ID in $U $S; do curl -s -X POST $API/leave/requests/$ID/approve -H "$ADMIN" -H "$JSON" -d '{}' | fmt "'   #'+o.id+' '+o.leaveType.code+' '+o.days+' days -> '+o.status+' pay='+JSON.stringify(o.payBreakdown)"; done

echo; echo "=== allowances & deductions (officer enters, admin approves) ==="
TYPES=$(curl -s $API/payroll/item-types -H "$OFFICER")
BONUS=$(echo "$TYPES" | get ".find(t=>t.code==='BONUS').id"); OVERTIME=$(echo "$TYPES" | get ".find(t=>t.code==='OVERTIME').id"); LOAN=$(echo "$TYPES" | get ".find(t=>t.code==='LOAN').id")
I1=$(curl -s -X POST $API/payroll/items -H "$OFFICER" -H "$JSON" -d "{\"employeeId\":$SARA_EMP,\"typeId\":$BONUS,\"amount\":100,\"fromPeriod\":\"$PERIOD\",\"reason\":\"Q3 performance\"}" | get .id)
I2=$(curl -s -X POST $API/payroll/items -H "$OFFICER" -H "$JSON" -d "{\"employeeId\":$OMAR_EMP,\"typeId\":$OVERTIME,\"amount\":1500,\"fromPeriod\":\"$PERIOD\",\"reason\":\"Year-end closing\"}" | get .id)
I3=$(curl -s -X POST $API/payroll/items -H "$OFFICER" -H "$JSON" -d "{\"employeeId\":$SARA_EMP,\"typeId\":$LOAN,\"amount\":50,\"recurring\":true,\"fromPeriod\":\"$PERIOD\",\"reason\":\"Loan 600 over 12 months\"}" | get .id)
echo "   created items #$I1 bonus, #$I2 overtime, #$I3 recurring loan (pending)"
echo -n "   officer approves own item -> "; curl -s -X POST $API/payroll/items/$I1/approve -H "$OFFICER" | get .message
for I in $I1 $I2 $I3; do curl -s -X POST $API/payroll/items/$I/approve -H "$ADMIN" | fmt "'   admin approved #'+o.id+' '+o.type.code+' '+o.amount"; done

echo; echo "=== officer creates payroll $PERIOD (draft) ==="
curl -s -X POST $API/payroll/runs -H "$OFFICER" -H "$JSON" -d "{\"period\":\"$PERIOD\",\"entity\":\"BH\"}" > /tmp/run.json
RUN=$(get .id < /tmp/run.json)
fmt "'   run #'+o.id+' '+o.period+' -> '+o.status" < /tmp/run.json
get ".totals.map(t=>'   '+t.currency+': '+t.employees+' employee(s), gross '+t.gross+', net '+t.net).join('\n')" < /tmp/run.json
get ".warnings.map(w=>'   ! '+w.employee+': '+w.message+(w.skipped?' (skipped)':'')).join('\n')" < /tmp/run.json
SARA_SLIP=$(get ".payslips.find(p=>p.employeeId===$SARA_EMP)?.id" < /tmp/run.json)
OMAR_SLIP=$(get ".payslips.find(p=>p.employeeId===$OMAR_EMP)?.id" < /tmp/run.json)

echo; echo "=== Sara's payslip (Bahraini: SIO 7% + 1%, unpaid leave = 2 x 800/30) ==="
curl -s $API/payroll/payslips/$SARA_SLIP -H "$OFFICER" | slip
echo; echo "=== Omar's payslip (Saudi expat: no employee GOSI, employer 2% hazards) ==="
curl -s $API/payroll/payslips/$OMAR_SLIP -H "$OFFICER" | slip

echo; echo "=== access checks while still draft ==="
echo -n "   Sara opens her draft payslip -> "; curl -s $API/payroll/payslips/$SARA_SLIP -H "$SARA" | get .message
echo -n "   Sara lists payroll runs -> "; curl -s $API/payroll/runs -H "$SARA" | get .message
echo -n "   bank file before approval -> "; curl -s $API/payroll/runs/$RUN/bank-file -H "$OFFICER" | get .message

echo; echo "=== workflow: Draft -> Under Review -> Approved -> Processed -> Paid ==="
curl -s -X POST $API/payroll/runs/$RUN/submit -H "$OFFICER" | fmt "'   submit -> '+o.status"
echo -n "   officer approves own payroll -> "; curl -s -X POST $API/payroll/runs/$RUN/approve -H "$OFFICER" | get .message
curl -s -X POST $API/payroll/runs/$RUN/approve -H "$ADMIN" -H "$JSON" -d '{"comment":"Checked"}' | fmt "'   admin approve -> '+o.status"
echo "   bank file:"; curl -s $API/payroll/runs/$RUN/bank-file -H "$OFFICER" | sed 's/^/     /'
curl -s -X POST $API/payroll/runs/$RUN/process -H "$OFFICER" | fmt "'   process -> '+o.status"
echo -n "   recalculate after processing -> "; curl -s -X POST $API/payroll/runs/$RUN/recalculate -H "$OFFICER" | get .message

echo; echo "=== employees see their payslips once processed ==="
echo -n "   Sara's payslips: "; curl -s $API/payroll/payslips/me -H "$SARA" | get ".map(p=>p.run.period+' net '+p.netSalary+' '+p.currency).join(', ')"
OUT="$HOME/Downloads/payslip-sara-$PERIOD.pdf"; mkdir -p "$HOME/Downloads"
CODE=$(curl -s -o "$OUT" -w "%{http_code}" $API/payroll/payslips/$SARA_SLIP/pdf -H "$SARA")
echo "   Sara downloads PDF -> HTTP $CODE, saved to $OUT"
echo -n "   Omar opens Sara's payslip -> "; curl -s $API/payroll/payslips/$SARA_SLIP -H "$OMAR" | get .message

curl -s -X POST $API/payroll/runs/$RUN/pay -H "$OFFICER" | fmt "'   pay -> '+o.status"

echo; echo "=== stop the recurring loan after this month (keeps future months clean) ==="
curl -s -X PATCH $API/payroll/items/$I3/stop -H "$OFFICER" -H "$JSON" -d "{\"toPeriod\":\"$PERIOD\"}" | fmt "'   loan #'+o.id+' now runs '+o.fromPeriod+' to '+o.toPeriod"