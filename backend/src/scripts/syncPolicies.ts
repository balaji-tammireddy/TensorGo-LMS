import dotenv from 'dotenv';
import path from 'path';

// Load env vars MUST BE FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import fs from 'fs';
import { pool } from '../database/db';

const POLICIES_DIR = path.resolve(__dirname, '../../uploads/policies');

async function syncPolicies() {
    // Dynamic import to ensure env vars are loaded first
    const { uploadToOVH, getPublicUrlFromOVH } = await import('../utils/storage');

    try {
        if (!fs.existsSync(POLICIES_DIR)) {
            console.log(`Creating directory: ${POLICIES_DIR}`);
            fs.mkdirSync(POLICIES_DIR, { recursive: true });
        }

        const files = fs.readdirSync(POLICIES_DIR);

        if (files.length === 0) {
            console.log('No files found in uploads/policies. Please put your PDF files there.');
            return;
        }

        console.log(`Found ${files.length} files. Starting sync...`);

        const results = [];

        for (const file of files) {
            const filePath = path.join(POLICIES_DIR, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;
            if (!file.endsWith('.pdf')) {
                console.warn(`Skipping non-PDF file: ${file}`);
                continue;
            }

            const key = `policies/${file}`;
            const contentType = 'application/pdf';
            const title = file
                .replace(/\.pdf$/i, '')
                .replace(/\s*\(\d+\)/g, '') // Remove (1)
                .replace(/[_-]/g, ' ')      // Replace - and _ with space
                .replace(/\s+/g, ' ')       // Collapse multiple spaces
                .trim()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            console.log(`Uploading ${file}...`);
            await uploadToOVH(filePath, key, contentType);

            const publicUrl = getPublicUrlFromOVH(key);

            // Update or Insert into Database
            console.log(`Updating database record for ${title}...`);
            await pool.query(
                `INSERT INTO policies (title, s3_key, public_url, icon_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (title) DO UPDATE 
         SET s3_key = EXCLUDED.s3_key, 
             public_url = EXCLUDED.public_url,
             updated_at = CURRENT_TIMESTAMP`,
                [title, key, publicUrl, 'file']
            );

            results.push({
                title,
                url: publicUrl
            });
        }

        console.log('\n--- Sync Results ---');
        console.table(results);
        console.log('\nPolicies have been uploaded and database records updated.');

    } catch (error) {
        console.error('Error syncing policies:', error);
    } finally {
        await pool.end();
    }
}

// Add unique constraint on title if it doesn't exist to support ON CONFLICT
async function setupDatabase() {
    try {
        await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policies_title_key') THEN
          ALTER TABLE policies ADD CONSTRAINT policies_title_key UNIQUE (title);
        END IF;
      END
      $$;
    `);
    } catch (err) {
        console.error('Error setting up unique constraint:', err);
    }
}

setupDatabase().then(() => syncPolicies());
