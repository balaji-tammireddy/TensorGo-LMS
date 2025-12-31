// Use dynamic import for storage to ensure env vars are loaded first
let uploadBufferToOVH: any;
let getPublicUrlFromOVH: any;

import dotenv from 'dotenv';
import path from 'path';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env:', result.error);
}

console.log('OVH Variables found:', Object.keys(process.env).filter(k => k.startsWith('OVH')));

if (!process.env.OVH_ACCESS_KEY) {
    console.error('CRITICAL: OVH_ACCESS_KEY is missing!');
}

const policies = [
    { name: 'Asset Management Policy', id: '17VV62wq3nDbEjIsSUxjv2mvY1_r0J1my', filename: 'policies/asset-management-policy.pdf' },
    { name: 'Communication Policy', id: '12gEiPPZaMYDuviGUbCn5Z6YhMxh9DhF3', filename: 'policies/communication-policy.pdf' },
    { name: 'Dress Code Policy', id: '14iH2dyTRW5uHzEpkQEhlP17i0XIlNsH7', filename: 'policies/dress-code-policy.pdf' },
    { name: 'Leave Policy', id: '1c8swrM5oyDk_uj8dDqv7pRkNMAY4-pbD', filename: 'policies/leave-policy.pdf' },
    { name: 'Quality Management Policy', id: '149A0PlIW6mzSKj4G4dcTWbaxN7A7mfmh', filename: 'policies/quality-management-policy.pdf' },
    { name: 'WFO Policy', id: '1hn9wzeSyyD74TI4EXw9pQt3MaoFA6GNe', filename: 'policies/wfo-policy.pdf' },
];

const LOCAL_Policies_DIR = path.join(__dirname, '../../uploads/policies');
import fs from 'fs';

async function getFileBuffer(policy: { id: string, filename: string, name: string }): Promise<Buffer> {
    // 1. Try Local File first
    // Expected local filename is the basename of the target S3 key (e.g. leave-policy.pdf)
    const localFileName = path.basename(policy.filename);
    const localFilePath = path.join(LOCAL_Policies_DIR, localFileName);

    if (fs.existsSync(localFilePath)) {
        console.log(`📂 Found local file for ${policy.name}: ${localFilePath}`);
        return fs.readFileSync(localFilePath);
    }

    // 2. Try Google Drive Download (Fallback)
    try {
        console.log(`☁️ Attempting download for ${policy.name} (ID: ${policy.id})...`);
        const url = `https://drive.google.com/uc?export=download&id=${policy.id}`;
        const response = await fetch(url);
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            // Check if it's not a service error page (small HTML)
            if (arrayBuffer.byteLength > 2000) {
                return Buffer.from(arrayBuffer);
            }
        }
    } catch (e) {
        // Ignore download error
    }

    // 3. Use Placeholder (Final Fallback)
    console.warn(`⚠️ Using PLACEHOLDER for ${policy.name} (Local file '${localFileName}' not found).`);
    return Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>startxref
178
%%EOF`);
}


async function main() {
    // Load storage module now that env vars are set
    const storage = await import('../utils/storage');
    uploadBufferToOVH = storage.uploadBufferToOVH;
    getPublicUrlFromOVH = storage.getPublicUrlFromOVH;

    console.log('Starting policy upload...');
    const uploadedUrls: Record<string, string> = {};

    for (const policy of policies) {
        try {
            console.log(`Processing ${policy.name} (ID: ${policy.id})...`);
            const buffer = await getFileBuffer(policy);
            const isPlaceholder = buffer.length < 1000; // Our placeholder is small

            console.log(`Uploading ${policy.name} to ${policy.filename} ${isPlaceholder ? '(Placeholder)' : '(Real/Local File)'}...`);
            await uploadBufferToOVH(buffer, policy.filename, 'application/pdf');

            const publicUrl = getPublicUrlFromOVH(policy.filename);
            console.log(`✅ Success! URL: ${publicUrl}`);
            uploadedUrls[policy.name] = publicUrl;
        } catch (error) {
            console.error(`❌ Failed to process ${policy.name}:`, error);
        }
    }

    console.log('\nDeployment Complete. URLs:');
    console.table(uploadedUrls);
}

main().catch(console.error);
