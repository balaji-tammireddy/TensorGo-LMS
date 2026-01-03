import dotenv from 'dotenv';
// import { uploadToOVH, getPublicUrlFromOVH } from '../utils/storage';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

// Load environment variables from backend directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Upload login page image to OVHcloud bucket
 */
async function uploadLoginImage() {
  try {
    const { uploadToOVH, getPublicUrlFromOVH } = await import('../utils/storage');
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '../../uploads/logo.png'),
      path.join(process.cwd(), 'uploads/logo.png'),
      path.join(process.cwd(), '../uploads/logo.png'),
    ];

    let imagePath = '';
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        imagePath = possiblePath;
        break;
      }
    }

    if (!imagePath) {
      logger.error(`[UPLOAD LOGIN IMAGE] Image not found. Tried: ${possiblePaths.join(', ')}`);
      throw new Error(`Image file not found in any of the expected locations`);
    }

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      logger.error(`[UPLOAD LOGIN IMAGE] Image not found at: ${imagePath}`);
      throw new Error(`Image file not found: ${imagePath}`);
    }

    logger.info(`[UPLOAD LOGIN IMAGE] Found image at: ${imagePath}`);

    // Upload to OVHcloud with key: login-page/logo.png
    const key = 'login-page/logo.png';
    const contentType = 'image/png';

    logger.info(`[UPLOAD LOGIN IMAGE] Uploading to OVHcloud with key: ${key}`);
    await uploadToOVH(imagePath, key, contentType);

    // Get public URL
    const publicUrl = getPublicUrlFromOVH(key);
    logger.info(`[UPLOAD LOGIN IMAGE] ✅ Image uploaded successfully!`);
    logger.info(`[UPLOAD LOGIN IMAGE] Public URL: ${publicUrl}`);
    logger.info(`[UPLOAD LOGIN IMAGE] Use this URL in the frontend: ${publicUrl}`);

    console.log('\n✅ Login page image uploaded successfully!');
    console.log(`📎 Public URL: ${publicUrl}`);
    console.log(`\nUpdate the frontend LoginPage.tsx to use this URL.`);

    process.exit(0);
  } catch (error: any) {
    logger.error(`[UPLOAD LOGIN IMAGE] Error:`, error);
    console.error('❌ Failed to upload login image:', error.message);
    process.exit(1);
  }
}

uploadLoginImage();

