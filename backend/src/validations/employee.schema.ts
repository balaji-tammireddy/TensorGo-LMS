import { z } from 'zod';

const nameSchema = z.string()
    .min(1, 'Name is required')
    .max(50, 'Name cannot exceed 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name should only contain letters and spaces');

const safeTextSchema = z.string()
    .max(255, 'Text cannot exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s\.,\-'()&/+:;]*$/, 'Special characters and emojis are not allowed');

const addressSchema = z.string()
    .min(1, 'Address is required')
    .max(255, 'Address cannot exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s\.,\-'()&/#]+$/, 'Special characters and emojis are not allowed in address');

const phoneSchema = z.string()
    .length(10, 'Phone number must be exactly 10 digits')
    .regex(/^\d+$/, 'Phone number must contain only digits');

const aadharSchema = z.string()
    .length(12, 'Aadhar must be exactly 12 digits')
    .regex(/^\d+$/, 'Aadhar must contain only digits');

const educationSchema = z.object({
    level: z.string().max(50),
    groupStream: safeTextSchema.nullable().optional().or(z.literal('')),
    collegeUniversity: safeTextSchema.nullable().optional().or(z.literal('')),
    year: z.union([
        z.string().regex(/^\d{4}$/, 'Invalid year format'),
        z.number()
    ]).nullable().optional().or(z.literal('')),
    scorePercentage: z.union([
        z.string().max(10).regex(/^[a-zA-Z0-9\s\.,%]+$/, 'Invalid score format'),
        z.number()
    ]).nullable().optional().or(z.literal(''))
});

export const createEmployeeSchema = z.object({
    body: z.object({
        empId: z.string().max(6).regex(/^[A-Z0-9]+$/, 'Invalid Employee ID format'),
        role: z.enum(['super_admin', 'hr', 'manager', 'employee', 'intern']),
        email: z.string().email().max(100, 'Email cannot exceed 100 characters').refine(
            (email) => email.endsWith('@tensorgo.com') || email.endsWith('@tensorgo.co.in'),
            { message: 'Only organization mail should be used' }
        ),
        firstName: nameSchema,
        middleName: nameSchema.nullable().optional().or(z.literal('')),
        lastName: nameSchema,
        contactNumber: phoneSchema,
        altContact: phoneSchema,
        dateOfBirth: z.string(),
        gender: z.enum(['Male', 'Female', 'Other']),
        bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']),
        maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed']),
        emergencyContactName: nameSchema,
        emergencyContactNo: phoneSchema,
        emergencyContactRelation: nameSchema,
        designation: nameSchema,
        department: nameSchema,
        dateOfJoining: z.string(),
        aadharNumber: aadharSchema,
        panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
        currentAddress: addressSchema,
        permanentAddress: addressSchema,
        reportingManagerId: z.number().nullable().optional(),
        reportingManagerName: nameSchema.nullable().optional(),
        education: z.array(educationSchema).min(1, 'Education details are required'),
        status: z.enum(['active', 'on_leave', 'on_notice', 'resigned', 'terminated', 'inactive']).optional()
    })
});

export const updateEmployeeSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'Invalid employee ID')
    }),
    body: z.object({
        firstName: nameSchema.optional(),
        middleName: nameSchema.nullable().optional().or(z.literal('')),
        lastName: nameSchema.optional(),
        contactNumber: phoneSchema.optional(),
        altContact: phoneSchema.optional(),
        emergencyContactName: nameSchema.optional(),
        emergencyContactNo: phoneSchema.optional(),
        emergencyContactRelation: nameSchema.optional(),
        designation: nameSchema.optional(),
        department: nameSchema.optional(),
        status: z.enum(['active', 'on_leave', 'on_notice', 'resigned', 'terminated', 'inactive']).optional(),
        role: z.enum(['super_admin', 'hr', 'manager', 'employee', 'intern']).optional(),
        reportingManagerId: z.number().nullable().optional(),
        reportingManagerName: nameSchema.nullable().optional(),
        education: z.array(educationSchema).optional(),
        aadharNumber: aadharSchema.optional(),
        panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format').optional()
    })
});

export const addLeavesSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'Invalid employee ID')
    }),
    body: z.object({
        leaveType: z.enum(['casual', 'sick', 'lop']),
        count: z.number().positive('Count must be positive'),
        comment: safeTextSchema.optional()
    })
});

export const updateProfileSchema = z.object({
    body: z.object({
        personalInfo: z.object({
            firstName: nameSchema.optional(),
            middleName: nameSchema.nullable().optional().or(z.literal('')),
            lastName: nameSchema.optional(),
            contactNumber: phoneSchema.optional(),
            altContact: phoneSchema.optional(),
            dateOfBirth: z.string().optional(),
            gender: z.enum(['Male', 'Female', 'Other']).optional(),
            bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']).optional(),
            maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed']).optional(),
            emergencyContactName: nameSchema.optional(),
            emergencyContactNo: phoneSchema.optional(),
            emergencyContactRelation: nameSchema.optional()
        }).optional(),
        employmentInfo: z.object({
            designation: nameSchema.optional(),
            department: nameSchema.optional(),
            dateOfJoining: z.string().optional()
        }).optional(),
        documents: z.object({
            aadharNumber: aadharSchema.optional(),
            panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format').optional()
        }).optional(),
        address: z.object({
            currentAddress: addressSchema.optional(),
            permanentAddress: addressSchema.optional()
        }).optional(),
        education: z.array(educationSchema).optional(),
        reportingManagerId: z.number().nullable().optional()
    })
});
