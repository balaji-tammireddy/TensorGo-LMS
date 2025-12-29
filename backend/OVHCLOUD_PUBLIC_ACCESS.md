# Making OVHcloud Bucket Publicly Accessible

If images uploaded to your OVHcloud bucket are not visible on other desktops/devices, the bucket needs to be configured for public read access.

## Steps to Enable Public Access

### 1. Configure Bucket for Public Access

1. Log in to **OVHcloud Manager**
2. Go to **Public Cloud** → **Object Storage**
3. Select your bucket: **hr-lms**
4. Go to **Settings** or **Access Control**
5. Enable **Public Access** or **Static Website Hosting**

### 2. Set Bucket Policy (if available)

If OVHcloud supports bucket policies, add this policy to allow public read access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::hr-lms/*"
    }
  ]
}
```

### 3. Verify Public URL Format

The generated URLs should be in this format:
```
https://hr-lms.s3.us-east-va.io.cloud.ovh.us/profile-photos/11/profile-11-xxx.jpeg
```

### 4. Test Public Access

1. Copy a photo URL from your database/logs
2. Open it in a browser (or use `curl`)
3. If you get "Access Denied" or "403 Forbidden", the bucket is not public
4. If the image loads, it's working correctly

### 5. Alternative: Use Signed URLs (Private Bucket)

If you want to keep the bucket private but still allow access:

1. The code already supports signed URLs via `getSignedUrlFromOVH()`
2. Modify the frontend to request signed URLs from the backend
3. Signed URLs expire after a set time (default: 1 hour)

## Current URL Format

Based on your configuration:
- **Bucket**: `hr-lms`
- **Region**: `us-east-va`
- **Endpoint**: `https://s3.us-east-va.io.cloud.ovh.us`
- **Public URL Format**: `https://hr-lms.s3.us-east-va.io.cloud.ovh.us/{key}`

## Troubleshooting

### Images not loading on other devices:

1. **Check bucket public access**: Ensure the bucket is set to public in OVHcloud console
2. **Verify URL format**: Check that URLs start with `https://hr-lms.s3.us-east-va.io.cloud.ovh.us/`
3. **Test URL directly**: Copy a URL and open it in an incognito/private browser window
4. **Check CORS**: If accessing from a web app, ensure CORS is configured

### CORS Configuration (if needed)

If your frontend is on a different domain, add CORS rules:

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

## Quick Test

Run this command to test if a file is publicly accessible:

```bash
curl -I https://hr-lms.s3.us-east-va.io.cloud.ovh.us/profile-photos/11/profile-11-xxx.jpeg
```

- If you get `200 OK`, the file is publicly accessible ✅
- If you get `403 Forbidden`, the bucket is not public ❌
- If you get `404 Not Found`, the file doesn't exist or URL is wrong ❌

