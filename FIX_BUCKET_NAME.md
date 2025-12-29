# Fix Bucket Name Issue

## Problem
The URL is showing `hr-lms` (single dash) instead of `hr--lms` (double dash), causing images to fail loading.

## Solution

### Step 1: Check .env file on the other device

On the other device, open the `.env` file in the `backend` folder and verify:

```bash
OVH_BUCKET_NAME=hr--lms
```

**IMPORTANT**: It must be `hr--lms` with **TWO dashes**, not `hr-lms` with one dash.

### Step 2: If it's wrong, fix it

If the `.env` file shows:
```
OVH_BUCKET_NAME=hr-lms
```

Change it to:
```
OVH_BUCKET_NAME=hr--lms
```

### Step 3: Restart the backend server

After fixing the `.env` file, **restart the backend server** on the other device:

```bash
cd backend
# Stop the current server (Ctrl+C)
npm run dev
# or
npm start
```

### Step 4: Verify

1. Check the Network tab → `signed-url` request → Response tab
2. The URL should be: `https://hr--lms.s3.us-east-va.io.cloud.ovh.us/...` (with **TWO dashes**)
3. The image should load correctly

## Quick Check Command

On the other device, run:
```bash
cd backend
grep "^OVH_BUCKET_NAME" .env
```

It should output:
```
OVH_BUCKET_NAME=hr--lms
```

If it shows `hr-lms` (single dash), that's the problem!

