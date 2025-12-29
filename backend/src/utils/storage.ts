import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from './logger';
import fs from 'fs';
import path from 'path';

// OVHcloud Object Storage is S3-compatible
// Configure S3 client for OVHcloud
const s3Client = new S3Client({
  endpoint: process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`,
  region: process.env.OVH_REGION || 'gra',
  credentials: {
    accessKeyId: process.env.OVH_ACCESS_KEY || '',
    secretAccessKey: process.env.OVH_SECRET_KEY || ''
  },
  forcePathStyle: true // Required for OVHcloud
});

const BUCKET_NAME = process.env.OVH_BUCKET_NAME || '';

/**
 * Upload a file to OVHcloud bucket
 * @param filePath - Local file path
 * @param key - Object key (path in bucket)
 * @param contentType - MIME type of the file
 * @returns Public URL of the uploaded file
 */
export const uploadToOVH = async (
  filePath: string,
  key: string,
  contentType: string
): Promise<string> => {
  try {
    // Validate configuration
    if (!process.env.OVH_ACCESS_KEY || !process.env.OVH_SECRET_KEY || !BUCKET_NAME) {
      throw new Error('OVHcloud configuration is incomplete. Please check OVH_ACCESS_KEY, OVH_SECRET_KEY, and OVH_BUCKET_NAME environment variables.');
    }
    
    logger.info(`[STORAGE] [UPLOAD] Uploading file to OVHcloud: ${key}`);
    logger.info(`[STORAGE] [UPLOAD] Bucket: ${BUCKET_NAME}, Endpoint: ${process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`}`);
    
    // Read file from local filesystem
    const fileContent = fs.readFileSync(filePath);
    
    // OVHcloud might not support ACL parameter, so we'll try without it first
    // Public access is typically configured at the bucket level in OVHcloud
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType
      // Removed ACL: 'public-read' as OVHcloud handles public access via bucket policies
    });

    await s3Client.send(command);
    
    // Construct public URL
    // Alternative: If using custom domain, use that instead
    if (process.env.OVH_PUBLIC_URL) {
      const publicUrl = `${process.env.OVH_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
      logger.info(`[STORAGE] [UPLOAD] File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    }
    
    // OVHcloud public URL format: Use virtual-hosted style for public URLs
    // Format: https://{bucket}.s3.{region}.cloud.ovh.net/{key}
    // Extract region from endpoint or use configured region
    const endpoint = process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`;
    const region = process.env.OVH_REGION || 'gra';
    
    // For us-east-va region, the endpoint format is different
    // Use virtual-hosted style: https://{bucket}.s3.{region}.cloud.ovh.net/{key}
    // Or path-style: https://s3.{region}.cloud.ovh.net/{bucket}/{key}
    // Try virtual-hosted style first (more common for public URLs)
    let publicUrl: string;
    
    if (endpoint.includes('us-east-va')) {
      // Special handling for us-east-va region
      publicUrl = `https://${BUCKET_NAME}.s3.us-east-va.io.cloud.ovh.us/${key}`;
    } else {
      // Standard OVHcloud format
      const cleanEndpoint = endpoint.replace(/\/$/, '').replace('https://s3.', '');
      publicUrl = `https://${BUCKET_NAME}.s3.${cleanEndpoint}/${key}`;
    }
    
    logger.info(`[STORAGE] [UPLOAD] File uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    logger.error(`[STORAGE] [UPLOAD] Error uploading file:`, error);
    
    // Provide more detailed error messages
    if (error.name === 'AccessDenied' || error.message?.includes('Access Denied')) {
      logger.error(`[STORAGE] [UPLOAD] Access Denied - Check credentials and bucket permissions`);
      throw new Error(`Access Denied: Please verify OVHcloud credentials (OVH_ACCESS_KEY, OVH_SECRET_KEY) and bucket permissions. Error: ${error.message}`);
    }
    
    if (error.name === 'NoSuchBucket' || error.message?.includes('NoSuchBucket')) {
      logger.error(`[STORAGE] [UPLOAD] Bucket not found: ${BUCKET_NAME}`);
      throw new Error(`Bucket not found: ${BUCKET_NAME}. Please verify OVH_BUCKET_NAME environment variable.`);
    }
    
    throw new Error(`Failed to upload file to OVHcloud: ${error.message || error.toString()}`);
  }
};

/**
 * Upload file buffer directly to OVHcloud (without saving to disk first)
 * @param buffer - File buffer
 * @param key - Object key (path in bucket)
 * @param contentType - MIME type of the file
 * @returns Public URL of the uploaded file
 */
export const uploadBufferToOVH = async (
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> => {
  try {
    // Validate configuration
    if (!process.env.OVH_ACCESS_KEY || !process.env.OVH_SECRET_KEY || !BUCKET_NAME) {
      throw new Error('OVHcloud configuration is incomplete. Please check OVH_ACCESS_KEY, OVH_SECRET_KEY, and OVH_BUCKET_NAME environment variables.');
    }
    
    logger.info(`[STORAGE] [UPLOAD BUFFER] Uploading buffer to OVHcloud: ${key}`);
    
    // OVHcloud might not support ACL parameter, so we'll try without it first
    // Public access is typically configured at the bucket level in OVHcloud
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType
      // Removed ACL: 'public-read' as OVHcloud handles public access via bucket policies
    });

    await s3Client.send(command);
    
    // Construct public URL
    // Alternative: If using custom domain
    if (process.env.OVH_PUBLIC_URL) {
      const publicUrl = `${process.env.OVH_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
      logger.info(`[STORAGE] [UPLOAD BUFFER] File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    }
    
    // OVHcloud public URL format: Use virtual-hosted style for public URLs
    // Format: https://{bucket}.s3.{region}.cloud.ovh.net/{key}
    const endpoint = process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`;
    const region = process.env.OVH_REGION || 'gra';
    
    // For us-east-va region, the endpoint format is different
    let publicUrl: string;
    
    if (endpoint.includes('us-east-va')) {
      // Special handling for us-east-va region
      publicUrl = `https://${BUCKET_NAME}.s3.us-east-va.io.cloud.ovh.us/${key}`;
    } else {
      // Standard OVHcloud format
      const cleanEndpoint = endpoint.replace(/\/$/, '').replace('https://s3.', '');
      publicUrl = `https://${BUCKET_NAME}.s3.${cleanEndpoint}/${key}`;
    }
    
    logger.info(`[STORAGE] [UPLOAD BUFFER] File uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    logger.error(`[STORAGE] [UPLOAD BUFFER] Error uploading file:`, error);
    
    // Provide more detailed error messages
    if (error.name === 'AccessDenied' || error.message?.includes('Access Denied')) {
      logger.error(`[STORAGE] [UPLOAD BUFFER] Access Denied - Check credentials and bucket permissions`);
      throw new Error(`Access Denied: Please verify OVHcloud credentials (OVH_ACCESS_KEY, OVH_SECRET_KEY) and bucket permissions. Error: ${error.message}`);
    }
    
    if (error.name === 'NoSuchBucket' || error.message?.includes('NoSuchBucket')) {
      logger.error(`[STORAGE] [UPLOAD BUFFER] Bucket not found: ${BUCKET_NAME}`);
      throw new Error(`Bucket not found: ${BUCKET_NAME}. Please verify OVH_BUCKET_NAME environment variable.`);
    }
    
    throw new Error(`Failed to upload file to OVHcloud: ${error.message || error.toString()}`);
  }
};

/**
 * Delete a file from OVHcloud bucket
 * @param key - Object key (path in bucket)
 */
export const deleteFromOVH = async (key: string): Promise<void> => {
  try {
    logger.info(`[STORAGE] [DELETE] Deleting file from OVHcloud: ${key}`);
    
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    logger.info(`[STORAGE] [DELETE] File deleted successfully: ${key}`);
  } catch (error: any) {
    logger.error(`[STORAGE] [DELETE] Error deleting file:`, error);
    throw new Error(`Failed to delete file from OVHcloud: ${error.message}`);
  }
};

/**
 * Get a signed URL for private file access (valid for 1 hour)
 * @param key - Object key (path in bucket)
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL
 */
export const getSignedUrlFromOVH = async (
  key: string,
  expiresIn: number = 3600
): Promise<string> => {
  try {
    logger.info(`[STORAGE] [SIGNED URL] Generating signed URL for: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    logger.info(`[STORAGE] [SIGNED URL] Signed URL generated successfully`);
    return signedUrl;
  } catch (error: any) {
    logger.error(`[STORAGE] [SIGNED URL] Error generating signed URL:`, error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Extract key from OVHcloud URL
 * @param url - Full URL from OVHcloud
 * @returns Object key
 */
export const extractKeyFromUrl = (url: string): string => {
  try {
    // If using custom domain
    if (process.env.OVH_PUBLIC_URL && url.startsWith(process.env.OVH_PUBLIC_URL)) {
      return url.replace(`${process.env.OVH_PUBLIC_URL}/`, '');
    }
    
    // Extract key from standard OVHcloud URL
    const endpoint = process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`;
    const urlPattern = new RegExp(`${endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${BUCKET_NAME}/(.+)`);
    const match = url.match(urlPattern);
    
    if (match && match[1]) {
      return match[1];
    }
    
    // Fallback: try to extract from any URL format
    const parts = url.split('/');
    return parts[parts.length - 1];
  } catch (error: any) {
    logger.error(`[STORAGE] [EXTRACT KEY] Error extracting key from URL:`, error);
    return url;
  }
};

