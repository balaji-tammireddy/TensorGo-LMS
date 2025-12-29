/**
 * Script to check photo access and make them public
 * 
 * Usage:
 *   npx ts-node src/scripts/checkAndFixPhotoAccess.ts
 */

import dotenv from 'dotenv';
import { S3Client, PutObjectAclCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { pool } from '../database/db';
import { logger } from '../utils/logger';

dotenv.config();

const s3Client = new S3Client({
  endpoint: process.env.OVH_ENDPOINT || `https://s3.${process.env.OVH_REGION || 'gra'}.cloud.ovh.net`,
  region: process.env.OVH_REGION || 'gra',
  credentials: {
    accessKeyId: process.env.OVH_ACCESS_KEY || '',
    secretAccessKey: process.env.OVH_SECRET_KEY || ''
  },
  forcePathStyle: true
});

const BUCKET_NAME = process.env.OVH_BUCKET_NAME || '';

async function checkAndFixPhotoAccess() {
  logger.info('========== CHECKING AND FIXING PHOTO ACCESS ==========');
  
  if (!process.env.OVH_ACCESS_KEY || !process.env.OVH_SECRET_KEY || !BUCKET_NAME) {
    logger.error('OVHcloud configuration is missing');
    process.exit(1);
  }
  
  try {
    // Get all users with profile photos
    const result = await pool.query(
      `SELECT id, profile_photo_url 
       FROM users 
       WHERE profile_photo_url IS NOT NULL 
       AND profile_photo_url LIKE 'profile-photos/%'`
    );
    
    logger.info(`Found ${result.rows.length} users with profile photos`);
    
    let successCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    
    for (const user of result.rows) {
      const key = user.profile_photo_url;
      
      try {
        // First, check if object exists
        const headCommand = new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key
        });
        
        let objectExists = false;
        try {
          await s3Client.send(headCommand);
          objectExists = true;
          logger.info(`✓ Object exists: ${key}`);
        } catch (headError: any) {
          if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
            logger.warn(`✗ Object not found: ${key} (User ID: ${user.id})`);
            notFoundCount++;
            continue;
          } else {
            throw headError;
          }
        }
        
        if (objectExists) {
          // Make it public
          logger.info(`Making public: ${key} (User ID: ${user.id})`);
          
          const aclCommand = new PutObjectAclCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ACL: 'public-read'
          });
          
          await s3Client.send(aclCommand);
          logger.info(`✓ Made public: ${key}`);
          successCount++;
        }
      } catch (error: any) {
        logger.error(`✗ Failed to process: ${key} - ${error.message}`);
        errorCount++;
      }
    }
    
    logger.info('========== COMPLETED ==========');
    logger.info(`Successfully made public: ${successCount} photos`);
    logger.info(`Not found in bucket: ${notFoundCount} photos`);
    logger.info(`Failed: ${errorCount} photos`);
    
    if (notFoundCount > 0) {
      logger.warn('Some photos are in database but not in bucket. They may need to be re-uploaded.');
    }
    
  } catch (error: any) {
    logger.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkAndFixPhotoAccess()
  .then(() => {
    logger.info('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });

