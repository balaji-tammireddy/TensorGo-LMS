/**
 * Migration script to upload existing local profile photos to OVHcloud
 * 
 * This script:
 * 1. Finds all users with local profile photos (/uploads/...)
 * 2. Uploads each photo to OVHcloud with key: profile-photos/{userId}/{filename}
 * 3. Updates the database with the new OVHcloud key
 * 4. Optionally deletes the local file after successful upload
 * 
 * Usage:
 *   npx ts-node src/scripts/migrateProfilePhotosToOVH.ts
 *   or
 *   npm run migrate:photos
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { pool } from '../database/db';
import { uploadToOVH } from '../utils/storage';
import { logger } from '../utils/logger';

dotenv.config();

interface UserPhoto {
  id: number;
  emp_id: string;
  profile_photo_url: string;
}

async function migrateProfilePhotos() {
  logger.info('========== PROFILE PHOTO MIGRATION STARTED ==========');
  
  // Check OVHcloud configuration
  if (!process.env.OVH_ACCESS_KEY || !process.env.OVH_SECRET_KEY || !process.env.OVH_BUCKET_NAME) {
    logger.error('OVHcloud configuration is missing. Please set OVH_ACCESS_KEY, OVH_SECRET_KEY, and OVH_BUCKET_NAME in .env');
    process.exit(1);
  }
  
  try {
    // Find all users with local profile photos
    const result = await pool.query<UserPhoto>(
      `SELECT id, emp_id, profile_photo_url 
       FROM users 
       WHERE profile_photo_url IS NOT NULL 
       AND profile_photo_url LIKE '/uploads/%'
       AND profile_photo_url NOT LIKE 'profile-photos/%'`
    );
    
    logger.info(`Found ${result.rows.length} users with local profile photos to migrate`);
    
    if (result.rows.length === 0) {
      logger.info('No local profile photos to migrate. Exiting.');
      return;
    }
    
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ userId: number; empId: string; error: string }> = [];
    
    for (const user of result.rows) {
      try {
        const localPath = user.profile_photo_url;
        const fullLocalPath = path.resolve(uploadDir, path.basename(localPath));
        
        // Check if local file exists
        if (!fs.existsSync(fullLocalPath)) {
          logger.warn(`[MIGRATION] Local file not found for user ${user.id} (${user.emp_id}): ${fullLocalPath}`);
          errors.push({
            userId: user.id,
            empId: user.emp_id,
            error: `Local file not found: ${fullLocalPath}`
          });
          errorCount++;
          continue;
        }
        
        // Determine MIME type from file extension
        const ext = path.extname(fullLocalPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };
        const contentType = mimeTypes[ext] || 'image/jpeg';
        
        // Generate OVHcloud key
        const filename = path.basename(fullLocalPath);
        const ovhKey = `profile-photos/${user.id}/${filename}`;
        
        logger.info(`[MIGRATION] Uploading photo for user ${user.id} (${user.emp_id}): ${fullLocalPath} -> ${ovhKey}`);
        
        // Upload to OVHcloud
        const uploadedKey = await uploadToOVH(fullLocalPath, ovhKey, contentType);
        
        // Update database
        await pool.query(
          'UPDATE users SET profile_photo_url = $1 WHERE id = $2',
          [uploadedKey, user.id]
        );
        
        logger.info(`[MIGRATION] Successfully migrated photo for user ${user.id} (${user.emp_id})`);
        successCount++;
        
        // Optionally delete local file (uncomment if you want to remove local files after migration)
        // try {
        //   fs.unlinkSync(fullLocalPath);
        //   logger.info(`[MIGRATION] Deleted local file: ${fullLocalPath}`);
        // } catch (deleteError: any) {
        //   logger.warn(`[MIGRATION] Failed to delete local file ${fullLocalPath}: ${deleteError.message}`);
        // }
        
      } catch (error: any) {
        logger.error(`[MIGRATION] Error migrating photo for user ${user.id} (${user.emp_id}):`, error);
        errors.push({
          userId: user.id,
          empId: user.emp_id,
          error: error.message || 'Unknown error'
        });
        errorCount++;
      }
    }
    
    logger.info('========== PROFILE PHOTO MIGRATION COMPLETED ==========');
    logger.info(`Successfully migrated: ${successCount} photos`);
    logger.info(`Failed: ${errorCount} photos`);
    
    if (errors.length > 0) {
      logger.warn('Errors encountered during migration:');
      errors.forEach(err => {
        logger.warn(`  User ${err.userId} (${err.empId}): ${err.error}`);
      });
    }
    
  } catch (error: any) {
    logger.error('Fatal error during migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrateProfilePhotos()
  .then(() => {
    logger.info('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Migration script failed:', error);
    process.exit(1);
  });

