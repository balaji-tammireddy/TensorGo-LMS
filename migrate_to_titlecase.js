const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

function toTitleCase(str) {
    if (!str || typeof str !== 'string') return str || null;
    const trimmed = str.trim();
    if (trimmed === '') return null;
    return trimmed
        .toLowerCase()
        .replace(/(?:^|\s|[,./#-])\w/g, (match) => match.toUpperCase());
}

async function migrateData() {
    console.log('Starting migration to update existing data to title case...');

    try {
        const result = await pool.query('SELECT id, first_name, middle_name, last_name, designation, department, current_address, permanent_address, emergency_contact_name, emergency_contact_relation, reporting_manager_name, pg_stream, pg_college, ug_stream, ug_college, twelveth_stream, twelveth_college FROM users');

        console.log(`Found ${result.rows.length} users to process.`);

        let updateCount = 0;
        for (const row of result.rows) {
            const updates = [];
            const values = [];
            let paramIndex = 1;

            const fieldsToUpdate = {
                first_name: row.first_name,
                middle_name: row.middle_name,
                last_name: row.last_name,
                designation: row.designation,
                department: row.department,
                current_address: row.current_address,
                permanent_address: row.permanent_address,
                emergency_contact_name: row.emergency_contact_name,
                emergency_contact_relation: row.emergency_contact_relation,
                reporting_manager_name: row.reporting_manager_name,
                pg_stream: row.pg_stream,
                pg_college: row.pg_college,
                ug_stream: row.ug_stream,
                ug_college: row.ug_college,
                twelveth_stream: row.twelveth_stream,
                twelveth_college: row.twelveth_college
            };

            for (const [col, val] of Object.entries(fieldsToUpdate)) {
                if (val && typeof val === 'string') {
                    const formatted = toTitleCase(val);
                    if (formatted !== val) {
                        updates.push(`${col} = $${paramIndex++}`);
                        values.push(formatted);
                    }
                }
            }

            if (updates.length > 0) {
                values.push(row.id);
                await pool.query(
                    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                    values
                );
                updateCount++;
            }
        }

        console.log(`Migration completed successfully. Updated ${updateCount} records.`);
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

migrateData();
