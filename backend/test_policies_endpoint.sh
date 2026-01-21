#!/bin/bash

echo "Testing Leave Policies Endpoint..."
echo "=================================="
echo ""

# Step 1: Login
echo "Step 1: Logging in as Super Admin..."
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"HRMS@tensorgo.com","password":"tensorgo@2023"}')

echo "Login Response:"
echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
echo ""

# Extract access token
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken' 2>/dev/null)

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi

echo "✅ Access Token obtained: ${ACCESS_TOKEN:0:20}..."
echo ""

# Step 2: Fetch Policies
echo "Step 2: Fetching leave policies..."
POLICIES_RESPONSE=$(curl -s -X GET http://127.0.0.1:5002/api/leave-rules/policies \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "Policies Response:"
echo "$POLICIES_RESPONSE" | jq '.' 2>/dev/null || echo "$POLICIES_RESPONSE"
echo ""

# Check if we got data
EMPLOYEE_COUNT=$(echo "$POLICIES_RESPONSE" | jq '.employee | length' 2>/dev/null)
if [ "$EMPLOYEE_COUNT" != "null" ] && [ "$EMPLOYEE_COUNT" -gt 0 ]; then
  echo "✅ SUCCESS: Got $EMPLOYEE_COUNT policies for employee role"
else
  echo "❌ FAILED: No policies returned or error occurred"
fi
