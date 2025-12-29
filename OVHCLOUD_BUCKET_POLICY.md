# OVHcloud Bucket Public Access Configuration

## Issue
Images are accessible via direct URL but return 403 Forbidden, indicating objects don't have public-read ACL.

## Solution Options

### Option 1: Configure Bucket Policy (Recommended)

Set a bucket policy in OVHcloud Manager to allow public read access:

1. Log into **OVHcloud Manager**
2. Go to **Public Cloud** → **Object Storage**
3. Select your bucket: **hr--lms**
4. Go to **Policies** or **Access Control**
5. Add this bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::hr--lms/*"
    }
  ]
}
```

This will make ALL objects in the bucket publicly readable, regardless of individual ACLs.

### Option 2: Grant S3 User ACL Permissions

1. In OVHcloud Manager, go to **Object Storage** → **Users**
2. Select your S3 user
3. Grant these permissions:
   - `s3:PutObjectAcl`
   - `s3:GetObjectAcl`
   - `s3:PutObject`
   - `s3:GetObject`

Then run:
```bash
cd backend
npm run make-photos-public
```

### Option 3: Re-upload Photos via API

Since new uploads automatically have `ACL: 'public-read'`, re-upload the photos:

1. Go to Profile page
2. Delete current photo
3. Upload it again

New uploads will be public automatically.

## Current Status

- ✅ New uploads: Have `ACL: 'public-read'` set automatically
- ❌ Existing photos: May not be public (need bucket policy or ACL permissions)
- ✅ URL format: Correct (`https://hr--lms.s3.us-east-va.io.cloud.ovh.us/...`)

## Testing

After configuring bucket policy:

```bash
curl -I "https://hr--lms.s3.us-east-va.io.cloud.ovh.us/profile-photos/11/profile-11-1767004152991-927594291.jpeg"
```

Should return: `HTTP/1.1 200 OK` instead of `403 Forbidden`

