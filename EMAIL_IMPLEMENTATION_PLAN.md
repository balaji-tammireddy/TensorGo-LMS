# Email Integration Implementation Plan

## Overview
This document outlines the complete plan for implementing all email notification scenarios in the TensorGo LMS system.

---

## ✅ Already Implemented

### 1. Leave Application Notification
- **Status**: ✅ Complete
- **Recipients**: Reporting Manager + Manager's Reporting Manager (HR)
- **Trigger**: When employee applies for leave
- **Content**: Leave type, dates, reason, number of days, etc.
- **Location**: `backend/src/services/leave.service.ts` - `applyLeave()`

### 2. Forgot Password OTP
- **Status**: ✅ Complete
- **Recipients**: Employee (registered email)
- **Trigger**: When user requests password reset
- **Content**: 6-digit OTP code
- **Location**: `backend/src/services/auth.service.ts` - `requestPasswordReset()`

---

## 🔧 In Progress / Needs Fixing

### 3. Leave Approval/Rejection Notifications
- **Status**: 🔧 Partially Implemented (needs debugging)
- **Recipients**: 
  - Manager approves/rejects → Employee
  - HR approves/rejects → Manager + Employee
  - Super Admin approves/rejects → HR + Manager + Employee
- **Trigger**: When leave is approved/rejected
- **Content**: Leave details, approver name, approval/rejection comment, status
- **Location**: `backend/src/services/leave.service.ts` - `approveLeave()`, `rejectLeave()`
- **Issue**: Emails not triggering - needs debugging

---

## 📋 To Be Implemented

### 4. Leave Status Update Notifications
- **Recipients**: Employee
- **Trigger**: When leave status is updated at any stage (pending → approved/rejected/partially_approved)
- **Content**: Leave details, new status, who updated it, comment
- **Implementation**: Add to `updateLeaveStatus()` function
- **Priority**: High

### 5. New Employee Credentials Email
- **Recipients**: New Employee
- **Trigger**: When HR/Super Admin adds a new employee
- **Content**: 
  - Welcome message
  - Employee ID
  - Temporary password (or password reset link)
  - Login URL
  - Instructions for first-time login
- **Implementation**: Add to employee creation function
- **Priority**: High

### 6. Additional Leave Allocation Notification
- **Recipients**: Employee
- **Trigger**: When HR/Super Admin allocates additional leaves to an employee
- **Content**: 
  - Leave type (casual/sick/LOP)
  - Number of days allocated
  - New balance
  - Allocation date
- **Implementation**: Add to leave allocation function
- **Priority**: Medium

### 7. Daily Pending Leave Reminders
- **Recipients**: Reporting Managers
- **Trigger**: Daily cron job (e.g., 9:00 AM)
- **Content**: 
  - List of pending leave requests
  - Employee name, dates, leave type
  - Days pending approval
  - Link to approval page
- **Implementation**: 
  - Create cron job scheduler
  - Query pending leaves for each manager
  - Send summary email
- **Priority**: Medium

### 8. Birthday Wishes
- **Recipients**: All Employees
- **Trigger**: Daily cron job (check birthdays)
- **Content**: 
  - Birthday greeting
  - Personalized message
  - Company wishes
- **Implementation**: 
  - Create cron job scheduler
  - Query employees with today's birthday
  - Send birthday email
- **Priority**: Low

### 9. Leave Carry Forward Notification
- **Recipients**: Employees
- **Trigger**: When leaves are carried forward to next year (manual or automated)
- **Content**: 
  - Previous year balance
  - Carried forward amount
  - New year balance
  - Carry forward rules
- **Implementation**: Add to leave carry forward function
- **Priority**: Low

### 10. Urgent Leave Request Notification
- **Recipients**: Reporting Manager + HR
- **Trigger**: When employee applies for leave with urgent flag or within X days
- **Content**: 
  - Same as regular leave application
  - **Special**: Different subject line (e.g., "🚨 URGENT: Leave Application")
  - Highlighted urgent indicator in email
- **Implementation**: 
  - Add urgent flag to leave application
  - Create separate email template for urgent requests
  - Modify subject line and styling
- **Priority**: Medium

### 11. Password Change Security Email
- **Recipients**: User
- **Trigger**: When user successfully changes password
- **Content**: 
  - Security notification
  - Timestamp of change
  - If not you, contact admin message
  - Account security tips
- **Implementation**: Add to `changePassword()` function
- **Priority**: High

---

## Implementation Order (Recommended)

### Phase 1: Critical Fixes & High Priority
1. ✅ Fix Leave Approval/Rejection emails (debugging)
2. ✅ Implement Leave Status Update notifications
3. ✅ Implement Password Change Security Email
4. ✅ Implement New Employee Credentials Email

### Phase 2: Medium Priority
5. ✅ Implement Additional Leave Allocation notification
6. ✅ Implement Urgent Leave Request notification
7. ✅ Implement Daily Pending Leave Reminders (cron job)

### Phase 3: Low Priority
8. ✅ Implement Birthday Wishes (cron job)
9. ✅ Implement Leave Carry Forward notification

---

## Technical Requirements

### Email Templates Needed
1. ✅ Leave Application (existing)
2. ✅ Leave Status (Approval/Rejection) (existing)
3. ⏳ Leave Status Update (new)
4. ⏳ New Employee Credentials (new)
5. ⏳ Additional Leave Allocation (new)
6. ⏳ Daily Pending Leave Reminder (new)
7. ⏳ Birthday Wish (new)
8. ⏳ Leave Carry Forward (new)
9. ⏳ Urgent Leave Application (new - variant of existing)
10. ⏳ Password Change Security (new)

### Cron Job Setup
- **Library**: `node-cron` or `node-schedule`
- **Jobs Needed**:
  - Daily pending leave reminders (9:00 AM)
  - Daily birthday wishes (9:00 AM)
  - Yearly leave carry forward (end of year)

### Database Changes (if needed)
- Add `urgent` flag to `leave_requests` table (for urgent requests)
- Add `last_password_change` timestamp to `users` table (for security tracking)

---

## Email Template Structure

All emails should follow this structure:
- ✅ Unique subject line (prevents threading)
- ✅ Center-aligned content
- ✅ Professional design
- ✅ "Do not reply" notice
- ✅ HTML + Plain text versions
- ✅ Responsive design

---

## Testing Checklist

For each email scenario:
- [ ] Email is sent to correct recipients
- [ ] Email content is accurate
- [ ] Email formatting is correct
- [ ] Unique subject lines (no threading)
- [ ] Error handling (emails don't block main operations)
- [ ] Logging is in place
- [ ] Works for all user roles

---

## Notes

- All email failures should be logged but not block the main operation
- Email sending should be non-blocking (async)
- Consider rate limiting for cron jobs
- All emails should have unique identifiers to prevent threading
- Test with real email addresses before production deployment

