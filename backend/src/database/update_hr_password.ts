import { pool } from './db';
import { hashPassword } from '../services/auth.service';

async function updateHRPassword() {
  try {
    const newPassword = 'hr1234';
    const hashedPassword = await hashPassword(newPassword);
    
    const result = await pool.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE email = 'hr@tensorgo.com' AND role = 'hr'
       RETURNING email, role`,
      [hashedPassword]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ HR password updated successfully!');
      console.log('New password:', newPassword);
    } else {
      console.log('⚠️  HR user not found. Make sure the user exists.');
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating HR password:', error);
    await pool.end();
    process.exit(1);
  }
}

updateHRPassword();

