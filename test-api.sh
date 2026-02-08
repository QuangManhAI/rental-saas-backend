#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Rental SaaS – Full API Test Script (curl)
#  Tests all 35 endpoints sequentially, chaining IDs across calls
#
#  Response envelope: { statusCode, message, data: <payload> }
#  Login  → data.tokens.accessToken / data.tokens.refreshToken
#  Refresh→ data.accessToken / data.refreshToken
# ═══════════════════════════════════════════════════════════════
# NOTE: intentionally no 'set -e' so cleanup ALWAYS runs
set -uo pipefail

BASE="http://localhost:3000/api"
BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
NC="\033[0m"

PASS=0
FAIL=0
TOTAL=0

# ── helpers ──────────────────────────────────────────────────
hr()    { echo -e "\n${CYAN}══════════════════════════════════════════${NC}"; }
title() { hr; echo -e "${BOLD}  $1${NC}"; hr; }

run() {
  local label="$1"; shift
  TOTAL=$((TOTAL + 1))
  echo -e "\n${YELLOW}▶ [${TOTAL}] ${label}${NC}"
  echo "  → $*" | head -c 300
  echo ""
  RESP=$(eval "$@" 2>/dev/null) || true
  # pretty-print first 60 lines
  echo "$RESP" | python3 -m json.tool 2>/dev/null | head -60 || echo "$RESP" | head -c 2000
  echo ""
  # success = statusCode 200 or 201 in the wrapped response
  if echo "$RESP" | grep -qE '"statusCode"\s*:\s*(200|201)'; then
    echo -e "  ${GREEN}✔ PASS${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✘ FAIL${NC}"
    FAIL=$((FAIL + 1))
  fi
}

# Extract a value from JSON response
jq_val() {
  echo "$1" | grep -oP "\"$2\"\s*:\s*\"[^\"]*\"" | head -1 | sed 's/.*:.*"\(.*\)"/\1/'
}

RANDOM_SUFFIX="$(date +%s%N)_${RANDOM}"
TEST_EMAIL="testuser_${RANDOM_SUFFIX}@test.com"
STAFF_EMAIL="staff_${RANDOM_SUFFIX}@test.com"

# ═══════════════════════════════════════════════════════════════
title "1. AUTH – Register (returns userId, NOT tokens)"
# ═══════════════════════════════════════════════════════════════

run "POST /api/auth/register" \
  "curl -s -X POST ${BASE}/auth/register \
   -H 'Content-Type: application/json' \
   -d '{
     \"email\": \"${TEST_EMAIL}\",
     \"password\": \"Test@123456\",
     \"fullName\": \"Test Owner\",
     \"phone\": \"0901234567\"
   }'"

USER_ID=$(jq_val "$RESP" "userId")
echo -e "  📌 userId = ${USER_ID}"

# ═══════════════════════════════════════════════════════════════
title "2. AUTH – Login (returns tokens + user)"
# ═══════════════════════════════════════════════════════════════

run "POST /api/auth/login" \
  "curl -s -X POST ${BASE}/auth/login \
   -H 'Content-Type: application/json' \
   -d '{
     \"email\": \"${TEST_EMAIL}\",
     \"password\": \"Test@123456\"
   }'"

ACCESS_TOKEN=$(jq_val "$RESP" "accessToken")
REFRESH_TOKEN=$(jq_val "$RESP" "refreshToken")
echo -e "  📌 accessToken  = ${ACCESS_TOKEN:0:40}..."
echo -e "  📌 refreshToken = ${REFRESH_TOKEN:0:40}..."

AUTH="Authorization: Bearer ${ACCESS_TOKEN}"

# ═══════════════════════════════════════════════════════════════
title "3. AUTH – Refresh Token (rotates token pair)"
# ═══════════════════════════════════════════════════════════════

run "POST /api/auth/refresh" \
  "curl -s -X POST ${BASE}/auth/refresh \
   -H 'Content-Type: application/json' \
   -d '{\"refreshToken\": \"${REFRESH_TOKEN}\"}'"

ACCESS_TOKEN=$(jq_val "$RESP" "accessToken")
REFRESH_TOKEN=$(jq_val "$RESP" "refreshToken")
AUTH="Authorization: Bearer ${ACCESS_TOKEN}"
echo -e "  📌 New tokens obtained ✔"

# ═══════════════════════════════════════════════════════════════
title "4. AUTH – Get Profile"
# ═══════════════════════════════════════════════════════════════

run "GET /api/auth/profile" \
  "curl -s -X GET ${BASE}/auth/profile -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "5. PROPERTIES – CRUD"
# ═══════════════════════════════════════════════════════════════

