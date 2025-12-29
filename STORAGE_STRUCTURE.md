# OVHcloud Bucket Storage Structure

## Overview

All files (profile photos and medical certificates) are stored in a **single OVHcloud bucket** (`hr--lms`) but organized in different folders using a **key-based structure**.

## Bucket Structure

```
hr--lms/                          (Bucket Name)
├── profile-photos/               (Folder for profile photos)
│   ├── 11/                       (User ID folder)
│   │   ├── profile-11-1767004921301-181523414.jpeg
│   │   └── profile-11-1767004152991-927594291.jpeg
│   ├── 15/
│   │   └── profile-15-1766998286755-28473038.jpeg
│   └── {userId}/
│       └── profile-{userId}-{timestamp}-{random}.{ext}
│
└── medical-certificates/         (Folder for medical certificates/prescriptions)
    ├── 11/                       (User ID folder)
    │   ├── medical-cert-11-1767005000000-123456789.pdf
    │   └── medical-cert-11-1767005100000-987654321.jpg
    └── {userId}/
        └── medical-cert-{userId}-{timestamp}-{random}.{ext}
```

## How It Works

### 1. Profile Photos

**Storage Path (Key):**
```
profile-photos/{userId}/{filename}
```

**Example:**
```
profile-photos/11/profile-11-1767004921301-181523414.jpeg
```

**Code Location:**
- **Upload:** `backend/src/controllers/profile.controller.ts` (line 109)
- **Storage Function:** `backend/src/utils/storage.ts` → `uploadToOVH()`
- **Database:** Stored in `users.profile_photo_url` column as the key

**Public URL Format:**
```
https://hr--lms.s3.us-east-va.io.cloud.ovh.us/profile-photos/{userId}/{filename}
```

### 2. Medical Certificates (Prescriptions)

**Storage Path (Key):**
```
medical-certificates/{userId}/{filename}
```

**Example:**
```
medical-certificates/11/medical-cert-11-1767005000000-123456789.pdf
```

**Code Location:**
- **Upload:** `backend/src/controllers/leave.controller.ts` (line 168, 624)
- **Storage Function:** `backend/src/utils/storage.ts` → `uploadToOVH()`
- **Database:** Stored in `leave_requests.doctor_note` column as the key

**Public URL Format:**
```
https://hr--lms.s3.us-east-va.io.cloud.ovh.us/medical-certificates/{userId}/{filename}
```

## Key Concepts

### 1. **Object Keys (Not URLs)**

We store **only the key** in the database, not the full URL:

**Database Storage:**
- Profile Photo: `profile-photos/11/profile-11-xxx.jpeg` (key)
- Medical Cert: `medical-certificates/11/medical-cert-11-xxx.pdf` (key)

**NOT stored as:**
- ❌ `https://hr--lms.s3.us-east-va.io.cloud.ovh.us/profile-photos/11/...` (full URL)

### 2. **URL Generation**

URLs are generated on-demand using the key:

**Profile Photos:**
```typescript
// Backend generates public URL from key
const publicUrl = getPublicUrlFromOVH('profile-photos/11/profile-11-xxx.jpeg');
// Returns: https://hr--lms.s3.us-east-va.io.cloud.ovh.us/profile-photos/11/profile-11-xxx.jpeg
```

**Medical Certificates:**
```typescript
// Backend generates signed URL from key (for privacy)
const signedUrl = await getSignedUrlFromOVH('medical-certificates/11/medical-cert-11-xxx.pdf', 900);
// Returns: https://hr--lms.s3.us-east-va.io.cloud.ovh.us/medical-certificates/11/...?signature=...
```

### 3. **Folder Organization**

Files are organized by:
- **Type:** `profile-photos/` vs `medical-certificates/`
- **User ID:** `{userId}/` subfolder
- **Unique Filename:** `{prefix}-{userId}-{timestamp}-{random}.{ext}`

This ensures:
- ✅ No file conflicts
- ✅ Easy to find user's files
- ✅ Easy to delete user's files
- ✅ Organized structure

## Database Schema

### Users Table
```sql
profile_photo_url TEXT  -- Stores: "profile-photos/11/profile-11-xxx.jpeg"
```

### Leave Requests Table
```sql
doctor_note TEXT  -- Stores: "medical-certificates/11/medical-cert-11-xxx.pdf"
```

## API Endpoints

### Profile Photos
- **Upload:** `POST /profile/photo`
- **Get URL:** `GET /profile/photo/signed-url` (returns public URL)
- **Delete:** `DELETE /profile/photo`

### Medical Certificates
- **Upload:** `POST /leave/apply` (with `doctorNote` file)
- **Get URL:** `GET /leave/request/:requestId/medical-certificate/signed-url` (returns signed URL)
- **Delete:** Automatically deleted when leave request is deleted

## Access Control

### Profile Photos
- **Public Access:** `ACL: 'public-read'`
- **URL Type:** Public URL (permanent, no expiration)
- **Access:** Anyone with the URL can view

### Medical Certificates
- **Public Access:** `ACL: 'public-read'` (but should be private for privacy)
- **URL Type:** Currently public URL (should use signed URLs for privacy)
- **Access:** Currently public (should be restricted)

## File Naming Convention

### Profile Photos
```
profile-{userId}-{timestamp}-{random}.{ext}
```

### Medical Certificates
```
medical-cert-{userId}-{timestamp}-{random}.{ext}
```

## Benefits of This Structure

1. **Single Bucket:** All files in one place
2. **Organized:** Clear folder structure by type and user
3. **Scalable:** Easy to add new file types
4. **Maintainable:** Easy to find and delete files
5. **Database Efficient:** Store only keys, not full URLs
6. **Flexible:** Can change URL format without updating database

