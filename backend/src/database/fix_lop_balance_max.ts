import { pool } from './db';

async function fixLopBalanceMax() {
  try {
    console.log('Checking for LOP balances exceeding 10...');
    
    // Find all employees with LOP balance > 10
    const result = await pool.query(`
      SELECT employee_id, lop_balance 
      FROM leave_balances 
      WHERE lop_balance > 10
    `);
    
    if (result.rows.length === 0) {
      console.log('✅ No LOP balances exceed 10. All balances are within limit.');
      return;
    }
    
    console.log(`Found ${result.rows.length} employee(s) with LOP balance > 10:`);
    result.rows.forEach((row: any) => {
      console.log(`  Employee ID ${row.employee_id}: LOP balance = ${row.lop_balance}`);
    });
    
    // Cap all LOP balances at 10
    const updateResult = await pool.query(`
      UPDATE leave_balances
      SET lop_balance = 10,
          last_updated = CURRENT_TIMESTAMP
      WHERE lop_balance > 10
    `);
    
    console.log(`✅ Capped ${updateResult.rowCount} employee(s) LOP balance at 10`);
    console.log('LOP balance fix completed successfully');
  } catch (error) {
    console.error('LOP balance fix failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixLopBalanceMax();