run "POST /api/properties" \
  "curl -s -X POST ${BASE}/properties \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"name\": \"Sunrise Apartments\",
     \"address\": \"123 Nguyen Hue, Q1, HCMC\",
     \"description\": \"5-floor rental building\"
   }'"

PROPERTY_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 propertyId = ${PROPERTY_ID}"

run "GET /api/properties (list)" \
  "curl -s -X GET ${BASE}/properties -H '${AUTH}'"

run "GET /api/properties/:id" \
  "curl -s -X GET ${BASE}/properties/${PROPERTY_ID} -H '${AUTH}'"

run "PATCH /api/properties/:id" \
  "curl -s -X PATCH ${BASE}/properties/${PROPERTY_ID} \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{\"name\": \"Sunrise Apartments (Updated)\"}'"

# ═══════════════════════════════════════════════════════════════
title "6. ROOMS – CRUD"
# ═══════════════════════════════════════════════════════════════

run "POST /api/rooms" \
  "curl -s -X POST ${BASE}/rooms \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"name\": \"Room 101\",
     \"price\": 3000000,
     \"area\": 25,
     \"propertyId\": \"${PROPERTY_ID}\",
     \"description\": \"AC room with balcony\",
     \"status\": \"AVAILABLE\"
   }'"

ROOM_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 roomId = ${ROOM_ID}"

run "GET /api/rooms (list all)" \
  "curl -s -X GET ${BASE}/rooms -H '${AUTH}'"

run "GET /api/rooms?propertyId=… (filter)" \
  "curl -s -X GET '${BASE}/rooms?propertyId=${PROPERTY_ID}' -H '${AUTH}'"

run "GET /api/rooms/:id" \
  "curl -s -X GET ${BASE}/rooms/${ROOM_ID} -H '${AUTH}'"

run "PATCH /api/rooms/:id" \
  "curl -s -X PATCH ${BASE}/rooms/${ROOM_ID} \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{\"price\": 3500000}'"

# ═══════════════════════════════════════════════════════════════
title "7. TENANTS – CRUD"
# ═══════════════════════════════════════════════════════════════

run "POST /api/tenants" \
  "curl -s -X POST ${BASE}/tenants \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"fullName\": \"Nguyen Van A\",
     \"phone\": \"0912345678\",
     \"identityCard\": \"079123456789\",
     \"email\": \"tenant_a@email.com\",
     \"address\": \"456 Le Loi, Q1, HCMC\",
     \"dob\": \"1990-05-15\"
   }'"

TENANT_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 tenantId = ${TENANT_ID}"

run "GET /api/tenants (list)" \
  "curl -s -X GET ${BASE}/tenants -H '${AUTH}'"

run "GET /api/tenants/:id" \
  "curl -s -X GET ${BASE}/tenants/${TENANT_ID} -H '${AUTH}'"

run "PATCH /api/tenants/:id" \
  "curl -s -X PATCH ${BASE}/tenants/${TENANT_ID} \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{\"phone\": \"0999888777\"}'"

# ═══════════════════════════════════════════════════════════════
title "8. CONTRACTS – Create / Read / Terminate"
# ═══════════════════════════════════════════════════════════════

run "POST /api/contracts" \
  "curl -s -X POST ${BASE}/contracts \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"roomId\": \"${ROOM_ID}\",
     \"tenantId\": \"${TENANT_ID}\",
     \"startDate\": \"2026-02-01\",
     \"endDate\": \"2027-02-01\",
     \"deposit\": 5000000,
     \"rentPrice\": 3000000
   }'"

CONTRACT_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 contractId = ${CONTRACT_ID}"

run "GET /api/contracts (list)" \
  "curl -s -X GET ${BASE}/contracts -H '${AUTH}'"

run "GET /api/contracts/:id" \
  "curl -s -X GET ${BASE}/contracts/${CONTRACT_ID} -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "9. BILLS – Create / Read"
# ═══════════════════════════════════════════════════════════════

run "POST /api/bills" \
  "curl -s -X POST ${BASE}/bills \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"contractId\": \"${CONTRACT_ID}\",
     \"month\": 2,
     \"year\": 2026,
     \"electricOldIndex\": 100,
     \"electricNewIndex\": 150,
     \"electricRate\": 3500,
     \"waterOldIndex\": 10,
     \"waterNewIndex\": 15,
     \"waterRate\": 15000,
     \"otherFee\": 50000
   }'"

BILL_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 billId = ${BILL_ID}"

run "GET /api/bills (list)" \
  "curl -s -X GET ${BASE}/bills -H '${AUTH}'"

