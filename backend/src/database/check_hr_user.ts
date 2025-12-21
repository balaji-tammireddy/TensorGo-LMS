import { pool } from './db';
import bcrypt from 'bcrypt';

async function checkHRUser() {
  try {
    // Check if HR user exists
    const result = await pool.query(
      `SELECT id, emp_id, email, role, first_name, last_name, status, password_hash 
       FROM users 
       WHERE email = 'hr@tensorgo.com' OR role = 'hr'`,
      []
    );
    
    console.log('HR Users found:', result.rows.length);
    
    if (result.rows.length === 0) {
      console.log('❌ No HR user found!');
      return;
    }
    
    for (const user of result.rows) {
      console.log('\n--- HR User Details ---');
      console.log('ID:', user.id);
      console.log('Emp ID:', user.emp_id);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('Name:', `${user.first_name} ${user.last_name || ''}`.trim());
      console.log('Status:', user.status);
      
      // Test password
      const testPassword = 'hr1234';
      const isValid = await bcrypt.compare(testPassword, user.password_hash);
      console.log('Password "hr1234" is valid:', isValid);
      
      if (!isValid) {
        console.log('⚠️  Password mismatch!');
      }
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking HR user:', error);
    await pool.end();
    process.exit(1);
  }
}

checkHRUser();

