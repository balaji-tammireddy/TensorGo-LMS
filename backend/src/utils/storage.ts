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
 * Upload a file to OVHcloud bucket (PRIVATE bucket - use signed URLs to access)
 * @param filePath - Local file path
 * @param key - Object key (path in bucket)
 * @param contentType - MIME type of the file
 * @returns Object key (store this in DB, use getSignedUrlFromOVH() to generate access URLs)
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
    
    // Upload to PUBLIC bucket (ACL: public-read for direct access)
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      ACL: 'public-read' // Make object publicly accessible
    });

    await s3Client.send(command);
    
    // Return only the key - signed URLs will be generated on-demand via getSignedUrlFromOVH()
    logger.info(`[STORAGE] [UPLOAD] File uploaded successfully. Key: ${key}`);
    return key;
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
 * @returns Object key (store this in DB, use getSignedUrlFromOVH() to generate access URLs)
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
    
    // Upload to PUBLIC bucket (ACL: public-read for direct access)
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read' // Make object publicly accessible
    });

    await s3Client.send(command);
    
    // Return only the key - signed URLs will be generated on-demand via getSignedUrlFromOVH()
    logger.info(`[STORAGE] [UPLOAD BUFFER] File uploaded successfully. Key: ${key}`);
    return key;
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
 * Get public URL for file access (permanent, no expiration)
 * @param key - Object key (path in bucket)
 * @returns Public URL that works from any device/network
 */
export const getPublicUrlFromOVH = (key: string): string => {
  const endpoint = process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`;
  const region = process.env.OVH_REGION || 'gra';
  
  // OVHcloud uses virtual-hosted style for public URLs
  // Format: https://{bucket}.s3.{region}.cloud.ovh.net/{key}
  // For us-east-va: https://{bucket}.s3.{region}.io.cloud.ovh.us/{key}
  let publicUrl: string;
  
  if (region === 'us-east-va') {
    // Special format for us-east-va region
    publicUrl = `https://${BUCKET_NAME}.s3.${region}.io.cloud.ovh.us/${key}`;
  } else {
    // Standard format for other regions
    publicUrl = `https://${BUCKET_NAME}.s3.${region}.cloud.ovh.net/${key}`;
  }
  
  logger.info(`[STORAGE] [PUBLIC URL] Generated public URL: ${publicUrl}`);
  return publicUrl;
};

/**
 * Get a signed URL for private file access (valid for 15 minutes by default)
 * Note: Use getPublicUrlFromOVH() if objects are public
 * @param key - Object key (path in bucket)
 * @param expiresIn - URL expiration time in seconds (default: 900 = 15 minutes)
 * @returns Signed URL that works from any device/network
 */
export const getSignedUrlFromOVH = async (
  key: string,
  expiresIn: number = 900 // 15 minutes default
): Promise<string> => {
  try {
    logger.info(`[STORAGE] [SIGNED URL] Generating signed URL for: ${key}, expires in: ${expiresIn}s`);
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    logger.info(`[STORAGE] [SIGNED URL] Signed URL generated successfully (expires in ${expiresIn}s)`);
    return signedUrl;
  } catch (error: any) {
    logger.error(`[STORAGE] [SIGNED URL] Error generating signed URL:`, error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Extract key from OVHcloud URL
 * @param url - Full URL from OVHcloud (supports both virtual-hosted and path-style)
 * @returns Object key
 */
export const extractKeyFromUrl = (url: string): string => {
  try {
    // If using custom domain
    if (process.env.OVH_PUBLIC_URL && url.startsWith(process.env.OVH_PUBLIC_URL)) {
      return url.replace(`${process.env.OVH_PUBLIC_URL}/`, '');
    }
    
    const region = process.env.OVH_REGION || 'gra';
    
    // Try virtual-hosted style first (current format)
    // Format: https://{bucket}.s3.{region}.io.cloud.ovh.us/{key} or https://{bucket}.s3.{region}.cloud.ovh.net/{key}
    if (region === 'us-east-va') {
      const virtualHostedPattern = new RegExp(`https://${BUCKET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.s3\\.${region}\\.io\\.cloud\\.ovh\\.us/(.+)`);
      const match = url.match(virtualHostedPattern);
      if (match && match[1]) {
        return match[1];
      }
    } else {
      const virtualHostedPattern = new RegExp(`https://${BUCKET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.s3\\.${region}\\.cloud\\.ovh\\.net/(.+)`);
      const match = url.match(virtualHostedPattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Try path-style format (legacy)
    const endpoint = process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`;
    const pathStylePattern = new RegExp(`${endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${BUCKET_NAME}/(.+)`);
    const match = url.match(pathStylePattern);
    
    if (match && match[1]) {
      return match[1];
    }
    
    // Fallback: try to extract from any URL format (get everything after last slash)
    const parts = url.split('/');
    // Remove empty parts and get the key (everything after bucket name)
    const keyParts = parts.filter(p => p && !p.includes('s3.') && !p.includes('cloud.ovh'));
    const bucketIndex = keyParts.findIndex(p => p === BUCKET_NAME);
    if (bucketIndex >= 0 && bucketIndex < keyParts.length - 1) {
      return keyParts.slice(bucketIndex + 1).join('/');
    }
    
    // Last resort: return filename only
    return parts[parts.length - 1];
  } catch (error: any) {
    logger.error(`[STORAGE] [EXTRACT KEY] Error extracting key from URL:`, error);
    return url;
  }
};

