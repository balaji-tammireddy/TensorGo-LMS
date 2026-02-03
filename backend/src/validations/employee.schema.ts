import { z } from 'zod';

const nameSchema = z.string()
    .min(1, 'Name is required')
    .max(25, 'Name cannot exceed 25 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name should only contain letters and spaces');

const safeTextSchema = z.string()
    .max(255, 'Text cannot exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s\.,\-'()&/+:;!?@#$%*\[\]{}\n\r]*$/, 'Special characters and emojis are not allowed');

const addressSchema = z.string()
    .max(255, 'Address cannot exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s\.,\-'()&/#!\n\r]*$/, 'Special characters and emojis are not allowed in address');

const longerTextSchema = z.string()
    .max(100, 'Text cannot exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\.,\-'()&/+:;]*$/, 'Special characters and emojis are not allowed');

const phoneSchema = z.string()
    .max(10, 'Phone number must be at most 10 digits')
    .regex(/^\d*$/, 'Phone number must contain only digits');

const aadharSchema = z.string()
    .max(12, 'Aadhar must be at most 12 digits')
    .regex(/^\d*$/, 'Aadhar must contain only digits');

const educationSchema = z.object({
    level: z.string().max(50),
    groupStream: z.union([z.string(), z.null(), z.undefined()]).optional().or(z.literal('')),
    collegeUniversity: z.union([z.string(), z.null(), z.undefined()]).optional().or(z.literal('')),
    year: z.union([
        z.string().regex(/^\d{4}$/, 'Invalid year format'),
        z.string().length(0),
        z.number(),
        z.null(),
        z.undefined()
    ]).optional().or(z.literal('')),
    scorePercentage: z.union([
        z.string().max(10),
        z.number(),
        z.null(),
        z.undefined()
    ]).optional().or(z.literal(''))
});

export const createEmployeeSchema = z.object({
    body: z.object({
        empId: z.string().max(20).regex(/^[A-Z0-9-]+$/, 'Invalid Employee ID format'),
        role: z.enum(['super_admin', 'hr', 'manager', 'employee', 'intern']),
        email: z.string().email('Invalid email address').max(100, 'Email cannot exceed 100 characters').refine(
            (email) => email.endsWith('@tensorgo.com') || email.endsWith('@tensorgo.co.in'),
            { message: 'Only organization mail should be used' }
        ),
        firstName: nameSchema,
        middleName: nameSchema.nullable().optional().or(z.literal('')),
        lastName: nameSchema,
        contactNumber: phoneSchema.nullable().optional().or(z.literal('')),
        altContact: phoneSchema.nullable().optional().or(z.literal('')),
        dateOfBirth: z.string(),
        gender: z.enum(['Male', 'Female', 'Other', '']).nullable().optional().or(z.literal('')),
        bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', '']).nullable().optional().or(z.literal('')),
        maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed', '']).nullable().optional().or(z.literal('')),
        emergencyContactName: nameSchema.nullable().optional().or(z.literal('')),
        emergencyContactNo: phoneSchema.nullable().optional().or(z.literal('')),
        emergencyContactRelation: nameSchema.nullable().optional().or(z.literal('')),
        designation: nameSchema.nullable().optional().or(z.literal('')),
        department: nameSchema.nullable().optional().or(z.literal('')),
        dateOfJoining: z.string().nullable().optional().or(z.literal('')),
        aadharNumber: aadharSchema.nullable().optional().or(z.literal('')),
        panNumber: z.union([
            z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
            z.string().length(0),
            z.null(),
            z.undefined()
        ]).optional(),
        currentAddress: addressSchema.nullable().optional().or(z.literal('')),
        permanentAddress: addressSchema.nullable().optional().or(z.literal('')),
        reportingManagerId: z.number().nullable().optional(),
        reportingManagerName: z.string().max(100).nullable().optional(),
        education: z.array(educationSchema).optional().nullable(),
        status: z.enum(['active', 'on_leave', 'on_notice', 'resigned', 'terminated', 'inactive']).optional()
    }).refine(data => {
        // Only validate if both dates are provided
        if (!data.dateOfJoining) return true;

        const dob = new Date(data.dateOfBirth);
        const doj = new Date(data.dateOfJoining);
        const minDoj = new Date(dob);
        minDoj.setFullYear(minDoj.getFullYear() + 18);
        return doj >= minDoj;
    }, {
        message: "Joining Date must be at least 18 years after Date of Birth",
        path: ["dateOfJoining"]
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
        contactNumber: phoneSchema.nullable().optional().or(z.literal('')),
        altContact: phoneSchema.nullable().optional().or(z.literal('')),
        emergencyContactName: nameSchema.nullable().optional().or(z.literal('')),
        emergencyContactNo: phoneSchema.nullable().optional().or(z.literal('')),
        emergencyContactRelation: nameSchema.nullable().optional().or(z.literal('')),
        designation: nameSchema.nullable().optional().or(z.literal('')),
        department: nameSchema.nullable().optional().or(z.literal('')),
        status: z.enum(['active', 'on_leave', 'on_notice', 'resigned', 'terminated', 'inactive']).optional(),
        role: z.enum(['super_admin', 'hr', 'manager', 'employee', 'intern']).optional(),
        reportingManagerId: z.number().nullable().optional(),
        reportingManagerName: z.string().max(100).nullable().optional(),
        education: z.array(educationSchema).optional(),
        empId: z.string().max(20).regex(/^[A-Z0-9-]+$/, 'Invalid Employee ID format').optional(),
        email: z.string().email('Invalid email address').max(100, 'Email cannot exceed 100 characters').refine(
            (email) => email.endsWith('@tensorgo.com') || email.endsWith('@tensorgo.co.in'),
            { message: 'Only organization mail should be used' }
        ).optional(),
        gender: z.enum(['Male', 'Female', 'Other', '']).nullable().optional().or(z.literal('')),
        bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', '']).nullable().optional().or(z.literal('')),
        maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed', '']).nullable().optional().or(z.literal('')),
        aadharNumber: aadharSchema.nullable().optional().or(z.literal('')),
        panNumber: z.union([
            z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
            z.string().length(0),
            z.null(),
            z.undefined()
        ]).optional(),
        dateOfBirth: z.string().optional(),
        dateOfJoining: z.string().nullable().optional().or(z.literal('')),
        currentAddress: addressSchema.nullable().optional().or(z.literal('')),
        permanentAddress: addressSchema.nullable().optional().or(z.literal(''))
    }).refine(data => {
        if (data.dateOfBirth && data.dateOfJoining) {
            const dob = new Date(data.dateOfBirth);
            const doj = new Date(data.dateOfJoining);
            const minDoj = new Date(dob);
            minDoj.setFullYear(minDoj.getFullYear() + 18);
            return doj >= minDoj;
        }
        return true;
    }, {
        message: "Joining Date must be at least 18 years after Date of Birth",
        path: ["dateOfJoining"]
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
            firstName: nameSchema.optional().nullable().or(z.literal('')),
            middleName: nameSchema.optional().nullable().or(z.literal('')),
            lastName: nameSchema.optional().nullable().or(z.literal('')),
            contactNumber: phoneSchema.optional().nullable(),
            altContact: phoneSchema.optional().nullable(),
            dateOfBirth: z.string().optional().nullable(),
            gender: z.enum(['Male', 'Female', 'Other']).optional().nullable(),
            bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']).optional().nullable(),
            maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed']).optional().nullable(),
            emergencyContactName: nameSchema.optional().nullable(),
            emergencyContactNo: phoneSchema.optional().nullable(),
            emergencyContactRelation: nameSchema.optional().nullable(),
            empId: z.string().max(20).regex(/^[A-Z0-9-]+$/, 'Invalid Employee ID format').optional().nullable(),
            email: z.string().email('Invalid email address').max(100, 'Email cannot exceed 100 characters').refine(
                (email) => email.endsWith('@tensorgo.com') || email.endsWith('@tensorgo.co.in'),
                { message: 'Only organization mail should be used' }
            ).optional().nullable(),
            personalEmail: z.string().email('Invalid email address').nullable().optional().or(z.literal(''))
        }).optional().nullable(),
        employmentInfo: z.object({
            designation: nameSchema.optional().nullable().or(z.literal('')),
            department: nameSchema.optional().nullable().or(z.literal('')),
            dateOfJoining: z.string().optional().nullable(),
            uanNumber: z.string().max(14).nullable().optional().or(z.literal('')),
            totalExperience: z.union([z.string(), z.number()]).nullable().optional().or(z.literal(''))
        }).optional().nullable(),
        documents: z.object({
            aadharNumber: aadharSchema.optional().nullable(),
            panNumber: z.union([
                z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
                z.string().length(0),
                z.null(),
                z.undefined()
            ]).optional().nullable()
        }).optional().nullable(),
        address: z.object({
            currentAddress: z.string().optional().nullable(),
            permanentAddress: z.string().optional().nullable()
        }).optional().nullable(),
        education: z.array(educationSchema).optional().nullable(),
        reportingManagerId: z.number().nullable().optional()
    }).refine(data => {
        if (data.personalInfo?.dateOfBirth && data.employmentInfo?.dateOfJoining) {
            const dob = new Date(data.personalInfo.dateOfBirth);
            const doj = new Date(data.employmentInfo.dateOfJoining);
            const minDoj = new Date(dob);
            minDoj.setFullYear(minDoj.getFullYear() + 18);
            return doj >= minDoj;
        }
        return true;
    }, {
        message: "Joining Date must be at least 18 years after Date of Birth",
        path: ["employmentInfo", "dateOfJoining"]
    })
});
