import fs from 'fs';
import path from 'path';

const POLICIES_DIR = path.resolve(__dirname, '../../uploads/policies');

async function cleanupFiles() {
    try {
        if (!fs.existsSync(POLICIES_DIR)) {
            console.log('Policies directory not found.');
            return;
        }

        const files = fs.readdirSync(POLICIES_DIR);

        for (const file of files) {
            if (!file.endsWith('.pdf')) continue;

            const ext = path.extname(file);
            const nameWithoutExt = path.basename(file, ext);

            // Clean name: lowercase, hyphens, no brackets
            let newName = nameWithoutExt
                .replace(/\s*\(\d+\)\s*/g, ' ') // Remove (1)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')    // Replace everything not alpha-numeric with hyphen
                .replace(/-+/g, '-')           // Collapse multiple hyphens
                .replace(/^-|-$/g, '');        // Trim hyphens from start/end

            const newFileName = newName + ext;

            if (file !== newFileName) {
                const oldPath = path.join(POLICIES_DIR, file);
                const newPath = path.join(POLICIES_DIR, newFileName);

                console.log(`Renaming: "${file}" -> "${newFileName}"`);
                fs.renameSync(oldPath, newPath);
            }
        }
        console.log('File renaming to web-friendly format complete.');
    } catch (error) {
        console.error('Error during file cleanup:', error);
    }
}

cleanupFiles();
