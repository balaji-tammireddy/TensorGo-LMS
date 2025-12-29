/**
 * Script to make existing profile photos public
 * Updates ACL for all profile photos in OVHcloud bucket
 * 
 * Usage:
 *   npx ts-node src/scripts/makePhotosPublic.ts
 */

import dotenv from 'dotenv';
import { S3Client, PutObjectAclCommand } from '@aws-sdk/client-s3';
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

async function makePhotosPublic() {
  logger.info('========== MAKING PROFILE PHOTOS PUBLIC ==========');
  
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
    
    for (const user of result.rows) {
      const key = user.profile_photo_url;
      
      try {
        logger.info(`Making public: ${key} (User ID: ${user.id})`);
        
        const command = new PutObjectAclCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          ACL: 'public-read'
        });
        
        await s3Client.send(command);
        logger.info(`✓ Made public: ${key}`);
        successCount++;
      } catch (error: any) {
        logger.error(`✗ Failed to make public: ${key} - ${error.message}`);
        errorCount++;
      }
    }
    
    logger.info('========== COMPLETED ==========');
    logger.info(`Successfully made public: ${successCount} photos`);
    logger.info(`Failed: ${errorCount} photos`);
    
  } catch (error: any) {
    logger.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

makePhotosPublic()
  .then(() => {
    logger.info('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });

