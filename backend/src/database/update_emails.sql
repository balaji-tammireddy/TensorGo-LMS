-- Update email addresses from company.com to tensorgo.com
-- Update manager email to balaji@tensorgo.com

UPDATE users SET email = 'admin@tensorgo.com' WHERE email = 'admin@company.com';
UPDATE users SET email = 'hr@tensorgo.com' WHERE email = 'hr@company.com';
UPDATE users SET email = 'balaji@tensorgo.com', first_name = 'Balaji' WHERE email = 'manager@company.com';
UPDATE users SET email = 'jaiwanth@tensorgo.com', first_name = 'Jaiwanth' WHERE email = 'jalwanth@company.com' OR email = 'jalwanth@tensorgo.com';
UPDATE users SET email = 'xyz@tensorgo.com' WHERE email = 'xyz@company.com';
UPDATE users SET email = 'abc@tensorgo.com' WHERE email = 'abc@company.com';

