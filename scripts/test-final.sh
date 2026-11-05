API=http://127.0.0.1:5000/api
ADMIN_EMAIL=admin@virtuthinko.com
ADMIN_PASSWORD=ChangeMe@2026
JSON="Content-Type: application/json"
OUT="$HOME/Downloads"; mkdir -p "$OUT"

get() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);const v=o$1;console.log(v===undefined?'':v)}catch{console.log('')}})"; }
fmt() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let o;try{o=JSON.parse(d)}catch{console.log('   (no JSON) '+d.slice(0,80));return}
if(o&&o.message&&o.id===undefined){console.log('   '+o.message+(o.details?' '+JSON.stringify(o.details):''));return}
try{console.log($1)}catch(e){console.log('   ? '+e.message)}})"; }
login() { curl -s -X POST $API/auth/login -H "$JSON" -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | get .accessToken; }
code() { curl -s -o "$1" -w "%{http_code}" "${@:2}"; }

ADMIN="Authorization: Bearer $(login $ADMIN_EMAIL $ADMIN_PASSWORD)"
[ "$ADMIN" = "Authorization: Bearer " ] && { echo "Admin login failed - is the server running?"; exit 1; }
for U in sara.ali:Sara@2026x omar.saleh:Omar@2026x; do
  ID=$(curl -s "$API/users?search=${U%%:*}" -H "$ADMIN" | get ".items[0].id")
  curl -s -X POST $API/users/$ID/reset-password -H "$ADMIN" -H "$JSON" -d "{\"password\":\"${U##*:}\"}" > /dev/null
done
SARA="Authorization: Bearer $(login sara.ali Sara@2026x)"
OMAR="Authorization: Bearer $(login omar.saleh Omar@2026x)"
OMAR_EMP=$(curl -s "$API/employees?search=omar" -H "$ADMIN" | get ".items[0].id")

echo "=== 1. settings ==="
curl -s -X PATCH $API/settings -H "$ADMIN" -H "$JSON" -d '{"companyPhone":"+973 1700 0000","companyEmail":"hr@virtuthinko.com","expiryAlertDays":60,"hrSignatoryName":"Human Resources Department"}' | fmt "'   company: '+o.companyName+' | '+o.companyPhone+' | alert window '+o.expiryAlertDays+' days'"
echo -n "   public (login page): "; curl -s $API/settings/public | get ".companyName"
echo -n "   Sara edits settings -> "; curl -s -X PATCH $API/settings -H "$SARA" -H "$JSON" -d '{"companyName":"X"}' | get .message

echo; echo "=== 2. self-service profile ==="
curl -s -X PATCH $API/employees/me -H "$SARA" -H "$JSON" -d '{"phone":"+973 3900 1234","jobTitle":"CEO"}' | fmt "'   Sara phone '+o.phone+', job title still: '+o.jobTitle"

echo; echo "=== 3. contracts: numbers and statuses ==="
curl -s $API/contracts/me -H "$SARA" | get ".map(c=>'   Sara: '+c.contractNumber+' '+c.displayStatus).join('\n')"
curl -s "$API/contracts?status=expiring_soon" -H "$ADMIN" | get ".map(c=>'   expiring soon: '+c.employee.firstName+' '+c.contractNumber+' ('+c.daysLeft+' days left)').join('\n')"
echo -n "   terminate without reason -> "; curl -s -X POST $API/contracts/1/terminate -H "$ADMIN" -H "$JSON" -d '{}' | get ".details[0].message"

echo; echo "=== 4. requests & letters ==="
TYPES=$(curl -s $API/requests/types -H "$SARA")
echo "$TYPES" | get ".map(t=>'   '+t.code+' ('+t.category+')').join('\n')"
SAL=$(echo "$TYPES" | get ".find(t=>t.code==='SALARY_CERT').id"); TRF=$(echo "$TYPES" | get ".find(t=>t.code==='SALARY_TRANSFER').id"); DOCR=$(echo "$TYPES" | get ".find(t=>t.code==='DOCUMENT_REQUEST').id")

