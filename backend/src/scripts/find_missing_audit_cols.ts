
import { pool } from '../database/db';

async function findMissingColumns() {
    const targetColumns = ['created_at', 'updated_at', 'created_by', 'updated_by'];
    try {
        const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
    `);

        for (const table of tablesRes.rows) {
            const tableName = table.table_name;
            const colsRes = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [tableName]);

            const existingCols = colsRes.rows.map(r => r.column_name);
            const missing = targetColumns.filter(c => !existingCols.includes(c));

            if (missing.length > 0) {
                console.log(`Table: ${tableName} is missing: ${missing.join(', ')}`);
            } else {
                console.log(`Table: ${tableName} has all audit columns.`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
findMissingColumns();
