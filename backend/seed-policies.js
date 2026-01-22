const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const defaultPolicies = [
    {
        title: 'Asset Management Policy',
        link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Asset Management Policy.pdf'
    },
    {
        title: 'Communication Policy',
        link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Communication Policy.pdf'
    },
    {
        title: 'Dress Code Policy',
        link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Dress Code Policy.pdf'
    },
    {
        title: 'Leave Policy',
        link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/leave-policy.pdf'
    },
    {
        title: 'Quality Management Policy',
        link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Quality Management Policy.pdf'
    },
    {
        title: 'Work Hour Policy',
        link: 'https://hr--lms.s3.us-east-va.io.cloud.ovh.us/policies/Work Hour Policy.pdf'
    }
];

async function seed() {
    const client = await pool.connect();
    try {
        console.log('Starting policy seeding and cleanup...');

        for (const policy of defaultPolicies) {
            // Check if a policy with this title already exists
            const res = await client.query('SELECT id FROM policies WHERE title = $1', [policy.title]);

            if (res.rows.length === 0) {
                console.log(`Adding missing policy: ${policy.title}`);
                const key = `policies/${path.basename(decodeURIComponent(policy.link))}`;
                await client.query(
                    'INSERT INTO policies (title, s3_key, public_url) VALUES ($1, $2, $3)',
                    [policy.title, key, policy.link]
                );
            } else {
                console.log(`Policy already exists: ${policy.title}`);
                // If there are multiple with same title, keep only the first one
                if (res.rows.length > 1) {
                    const idsToKeep = [res.rows[0].id];
                    const allIds = res.rows.map(r => r.id);
                    const idsToDelete = allIds.filter(id => !idsToKeep.includes(id));
                    console.log(`Removing duplicates for ${policy.title}: ${idsToDelete.join(', ')}`);
                    await client.query('DELETE FROM policies WHERE id = ANY($1)', [idsToDelete]);
                }
            }
        }

        console.log('Seeding and cleanup completed successfully.');
    } catch (err) {
        console.error('Error during seeding:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