R1=$(curl -s -X POST $API/requests -H "$SARA" -H "$JSON" -d "{\"typeId\":$SAL,\"purpose\":\"a visa application\",\"addressedTo\":\"Ministry of Interior\"}" | get .id)
echo "   Sara requested a salary certificate: #$R1"
curl -s -X POST $API/requests/$R1/start -H "$ADMIN" | fmt "'   HR starts -> '+o.status"
curl -s -X POST $API/requests/$R1/generate -H "$ADMIN" | fmt "'   HR generates letter -> document #'+o.resultDocumentId"
DOC=$(curl -s $API/requests/$R1 -H "$ADMIN" | get ".resultDocument.id")
echo -n "   Sara sees the letter before release? "; curl -s $API/requests/$R1 -H "$SARA" | get ".resultDocument===null?'no (hidden until HR releases it)':'YES - wrong'"
echo -n "   Sara downloads it early -> "; curl -s $API/documents/$DOC/download -H "$SARA" | get .message
echo "   HR previews draft -> HTTP $(code "$OUT/salary-certificate-draft.pdf" $API/documents/$DOC/download -H "$ADMIN")"
echo -n "   complete before approval -> "; curl -s -X POST $API/requests/$R1/complete -H "$ADMIN" -H "$JSON" -d '{}' | get .message
curl -s -X POST $API/requests/$R1/approve -H "$ADMIN" -H "$JSON" -d '{"comment":"Checked"}' | fmt "'   HR approves -> '+o.status"
curl -s -X POST $API/requests/$R1/complete -H "$ADMIN" -H "$JSON" -d '{}' | fmt "'   HR releases -> '+o.status"
echo "   Sara downloads her certificate -> HTTP $(code "$OUT/salary-certificate.pdf" $API/documents/$DOC/download -H "$SARA") (saved to Downloads/salary-certificate.pdf)"
curl -s $API/requests/$R1 -H "$SARA" | get ".history.map(h=>h.action).join(' -> ')" | sed 's/^/   history: /'

R2=$(curl -s -X POST $API/requests -H "$OMAR" -H "$JSON" -d "{\"typeId\":$TRF,\"purpose\":\"new salary account\",\"addressedTo\":\"National Bank\"}" | get .id)
echo -n "   salary transfer letter for Omar (no bank details) -> "; curl -s -X POST $API/requests/$R2/generate -H "$ADMIN" | get .message

R3=$(curl -s -X POST $API/requests -H "$SARA" -H "$JSON" -d "{\"typeId\":$DOCR,\"purpose\":\"copy of my offer letter\"}" | get .id)
echo -n "   reject without reason -> "; curl -s -X POST $API/requests/$R3/reject -H "$ADMIN" -H "$JSON" -d '{}' | get .message
curl -s -X POST $API/requests/$R3/reject -H "$ADMIN" -H "$JSON" -d '{"comment":"Please collect it from HR in person"}' | fmt "'   reject with reason -> '+o.status"
R4=$(curl -s -X POST $API/requests -H "$SARA" -H "$JSON" -d "{\"typeId\":$DOCR,\"purpose\":\"test cancel\"}" | get .id)
curl -s -X POST $API/requests/$R4/cancel -H "$SARA" | fmt "'   Sara cancels #'+o.id+' -> '+o.status"
echo -n "   Omar opens Sara's request -> "; curl -s $API/requests/$R1 -H "$OMAR" | get .message

echo; echo "=== 5. announcements ==="
TOMORROW=$(node -e "const d=new Date();d.setDate(d.getDate()+1);console.log(d.toISOString().slice(0,10))")
A1=$(curl -s -X POST $API/announcements -H "$ADMIN" -H "$JSON" -d '{"title":"Office closed on National Day","body":"The office will be closed on 16-17 December.","priority":"important","pinned":true}' | get .id)
curl -s -X POST $API/announcements -H "$ADMIN" -H "$JSON" -d '{"title":"HR team meeting","body":"Sunday 10am, meeting room 2.","audience":"departments","departmentIds":[1]}' > /dev/null
curl -s -X POST $API/announcements -H "$ADMIN" -H "$JSON" -d "{\"title\":\"Welcome to the KSA team, Omar\",\"body\":\"Your onboarding pack is ready.\",\"audience\":\"employees\",\"employeeIds\":[$OMAR_EMP]}" > /dev/null
curl -s -X POST $API/announcements -H "$ADMIN" -H "$JSON" -d "{\"title\":\"Scheduled for tomorrow\",\"body\":\"Not visible yet.\",\"publishAt\":\"$TOMORROW\"}" > /dev/null
echo -n "   department audience with no departments -> "; curl -s -X POST $API/announcements -H "$ADMIN" -H "$JSON" -d '{"title":"x","body":"x","audience":"departments"}' | get .message
printf '%%PDF-1.4\n%%holiday schedule\n' > /tmp/holiday.pdf
curl -s -X POST $API/announcements/$A1/attachment -H "$ADMIN" -F "file=@/tmp/holiday.pdf" | fmt "'   attached file to #'+o.id+': '+o.attachmentName"
echo "   Sara sees:"; curl -s $API/announcements/me -H "$SARA" | get ".map(a=>'     '+(a.pinned?'[pinned] ':'')+a.title).join('\n')"
echo "   Omar sees:"; curl -s $API/announcements/me -H "$OMAR" | get ".map(a=>'     '+(a.pinned?'[pinned] ':'')+a.title).join('\n')"
echo "   Sara downloads attachment -> HTTP $(code /dev/null $API/announcements/$A1/attachment -H "$SARA")"
echo -n "   Omar creates an announcement -> "; curl -s -X POST $API/announcements -H "$OMAR" -H "$JSON" -d '{"title":"x","body":"x"}' | get .message

