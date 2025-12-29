# Testing Public Profile Photo URLs

## Step 1: Restart Backend Server

```bash
cd backend
# Stop the current server (Ctrl+C if running)
npm run dev
# or
npm start
```

## Step 2: Upload a New Profile Photo

1. Log into your application
2. Go to Profile page
3. Click "Change Photo" and upload a new image
4. Check the browser's Network tab (F12 → Network) to see the response from `/profile/photo/signed-url`
5. The response should contain a `signedUrl` field with a public URL like:
   ```
   https://s3.us-east-va.io.cloud.ovh.us/hr--lms/profile-photos/{userId}/{filename}
   ```

## Step 3: Test the Public URL Directly

1. Copy the URL from the API response (or check browser console/network tab)
2. Open a new browser tab (or incognito window)
3. Paste the URL directly in the address bar
4. The image should load directly without authentication

## Step 4: Test from Another Machine/Account

1. **From another computer/device:**
   - Open the application URL
   - Log in with a different account (or the same account)
   - Navigate to Profile page
   - The profile photo should display correctly

2. **Check the URL format:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Look for requests to `/profile/photo/signed-url`
   - Check the response - it should return a public URL

## Step 5: Test Existing Photos

If you have existing photos that were uploaded before this change:

1. **Option A: Re-upload the photo**
   - Go to Profile page
   - Delete the current photo
   - Upload it again (it will now be public)

2. **Option B: Check if existing photos work**
   - Try accessing an existing photo URL
   - If you get "Access Denied", the photo is still private
   - You'll need to re-upload it

## Step 6: Verify URL Format

The public URL should follow this format:
```
https://s3.us-east-va.io.cloud.ovh.us/hr--lms/profile-photos/{userId}/{filename}
```

Example:
```
https://s3.us-east-va.io.cloud.ovh.us/hr--lms/profile-photos/15/profile-15-1766998286755-28473038.jpeg
```

## Troubleshooting

### If you get "Access Denied" error:
- The object might still be private (old upload)
- Re-upload the photo to make it public
- Or check OVHcloud bucket settings

### If you get "Invalid Request" error:
- Check that the bucket name in `.env` matches: `hr--lms`
- Verify the endpoint is correct: `https://s3.us-east-va.io.cloud.ovh.us`
- Check backend logs for the exact URL being generated

### If image doesn't display:
- Check browser console for errors
- Verify the URL is accessible by pasting it directly in browser
- Check backend logs to see if the URL is being generated correctly

## Quick Test Script

You can also test by checking the backend logs:

```bash
# Watch backend logs
tail -f backend/logs/combined.log | grep -E "PUBLIC URL|GET PHOTO SIGNED URL"
```

Then upload a photo and check the logs for the generated public URL.

