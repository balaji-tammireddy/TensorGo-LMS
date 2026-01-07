import { z } from 'zod';

const nameSchema = z.string()
    .min(1, 'Name is required')
    .regex(/^[a-zA-Z\s]+$/, 'Name should only contain letters and spaces');

const phoneSchema = z.string()
    .length(10, 'Phone number must be exactly 10 digits')
    .regex(/^\d+$/, 'Phone number must contain only digits');

const aadharSchema = z.string()
    .length(12, 'Aadhar must be exactly 12 digits')
    .regex(/^\d+$/, 'Aadhar must contain only digits');

const educationSchema = z.object({
    level: z.string(),
    groupStream: z.string().optional().or(z.literal('')),
    collegeUniversity: z.string().optional().or(z.literal('')),
    year: z.string().regex(/^\d{4}$/, 'Invalid year format').optional().or(z.literal('')),
    scorePercentage: z.string().optional().or(z.literal(''))
});

export const createEmployeeSchema = z.object({
    body: z.object({
        empId: z.string().max(6).regex(/^[A-Z0-9]+$/, 'Invalid Employee ID format'),
        role: z.enum(['super_admin', 'hr', 'manager', 'employee', 'intern']),
        email: z.string().email().refine(
            (email) => email.endsWith('@tensorgo.com') || email.endsWith('@tensorgo.co.in'),
            { message: 'Only organization mail should be used' }
        ),
        firstName: nameSchema,
        middleName: nameSchema.optional().or(z.literal('')),
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
        currentAddress: z.string().min(1, 'Current address is required'),
        permanentAddress: z.string().min(1, 'Permanent address is required'),
        reportingManagerId: z.number().nullable().optional(),
        reportingManagerName: z.string().nullable().optional(),
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
        middleName: nameSchema.optional().or(z.literal('')),
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
        reportingManagerName: z.string().nullable().optional(),
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
        comment: z.string().optional()
    })
});

export const updateProfileSchema = z.object({
    body: z.object({
        personalInfo: z.object({
            firstName: nameSchema.optional(),
            middleName: nameSchema.optional().or(z.literal('')),
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
            currentAddress: z.string().optional(),
            permanentAddress: z.string().optional()
        }).optional(),
        education: z.array(educationSchema).optional(),
        reportingManagerId: z.number().nullable().optional()
    })
});
