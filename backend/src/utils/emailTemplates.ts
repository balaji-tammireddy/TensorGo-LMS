import { sendEmail } from './email';

/**
 * Email template for leave application notification
 */
export interface LeaveApplicationEmailData {
  employeeName: string;
  employeeEmpId: string;
  managerName: string;
  leaveType: string;
  startDate: string;
  startType: string;
  endDate: string;
  endType: string;
  noOfDays: number;
  reason: string;
  timeForPermissionStart?: string | null;
  timeForPermissionEnd?: string | null;
  doctorNote?: string | null;
  appliedDate: string;
}

/**
 * Format leave type for display
 */
const formatLeaveType = (leaveType: string): string => {
  const types: { [key: string]: string } = {
    casual: 'Casual Leave',
    sick: 'Sick Leave',
    lop: 'Loss of Pay (LOP)',
    permission: 'Permission'
  };
  return types[leaveType] || leaveType;
};

/**
 * Format date for display (DD MMM YYYY)
 */
const formatDateForDisplay = (dateStr: string): string => {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

/**
 * Format start/end type for display
 */
const formatDayType = (type: string): string => {
  const types: { [key: string]: string } = {
    full: 'Full Day',
    half: 'Half Day',
    first_half: 'First Half',
    second_half: 'Second Half'
  };
  return types[type] || type;
};

/**
 * Format time for display (HH:MM AM/PM)
 */
const formatTime = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

/**
 * Generate leave application email HTML
 */
const generateLeaveApplicationEmailHtml = (data: LeaveApplicationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const appliedDateDisplay = formatDateForDisplay(data.appliedDate);

  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leave Application Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Leave Application Notification</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                A new leave application has been submitted by ${data.employeeName} (${data.employeeEmpId}).
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Leave Details:</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Start Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${startDateDisplay} (${startTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">End Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${endDateDisplay} (${endTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Number of Days:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  ${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Time:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Reason:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.reason}</td>
                  </tr>
                  ${data.doctorNote && data.leaveType !== 'sick' ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Doctor Note:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.doctorNote}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Applied Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${appliedDateDisplay}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Please review and take appropriate action on the leave application.
              </p>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Generate leave application email plain text
 */
const generateLeaveApplicationEmailText = (data: LeaveApplicationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const appliedDateDisplay = formatDateForDisplay(data.appliedDate);

  let text = `
Leave Application Notification

Dear ${data.managerName},

A new leave application has been submitted by ${data.employeeName} (${data.employeeEmpId}).

Leave Details:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}
- Leave Type: ${leaveTypeDisplay}
- Start Date: ${startDateDisplay} (${startTypeDisplay})
- End Date: ${endDateDisplay} (${endTypeDisplay})
- Number of Days: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
`;

  if (data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd) {
    text += `- Time: ${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}\n`;
  }

  text += `- Reason: ${data.reason}\n`;

  // Exclude doctor note for sick leaves (privacy)
  if (data.doctorNote && data.leaveType !== 'sick') {
    text += `- Doctor Note: ${data.doctorNote}\n`;
  }

  text += `- Applied Date: ${appliedDateDisplay}

Please review and take appropriate action on the leave application.

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;

  return text;
};

/**
 * Send leave application notification email
 */
export const sendLeaveApplicationEmail = async (
  managerEmail: string,
  data: LeaveApplicationEmailData
): Promise<boolean> => {
  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Leave Application - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;
  const emailHtml = generateLeaveApplicationEmailHtml(data);
  const emailText = generateLeaveApplicationEmailText(data);

  return await sendEmail({
    to: managerEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

/**
 * Email template for leave approval/rejection notification
 */
export interface LeaveStatusEmailData {
  employeeName: string;
  employeeEmpId: string;
  recipientName: string;
  recipientRole?: 'employee' | 'manager' | 'hr'; // To determine message type
  leaveType: string;
  startDate: string;
  startType: string;
  endDate: string;
  endType: string;
  noOfDays: number;
  reason: string;
  approverName: string;
  approverRole: string;
  comment?: string | null;
  status: 'approved' | 'rejected';
}

/**
 * Generate leave status email HTML (approval/rejection)
 */
const generateLeaveStatusEmailHtml = (data: LeaveStatusEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const statusDisplay = data.status === 'approved' ? 'Approved' : 'Rejected';
  const statusColor = data.status === 'approved' ? '#10b981' : '#ef4444';
  const statusIcon = data.status === 'approved' ? '✓' : '✗';

  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leave Status Updated</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Leave Status Updated</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.recipientName},
              </p>
              
              <div style="background-color: ${data.status === 'approved' ? '#d1fae5' : '#fee2e2'}; border-left: 4px solid ${statusColor}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: ${statusColor}; font-size: 32px; font-weight: 700; margin-bottom: 10px;">${statusIcon}</p>
                <p style="margin: 0; color: ${statusColor}; font-size: 20px; font-weight: 600;">Leave Status Updated</p>
              </div>
              
              <p style="margin: 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Leave status has been updated. The leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin'}).
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Leave Details:</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Start Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${startDateDisplay} (${startTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">End Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${endDateDisplay} (${endTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Number of Days:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Reason:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.reason}</td>
                  </tr>
                  ${data.comment ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">${data.status === 'approved' ? 'Approval' : 'Rejection'} Comment:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.comment}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Status:</td>
                    <td style="padding: 8px 0; color: ${statusColor}; font-size: 14px; font-weight: 600;">${statusDisplay}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Generate leave status email plain text (approval/rejection)
 */
const generateLeaveStatusEmailText = (data: LeaveStatusEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const statusDisplay = data.status === 'approved' ? 'Approved' : 'Rejected';
  const approverRoleDisplay = data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin';

  let text = `
Leave Status Updated

Dear ${data.recipientName},

Leave status has been updated. The leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).

Leave Details:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}
- Leave Type: ${leaveTypeDisplay}
- Start Date: ${startDateDisplay} (${startTypeDisplay})
- End Date: ${endDateDisplay} (${endTypeDisplay})
- Number of Days: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
- Reason: ${data.reason}
`;

  if (data.comment) {
    text += `- ${statusDisplay} Comment: ${data.comment}\n`;
  }

  text += `- Status: ${statusDisplay}

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;

  return text;
};

/**
 * Send leave status notification email (approval/rejection)
 */
export const sendLeaveStatusEmail = async (
  recipientEmail: string,
  data: LeaveStatusEmailData
): Promise<boolean> => {
  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const statusDisplay = data.status === 'approved' ? 'Approved' : 'Rejected';
  const approverRoleDisplay = data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin';
  
  // Common subject for all recipients
  const emailSubject = `Leave Status Updated - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;
  
  const emailHtml = generateLeaveStatusEmailHtml(data);
  const emailText = generateLeaveStatusEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// NEW EMPLOYEE CREDENTIALS EMAIL
// ============================================================================

export interface NewEmployeeCredentialsEmailData {
  employeeName: string;
  employeeEmpId: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}

const generateNewEmployeeCredentialsEmailHtml = (data: NewEmployeeCredentialsEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to TensorGo LMS</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Welcome to TensorGo LMS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Welcome to TensorGo Leave Management System! Your account has been created successfully.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Your Login Credentials:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Email:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Temporary Password:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600; font-family: monospace;">${data.temporaryPassword}</td>
                  </tr>
                </table>
              </div>
              <div style="margin: 30px 0;">
                <a href="${data.loginUrl}" style="display: inline-block; padding: 12px 30px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Login to Portal</a>
              </div>
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                <strong>Important:</strong> Please change your password after your first login for security purposes.
              </p>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const generateNewEmployeeCredentialsEmailText = (data: NewEmployeeCredentialsEmailData): string => {
  return `
Welcome to TensorGo LMS

Dear ${data.employeeName},

Welcome to TensorGo Leave Management System! Your account has been created successfully.

Your Login Credentials:
- Employee ID: ${data.employeeEmpId}
- Email: ${data.email}
- Temporary Password: ${data.temporaryPassword}

Login URL: ${data.loginUrl}

Important: Please change your password after your first login for security purposes.

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendNewEmployeeCredentialsEmail = async (
  employeeEmail: string,
  data: NewEmployeeCredentialsEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Welcome to TensorGo LMS - Your Login Credentials [Ref: ${uniqueId}]`;
  const emailHtml = generateNewEmployeeCredentialsEmailHtml(data);
  const emailText = generateNewEmployeeCredentialsEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// ADDITIONAL LEAVE ALLOCATION EMAIL
// ============================================================================

export interface LeaveAllocationEmailData {
  employeeName: string;
  employeeEmpId: string;
  leaveType: string;
  allocatedDays: number;
  previousBalance: number;
  newBalance: number;
  allocatedBy: string;
  allocationDate: string;
}

const generateLeaveAllocationEmailHtml = (data: LeaveAllocationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const allocationDateDisplay = formatDateForDisplay(data.allocationDate);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leave Allocation Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background-color: #10b981; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Leave Allocation Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Additional leaves have been allocated to your account.
              </p>
              <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #10b981; font-size: 18px;">Allocation Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Days Allocated:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Previous Balance:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.previousBalance} ${data.previousBalance === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">New Balance:</td>
                    <td style="padding: 8px 0; color: #10b981; font-size: 14px; font-weight: 600;">${data.newBalance} ${data.newBalance === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Allocated By:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.allocatedBy}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Allocation Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${allocationDateDisplay}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const generateLeaveAllocationEmailText = (data: LeaveAllocationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const allocationDateDisplay = formatDateForDisplay(data.allocationDate);

  return `
Leave Allocation Notification

Dear ${data.employeeName},

Additional leaves have been allocated to your account.

Allocation Details:
- Leave Type: ${leaveTypeDisplay}
- Days Allocated: ${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}
- Previous Balance: ${data.previousBalance} ${data.previousBalance === 1 ? 'day' : 'days'}
- New Balance: ${data.newBalance} ${data.newBalance === 1 ? 'day' : 'days'}
- Allocated By: ${data.allocatedBy}
- Allocation Date: ${allocationDateDisplay}

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendLeaveAllocationEmail = async (
  employeeEmail: string,
  data: LeaveAllocationEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Leave Allocation - ${data.leaveType} Leave Added [Ref: ${uniqueId}]`;
  const emailHtml = generateLeaveAllocationEmailHtml(data);
  const emailText = generateLeaveAllocationEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// PASSWORD CHANGE SECURITY EMAIL
// ============================================================================

export interface PasswordChangeSecurityEmailData {
  userName: string;
  changeTimestamp: string;
  ipAddress?: string;
}

const generatePasswordChangeSecurityEmailHtml = (data: PasswordChangeSecurityEmailData): string => {
  const changeDateDisplay = formatDateForDisplay(data.changeTimestamp);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Changed - Security Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background-color: #ef4444; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Security Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #ef4444; font-size: 32px; font-weight: 700; margin-bottom: 10px;">🔒</p>
                <p style="margin: 0; color: #ef4444; font-size: 20px; font-weight: 600;">Your Password Has Been Changed</p>
              </div>
              <p style="margin: 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.userName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                This is a security notification to inform you that your password was successfully changed.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Change Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Date & Time:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${changeDateDisplay}</td>
                  </tr>
                  ${data.ipAddress ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">IP Address:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.ipAddress}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                  <strong>⚠️ Important:</strong> If you did not make this change, please contact your administrator immediately and change your password again.
                </p>
              </div>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS Security Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated security email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const generatePasswordChangeSecurityEmailText = (data: PasswordChangeSecurityEmailData): string => {
  const changeDateDisplay = formatDateForDisplay(data.changeTimestamp);

  return `
Security Notification - Password Changed

Dear ${data.userName},

This is a security notification to inform you that your password was successfully changed.

Change Details:
- Date & Time: ${changeDateDisplay}
${data.ipAddress ? `- IP Address: ${data.ipAddress}\n` : ''}

⚠️ Important: If you did not make this change, please contact your administrator immediately and change your password again.

Best regards,
TensorGo-LMS Security Team

---
This is an automated security email from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendPasswordChangeSecurityEmail = async (
  userEmail: string,
  data: PasswordChangeSecurityEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Security Alert: Password Changed [Ref: ${uniqueId}]`;
  const emailHtml = generatePasswordChangeSecurityEmailHtml(data);
  const emailText = generatePasswordChangeSecurityEmailText(data);

  return await sendEmail({
    to: userEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// DAILY PENDING LEAVE REMINDER EMAIL
// ============================================================================

export interface PendingLeaveReminderEmailData {
  managerName: string;
  pendingLeaves: Array<{
    employeeName: string;
    employeeEmpId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    noOfDays: number;
    appliedDate: string;
    daysPending: number;
  }>;
}

const generatePendingLeaveReminderEmailHtml = (data: PendingLeaveReminderEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  const today = new Date();
  const todayDisplay = formatDateForDisplay(today.toISOString().split('T')[0]);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pending Leave Approvals Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background-color: #f59e0b; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Pending Leave Approvals Reminder</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                You have <strong>${data.pendingLeaves.length}</strong> pending leave ${data.pendingLeaves.length === 1 ? 'request' : 'requests'} awaiting your approval.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #f59e0b; font-size: 18px;">Pending Leave Requests:</h3>
                ${data.pendingLeaves.map((leave, index) => `
                <div style="margin-bottom: ${index < data.pendingLeaves.length - 1 ? '20px' : '0'}; padding-bottom: ${index < data.pendingLeaves.length - 1 ? '20px' : '0'}; border-bottom: ${index < data.pendingLeaves.length - 1 ? '1px solid #e0e0e0' : 'none'};">
                  <p style="margin: 0 0 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${leave.employeeName} (${leave.employeeEmpId})</p>
                  <p style="margin: 0 0 4px 0; color: #666666; font-size: 13px;">Leave Type: ${formatLeaveType(leave.leaveType)}</p>
                  <p style="margin: 0 0 4px 0; color: #666666; font-size: 13px;">Dates: ${formatDateForDisplay(leave.startDate)} to ${formatDateForDisplay(leave.endDate)}</p>
                  <p style="margin: 0 0 4px 0; color: #666666; font-size: 13px;">Days: ${leave.noOfDays} ${leave.noOfDays === 1 ? 'day' : 'days'}</p>
                  <p style="margin: 0; color: #f59e0b; font-size: 13px; font-weight: 600;">Pending for ${leave.daysPending} ${leave.daysPending === 1 ? 'day' : 'days'}</p>
                </div>
                `).join('')}
              </div>
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Please review and take appropriate action on these leave requests at your earliest convenience.
              </p>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated daily reminder from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const generatePendingLeaveReminderEmailText = (data: PendingLeaveReminderEmailData): string => {
  return `
Pending Leave Approvals Reminder

Dear ${data.managerName},

You have ${data.pendingLeaves.length} pending leave ${data.pendingLeaves.length === 1 ? 'request' : 'requests'} awaiting your approval.

Pending Leave Requests:
${data.pendingLeaves.map((leave, index) => `
${index + 1}. ${leave.employeeName} (${leave.employeeEmpId})
   - Leave Type: ${formatLeaveType(leave.leaveType)}
   - Dates: ${formatDateForDisplay(leave.startDate)} to ${formatDateForDisplay(leave.endDate)}
   - Days: ${leave.noOfDays} ${leave.noOfDays === 1 ? 'day' : 'days'}
   - Pending for ${leave.daysPending} ${leave.daysPending === 1 ? 'day' : 'days'}
`).join('')}

Please review and take appropriate action on these leave requests at your earliest convenience.

Best regards,
TensorGo-LMS

---
This is an automated daily reminder from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendPendingLeaveReminderEmail = async (
  managerEmail: string,
  data: PendingLeaveReminderEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Reminder: ${data.pendingLeaves.length} Pending Leave ${data.pendingLeaves.length === 1 ? 'Request' : 'Requests'} Awaiting Approval [Ref: ${uniqueId}]`;
  const emailHtml = generatePendingLeaveReminderEmailHtml(data);
  const emailText = generatePendingLeaveReminderEmailText(data);

  return await sendEmail({
    to: managerEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// BIRTHDAY WISH EMAIL
// ============================================================================

export interface BirthdayWishEmailData {
  employeeName: string;
  employeeEmpId: string;
  birthdayEmployeeName?: string;
  birthdayEmployeeEmpId?: string;
}

const generateBirthdayWishEmailHtml = (data: BirthdayWishEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Happy Birthday!</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 600;">🎉 Happy Birthday! 🎂</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 18px; line-height: 1.6; font-weight: 600;">
                Dear ${data.employeeName},
              </p>
              ${data.birthdayEmployeeName ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #92400e; font-size: 18px; font-weight: 600;">
                  🎉 Today is ${data.birthdayEmployeeName}'s (${data.birthdayEmployeeEmpId}) birthday! 🎂
                </p>
              </div>
              ` : ''}
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${data.birthdayEmployeeName ? `Let's join together to wish ${data.birthdayEmployeeName} a wonderful birthday filled with joy, happiness, and success!` : 'Wishing you a wonderful birthday filled with joy, happiness, and success!'}
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${data.birthdayEmployeeName ? `May this special day bring ${data.birthdayEmployeeName} countless reasons to smile and celebrate. We hope their year ahead is filled with new opportunities, achievements, and memorable moments.` : 'May this special day bring you countless reasons to smile and celebrate. We hope your year ahead is filled with new opportunities, achievements, and memorable moments.'}
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${data.birthdayEmployeeName ? `Thank you ${data.birthdayEmployeeName} for being a valuable part of our team. Have a fantastic day!` : 'Thank you for being a valuable part of our team. Have a fantastic day!'}
              </p>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Warm regards,<br>
                <strong>TensorGo-LMS Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated birthday wish from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const generateBirthdayWishEmailText = (data: BirthdayWishEmailData): string => {
  return `
🎉 Happy Birthday! 🎂

Dear ${data.employeeName},

${data.birthdayEmployeeName ? `Today is ${data.birthdayEmployeeName}'s (${data.birthdayEmployeeEmpId}) birthday!` : ''}

${data.birthdayEmployeeName ? `Let's join together to wish ${data.birthdayEmployeeName} a wonderful birthday filled with joy, happiness, and success!` : 'Wishing you a wonderful birthday filled with joy, happiness, and success!'}

${data.birthdayEmployeeName ? `May this special day bring ${data.birthdayEmployeeName} countless reasons to smile and celebrate. We hope their year ahead is filled with new opportunities, achievements, and memorable moments.` : 'May this special day bring you countless reasons to smile and celebrate. We hope your year ahead is filled with new opportunities, achievements, and memorable moments.'}

${data.birthdayEmployeeName ? `Thank you ${data.birthdayEmployeeName} for being a valuable part of our team. Have a fantastic day!` : 'Thank you for being a valuable part of our team. Have a fantastic day!'}

Warm regards,
TensorGo-LMS Team

---
This is an automated birthday wish from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendBirthdayWishEmail = async (
  employeeEmail: string,
  data: BirthdayWishEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `🎉 ${data.birthdayEmployeeName ? `Happy Birthday ${data.birthdayEmployeeName}!` : `Happy Birthday ${data.employeeName}!`} [Ref: ${uniqueId}]`;
  const emailHtml = generateBirthdayWishEmailHtml(data);
  const emailText = generateBirthdayWishEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// LEAVE CARRY FORWARD EMAIL
// ============================================================================

export interface LeaveCarryForwardEmailData {
  employeeName: string;
  employeeEmpId: string;
  previousYear: number;
  newYear: number;
  carriedForwardLeaves: {
    casual?: number;
    sick?: number;
    lop?: number;
  };
  newYearBalances: {
    casual: number;
    sick: number;
    lop: number;
  };
}

const generateLeaveCarryForwardEmailHtml = (data: LeaveCarryForwardEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const carriedForwardItems = [];
  if (data.carriedForwardLeaves.casual) {
    carriedForwardItems.push(`${data.carriedForwardLeaves.casual} Casual ${data.carriedForwardLeaves.casual === 1 ? 'Leave' : 'Leaves'}`);
  }
  if (data.carriedForwardLeaves.sick) {
    carriedForwardItems.push(`${data.carriedForwardLeaves.sick} Sick ${data.carriedForwardLeaves.sick === 1 ? 'Leave' : 'Leaves'}`);
  }
  if (data.carriedForwardLeaves.lop) {
    carriedForwardItems.push(`${data.carriedForwardLeaves.lop} LOP ${data.carriedForwardLeaves.lop === 1 ? 'Leave' : 'Leaves'}`);
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leave Carry Forward Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Leave Carry Forward Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Your leave balances from ${data.previousYear} have been carried forward to ${data.newYear}.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Carry Forward Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Carried Forward:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${carriedForwardItems.join(', ') || 'None'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">New Year (${data.newYear}) Balances:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;"></td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0 4px 20px; color: #666666; font-size: 13px;">Casual Leave:</td>
                    <td style="padding: 4px 0; color: #333333; font-size: 13px; font-weight: 600;">${data.newYearBalances.casual} ${data.newYearBalances.casual === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0 4px 20px; color: #666666; font-size: 13px;">Sick Leave:</td>
                    <td style="padding: 4px 0; color: #333333; font-size: 13px; font-weight: 600;">${data.newYearBalances.sick} ${data.newYearBalances.sick === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0 4px 20px; color: #666666; font-size: 13px;">LOP:</td>
                    <td style="padding: 4px 0; color: #333333; font-size: 13px; font-weight: 600;">${data.newYearBalances.lop} ${data.newYearBalances.lop === 1 ? 'day' : 'days'}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const generateLeaveCarryForwardEmailText = (data: LeaveCarryForwardEmailData): string => {
  const carriedForwardItems = [];
  if (data.carriedForwardLeaves.casual) {
    carriedForwardItems.push(`${data.carriedForwardLeaves.casual} Casual ${data.carriedForwardLeaves.casual === 1 ? 'Leave' : 'Leaves'}`);
  }
  if (data.carriedForwardLeaves.sick) {
    carriedForwardItems.push(`${data.carriedForwardLeaves.sick} Sick ${data.carriedForwardLeaves.sick === 1 ? 'Leave' : 'Leaves'}`);
  }
  if (data.carriedForwardLeaves.lop) {
    carriedForwardItems.push(`${data.carriedForwardLeaves.lop} LOP ${data.carriedForwardLeaves.lop === 1 ? 'Leave' : 'Leaves'}`);
  }

  return `
Leave Carry Forward Notification

Dear ${data.employeeName},

Your leave balances from ${data.previousYear} have been carried forward to ${data.newYear}.

Carry Forward Details:
- Carried Forward: ${carriedForwardItems.join(', ') || 'None'}
- New Year (${data.newYear}) Balances:
  * Casual Leave: ${data.newYearBalances.casual} ${data.newYearBalances.casual === 1 ? 'day' : 'days'}
  * Sick Leave: ${data.newYearBalances.sick} ${data.newYearBalances.sick === 1 ? 'day' : 'days'}
  * LOP: ${data.newYearBalances.lop} ${data.newYearBalances.lop === 1 ? 'day' : 'days'}

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendLeaveCarryForwardEmail = async (
  employeeEmail: string,
  data: LeaveCarryForwardEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Leave Carry Forward - ${data.previousYear} to ${data.newYear} [Ref: ${uniqueId}]`;
  const emailHtml = generateLeaveCarryForwardEmailHtml(data);
  const emailText = generateLeaveCarryForwardEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// URGENT LEAVE APPLICATION EMAIL (Variant of regular leave application)
// ============================================================================

export const sendUrgentLeaveApplicationEmail = async (
  managerEmail: string,
  data: LeaveApplicationEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  // Use urgent subject line
  const emailSubject = `🚨 URGENT: Leave Application - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;
  
  // Generate HTML with urgent styling
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const appliedDateDisplay = formatDateForDisplay(data.appliedDate);

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>URGENT: Leave Application Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 30px 40px; background-color: #ef4444; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">🚨 URGENT: Leave Application</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #fee2e2; border: 2px solid #ef4444; padding: 15px; margin: 0 0 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #ef4444; font-size: 18px; font-weight: 700;">⚠️ URGENT REQUEST - REQUIRES IMMEDIATE ATTENTION</p>
              </div>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                An <strong>URGENT</strong> leave application has been submitted by ${data.employeeName} (${data.employeeEmpId}).
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #ef4444; font-size: 18px;">Leave Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Start Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${startDateDisplay} (${startTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">End Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${endDateDisplay} (${endTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Number of Days:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  ${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Time:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Reason:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.reason}</td>
                  </tr>
                  ${data.doctorNote && data.leaveType !== 'sick' ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Doctor Note:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px;">${data.doctorNote}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Applied Date:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${appliedDateDisplay}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 20px 0 0 0; color: #ef4444; font-size: 14px; line-height: 1.6; font-weight: 600;">
                ⚠️ This is an URGENT request. Please review and take action as soon as possible.
              </p>
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const emailText = `
🚨 URGENT: Leave Application Notification

⚠️ URGENT REQUEST - REQUIRES IMMEDIATE ATTENTION

Dear ${data.managerName},

An URGENT leave application has been submitted by ${data.employeeName} (${data.employeeEmpId}).

Leave Details:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}
- Leave Type: ${leaveTypeDisplay}
- Start Date: ${startDateDisplay} (${startTypeDisplay})
- End Date: ${endDateDisplay} (${endTypeDisplay})
- Number of Days: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `- Time: ${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}\n` : ''}- Reason: ${data.reason}
${data.doctorNote && data.leaveType !== 'sick' ? `- Doctor Note: ${data.doctorNote}\n` : ''}- Applied Date: ${appliedDateDisplay}

⚠️ This is an URGENT request. Please review and take action as soon as possible.

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;

  return await sendEmail({
    to: managerEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

/**
 * Email template for employee details update notification
 */
export interface EmployeeDetailsUpdateEmailData {
  employeeName: string;
  employeeEmpId: string;
}

/**
 * Generate employee details update email HTML
 */
const generateEmployeeDetailsUpdateEmailHtml = (data: EmployeeDetailsUpdateEmailData): string => {
  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Employee Details Updated</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Employee Details Updated</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #2563eb; font-size: 20px; font-weight: 600;">Your employee details have been updated</p>
              </div>
              
              <p style="margin: 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Your employee profile details have been updated by HR or Super Admin. Please log in to your account to review the changes.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 15px 0; color: #2563eb; font-size: 18px;">Employee Information:</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666666; font-size: 14px;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #666666; font-size: 12px;">
                Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Generate employee details update email plain text
 */
const generateEmployeeDetailsUpdateEmailText = (data: EmployeeDetailsUpdateEmailData): string => {
  return `
Employee Details Updated

Dear ${data.employeeName},

Your employee profile details have been updated by HR or Super Admin. Please log in to your account to review the changes.

Employee Information:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}

Best regards,
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

/**
 * Send employee details update email
 */
export const sendEmployeeDetailsUpdateEmail = async (
  recipientEmail: string,
  data: EmployeeDetailsUpdateEmailData
): Promise<boolean> => {
  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  
  const emailSubject = `Employee Details Updated - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;
  const emailHtml = generateEmployeeDetailsUpdateEmailHtml(data);
  const emailText = generateEmployeeDetailsUpdateEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};
