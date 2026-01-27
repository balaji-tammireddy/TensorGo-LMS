import { pool } from './src/database/db';

async function checkAuditColumns() {
    try {
        // Get all tables in the public schema
        const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

        console.log('=== Database Tables and Audit Columns Status ===\n');

        for (const table of tablesResult.rows) {
            const tableName = table.table_name;

            // Check for created_by and updated_by columns
            const columnsResult = await pool.query(`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        AND column_name IN ('created_by', 'updated_by', 'created_at', 'updated_at')
        ORDER BY column_name;
      `, [tableName]);

            console.log(`\n📋 Table: ${tableName}`);

            if (columnsResult.rows.length === 0) {
                console.log('  ❌ No audit columns found');
            } else {
                columnsResult.rows.forEach(col => {
                    const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
                    console.log(`  ✓ ${col.column_name} ${nullable}`);
                });
            }
        }

        console.log('\n\n=== Summary ===');
        console.log(`Total tables: ${tablesResult.rows.length}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkAuditColumns();