echo; echo "=== 6. notifications ==="
echo "   Sara's latest:"; curl -s "$API/notifications?pageSize=6" -H "$SARA" | get ".items.map(n=>'     ['+n.type+'] '+n.title).join('\n')"
echo -n "   Sara unread: "; curl -s $API/notifications/unread-count -H "$SARA" | get .unread
curl -s -X POST $API/notifications/read-all -H "$SARA" | fmt "'   read all -> '+o.updated+' marked read'"
echo "   Admin's latest:"; curl -s "$API/notifications?pageSize=5" -H "$ADMIN" | get ".items.map(n=>'     ['+n.type+'] '+n.title).join('\n')"

echo; echo "=== 7. dashboards ==="
curl -s $API/dashboard/admin -H "$ADMIN" | fmt "'   admin: '+o.employees.active+' active, '+o.employees.onLeaveToday+' on leave today | pending: leave '+(o.pending.leaveWithManager+o.pending.leaveWithHr)+', requests '+o.pending.hrRequests+', pay items '+o.pending.payItemsToApprove+' | expiring: '+o.expiring.contracts+' contract(s), '+o.expiring.documents+' document(s) | payroll '+(o.payroll.latestRun?o.payroll.latestRun.period+' '+o.payroll.latestRun.status:'none')"
curl -s $API/dashboard/me -H "$SARA" | fmt "'   Sara home: '+o.employee.firstName+' | leave left '+o.cards.remainingLeave+' | pending '+o.cards.pendingRequests+' | latest payslip '+(o.cards.latestPayslip?o.cards.latestPayslip.period+' '+o.cards.latestPayslip.net+' '+o.cards.latestPayslip.currency:'-')+' | '+o.announcements.length+' announcement(s)'"
echo -n "   Omar opens admin dashboard -> "; curl -s $API/dashboard/admin -H "$OMAR" | get .message

echo; echo "=== 8. reports ==="
curl -s $API/reports -H "$ADMIN" | get ".map(r=>r.key).join(', ')" | sed 's/^/   available: /'
curl -s $API/reports/headcount -H "$ADMIN" | get ".rows.map(r=>'   '+r.department+': '+r.active+' active, '+r.inactive+' inactive').join('\n')"
curl -s "$API/reports/payroll?period=2026-11" -H "$ADMIN" | get ".rows.filter(r=>r.code==='TOTAL').map(r=>'   payroll 2026-11 '+r.currency+' net '+r.net).join('\n')"
echo "   payroll Excel -> HTTP $(code "$OUT/payroll-2026-11.xlsx" "$API/reports/payroll?period=2026-11&format=xlsx" -H "$ADMIN")"
echo "   employee list PDF -> HTTP $(code "$OUT/employees.pdf" "$API/reports/employees?format=pdf" -H "$ADMIN")"
echo "   turnover PDF -> HTTP $(code "$OUT/turnover.pdf" "$API/reports/turnover?format=pdf" -H "$ADMIN")"
echo -n "   Sara (manager) exports -> "; curl -s "$API/reports/headcount?format=pdf" -H "$SARA" | get .message
echo -n "   Omar opens reports -> "; curl -s $API/reports -H "$OMAR" | get .message

echo; echo "=== 9. audit log ==="
curl -s "$API/audit?entity=EmployeeRequest&pageSize=5" -H "$ADMIN" | get ".items.map(l=>'   '+l.createdAt.slice(0,19)+' '+l.actor+' '+l.action).join('\n')"
echo -n "   Sara opens audit log -> "; curl -s $API/audit -H "$SARA" | get .message

echo; echo "Files saved to $OUT: salary-certificate.pdf, payroll-2026-11.xlsx, employees.pdf, turnover.pdf"