# OVHcloud Object Storage Setup Guide

This guide explains how to configure OVHcloud Object Storage (S3-compatible) for file uploads in the application.

## Prerequisites

- OVHcloud account with Object Storage service activated
- Access credentials (Access Key, Secret Key)
- Bucket name
- Region information

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# OVHcloud Object Storage Configuration
OVH_ACCESS_KEY=your_access_key_here
OVH_SECRET_KEY=your_secret_key_here
OVH_BUCKET_NAME=your_bucket_name_here
OVH_REGION=gra
OVH_ENDPOINT=https://s3.gra.cloud.ovh.net

# Optional: Custom public URL (if using CDN or custom domain)
# OVH_PUBLIC_URL=https://your-custom-domain.com
```

## Configuration Details

### Required Variables

- **OVH_ACCESS_KEY**: Your OVHcloud access key (username)
- **OVH_SECRET_KEY**: Your OVHcloud secret key
- **OVH_BUCKET_NAME**: Name of your OVHcloud bucket
- **OVH_REGION**: OVHcloud region (e.g., `gra`, `sbg`, `bhs`, `rbx`, `sbg5`)
- **OVH_ENDPOINT**: OVHcloud S3 endpoint URL
  - Format: `https://s3.{region}.cloud.ovh.net`
  - Examples:
    - Gravelines: `https://s3.gra.cloud.ovh.net`
    - Strasbourg: `https://s3.sbg.cloud.ovh.net`
    - Beauharnois: `https://s3.bhs.cloud.ovh.net`
    - Roubaix: `https://s3.rbx.cloud.ovh.net`
    - Strasbourg 5: `https://s3.sbg5.cloud.ovh.net`

### Optional Variables

- **OVH_PUBLIC_URL**: Custom public URL for your files (if using CDN or custom domain)
  - If not set, the system will use the default OVHcloud endpoint URL

## How to Get Your OVHcloud Credentials

1. Log in to your OVHcloud Manager
2. Go to **Public Cloud** → **Object Storage**
3. Create or select your container (bucket)
4. Go to **Users & Roles** → **S3 Users**
5. Create a new S3 user or use an existing one
6. Generate or view the **Access Key** and **Secret Key**
7. Note your bucket name and region

## Bucket Configuration

Make sure your bucket is configured for public read access if you want files to be publicly accessible. You can set this in the OVHcloud Manager or use the ACL settings in the code.

## How It Works

1. **Upload Flow**:
   - File is temporarily saved to local disk via Multer
   - File is uploaded to OVHcloud bucket
   - Local file is deleted after successful upload
   - Public URL is returned and stored in database

2. **Delete Flow**:
   - File is deleted from database
   - File is also deleted from OVHcloud bucket

3. **Fallback**:
   - If OVHcloud credentials are not configured, the system falls back to local file storage
   - Files are stored in the `./uploads` directory (or path specified in `UPLOAD_DIR`)

## Testing the Configuration

After setting up the environment variables:

1. Restart your backend server
2. Try uploading a profile photo
3. Check the logs for `[STORAGE]` messages to verify uploads
4. Verify the photo URL in the response is an OVHcloud URL

## Troubleshooting

### Common Issues

1. **"Access Denied" Error**:
   - Verify your Access Key and Secret Key are correct
   - Check that your S3 user has proper permissions

2. **"Bucket Not Found" Error**:
   - Verify the bucket name is correct
   - Ensure the bucket exists in the specified region

3. **"Endpoint Not Found" Error**:
   - Verify the endpoint URL matches your region
   - Check the region code is correct

4. **Files Not Publicly Accessible**:
   - Check bucket ACL settings in OVHcloud Manager
   - Ensure `ACL: 'public-read'` is set in the upload command

### Debug Mode

Enable detailed logging by checking the application logs. Look for:
- `[STORAGE] [UPLOAD]` - Upload operations
- `[STORAGE] [DELETE]` - Delete operations
- `[STORAGE] [ERROR]` - Error messages

## File Structure in Bucket

Files are organized in the bucket as follows:
```
profile-photos/
  └── {user_id}/
      └── profile-{user_id}-{timestamp}-{random}.{ext}
```

## Security Notes

- Never commit your `.env` file to version control
- Keep your Secret Key secure and rotate it regularly
- Use IAM policies to restrict access if possible
- Consider using signed URLs for private files instead of public-read ACL