run "GET /api/bills/:id" \
  "curl -s -X GET ${BASE}/bills/${BILL_ID} -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "10. PAYMENTS – Create / List by Bill"
# ═══════════════════════════════════════════════════════════════

run "POST /api/payments (partial – transfer)" \
  "curl -s -X POST ${BASE}/payments \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"billId\": \"${BILL_ID}\",
     \"amount\": 1500000,
     \"method\": \"TRANSFER\",
     \"note\": \"Partial payment Feb 2026\"
   }'"

PAYMENT_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 paymentId = ${PAYMENT_ID}"

run "POST /api/payments (cash)" \
  "curl -s -X POST ${BASE}/payments \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"billId\": \"${BILL_ID}\",
     \"amount\": 500000,
     \"method\": \"CASH\",
     \"note\": \"Cash top-up\"
   }'"

PAYMENT_ID2=$(jq_val "$RESP" "_id")
echo -e "  📌 paymentId2 = ${PAYMENT_ID2}"

run "GET /api/payments/bill/:billId" \
  "curl -s -X GET ${BASE}/payments/bill/${BILL_ID} -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "11. USERS – Staff Management (Owner only)"
# ═══════════════════════════════════════════════════════════════

run "POST /api/users (create staff)" \
  "curl -s -X POST ${BASE}/users \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{
     \"email\": \"${STAFF_EMAIL}\",
     \"password\": \"Staff@123\",
     \"fullName\": \"Staff Member\",
     \"phone\": \"0909988776\",
     \"role\": \"staff\"
   }'"

STAFF_ID=$(jq_val "$RESP" "_id")
echo -e "  📌 staffId = ${STAFF_ID}"

run "GET /api/users (list)" \
  "curl -s -X GET ${BASE}/users -H '${AUTH}'"

run "GET /api/users/profile" \
  "curl -s -X GET ${BASE}/users/profile -H '${AUTH}'"

run "GET /api/users/:id" \
  "curl -s -X GET ${BASE}/users/${STAFF_ID} -H '${AUTH}'"

run "PATCH /api/users/:id" \
  "curl -s -X PATCH ${BASE}/users/${STAFF_ID} \
   -H '${AUTH}' -H 'Content-Type: application/json' \
   -d '{\"fullName\": \"Staff Updated\", \"isActive\": false}'"

# ═══════════════════════════════════════════════════════════════
title "12. VERIFY – Check bill status after payments"
# ═══════════════════════════════════════════════════════════════

run "GET /api/bills/:id (check paidAmount)" \
  "curl -s -X GET ${BASE}/bills/${BILL_ID} -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "13. CLEANUP – Delete resources in reverse order"
# ═══════════════════════════════════════════════════════════════

run "DELETE /api/payments/:id (payment 2)" \
  "curl -s -X DELETE ${BASE}/payments/${PAYMENT_ID2} -H '${AUTH}'"

run "DELETE /api/payments/:id (payment 1)" \
  "curl -s -X DELETE ${BASE}/payments/${PAYMENT_ID} -H '${AUTH}'"

run "DELETE /api/bills/:id" \
  "curl -s -X DELETE ${BASE}/bills/${BILL_ID} -H '${AUTH}'"

run "PATCH /api/contracts/:id/terminate" \
  "curl -s -X PATCH ${BASE}/contracts/${CONTRACT_ID}/terminate -H '${AUTH}'"

run "DELETE /api/tenants/:id" \
  "curl -s -X DELETE ${BASE}/tenants/${TENANT_ID} -H '${AUTH}'"

run "DELETE /api/rooms/:id" \
  "curl -s -X DELETE ${BASE}/rooms/${ROOM_ID} -H '${AUTH}'"

run "DELETE /api/properties/:id" \
  "curl -s -X DELETE ${BASE}/properties/${PROPERTY_ID} -H '${AUTH}'"

run "DELETE /api/users/:id (staff)" \
  "curl -s -X DELETE ${BASE}/users/${STAFF_ID} -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "14. AUTH – Logout"
# ═══════════════════════════════════════════════════════════════

run "POST /api/auth/logout" \
  "curl -s -X POST ${BASE}/auth/logout -H '${AUTH}'"

# ═══════════════════════════════════════════════════════════════
title "📊 TEST RESULTS"
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "  ${GREEN}✔ Passed: ${PASS}${NC}"
echo -e "  ${RED}✘ Failed: ${FAIL}${NC}"
echo -e "  ${BOLD}  Total:  ${TOTAL}${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}🎉 ALL ${TOTAL} TESTS PASSED!${NC}"
else
  echo -e "  ${RED}${BOLD}⚠ ${FAIL} test(s) failed. Check output above.${NC}"
  exit 1
fi
