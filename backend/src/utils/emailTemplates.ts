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
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Leave Application Notification</h1>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                A new leave application has been submitted by <strong style="color: #1f2937; font-weight: 600;">${data.employeeName}</strong> (Employee ID: <strong style="color: #1f2937; font-weight: 600;">${data.employeeEmpId}</strong>). Please review the details below and take appropriate action.
              </p>
              
              <!-- Leave Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Leave Application Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Employee Name:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Leave Type:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Start Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${startDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${startTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">End Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${endDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${endTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Duration:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  ${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Time:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Reason:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.reason}</td>
                  </tr>
                  ${data.doctorNote && data.leaveType !== 'sick' ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Medical Certificate:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.doctorNote}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Application Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${appliedDateDisplay}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Action Notice -->
              <p style="margin: 28px 0 0 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Please review and take appropriate action on this leave application at your earliest convenience.
              </p>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
TensorGo

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
  data: LeaveApplicationEmailData,
  cc?: string | string[]
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
    cc,
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
  status: 'approved' | 'partially_approved' | 'rejected';
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
  const statusDisplay = data.status === 'approved' ? 'Approved' : data.status === 'partially_approved' ? 'Partially Approved' : 'Rejected';
  const statusColor = data.status === 'approved' ? '#10b981' : data.status === 'partially_approved' ? '#f59e0b' : '#ef4444';
  const statusBgColor = data.status === 'approved' ? '#d1fae5' : data.status === 'partially_approved' ? '#fef3c7' : '#fee2e2';
  const approverRoleDisplay = data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin';

  // Determine message based on recipient role
  let mainMessage = '';
  if (data.recipientRole === 'employee') {
    mainMessage = `Your leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).`;
  } else {
    mainMessage = `Your team member's leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).`;
  }

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
  <title>Leave Request Status</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0; vertical-align: middle;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Leave Request Status</h1>
                  </td>
                  <td style="padding: 0; vertical-align: middle; text-align: right;">
                    <span style="display: inline-block; background-color: ${data.status === 'approved' ? '#10b981' : data.status === 'partially_approved' ? '#f59e0b' : '#dc2626'}; color: ${data.status === 'approved' ? '#d1fae5' : data.status === 'partially_approved' ? '#fef3c7' : '#fee2e2'}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">${statusDisplay.toUpperCase()}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.recipientName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                ${mainMessage}
              </p>
              
              <!-- Leave Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Leave Request Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Employee Name:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Leave Type:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Start Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${startDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${startTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">End Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${endDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${endTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Duration:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Reason:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.reason}</td>
                  </tr>
                  ${data.comment ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">${data.status === 'approved' ? 'Approval' : data.status === 'partially_approved' ? 'Approval' : 'Rejection'} Comment:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.comment}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Status:</td>
                    <td style="padding: 12px 0;">
                      <span style="display: inline-block; background-color: ${data.status === 'approved' ? '#10b981' : data.status === 'partially_approved' ? '#f59e0b' : '#dc2626'}; color: ${data.status === 'approved' ? '#d1fae5' : data.status === 'partially_approved' ? '#fef3c7' : '#fee2e2'}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">${statusDisplay.toUpperCase()}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Approver Info -->
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; margin: 28px 0; border-radius: 6px;">
                <p style="margin: 0; color: #1f2937; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                  <strong style="font-weight: 600; color: #1e3a8a;">${data.status === 'approved' ? 'Approved' : data.status === 'partially_approved' ? 'Partially Approved' : 'Rejected'} by:</strong> ${data.approverName} (${approverRoleDisplay})
                </p>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
  const statusDisplay = data.status === 'approved' ? 'Approved' : data.status === 'partially_approved' ? 'Partially Approved' : 'Rejected';
  const approverRoleDisplay = data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin';

  // Determine message based on recipient role
  let mainMessage = '';
  if (data.recipientRole === 'employee') {
    mainMessage = `Your leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).`;
  } else {
    mainMessage = `Your team member's leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).`;
  }

  let text = `
Leave Request Status
========================================

Dear ${data.recipientName},

${mainMessage}

LEAVE DETAILS:
----------------------------------------
Employee Name: ${data.employeeName}
Employee ID: ${data.employeeEmpId}
Leave Type: ${leaveTypeDisplay}
Start Date: ${startDateDisplay} (${startTypeDisplay})
End Date: ${endDateDisplay} (${endTypeDisplay})
Number of Days: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
Reason: ${data.reason}
`;

  if (data.comment) {
    text += `${data.status === 'approved' || data.status === 'partially_approved' ? 'Approval' : 'Rejection'} Comment: ${data.comment}\n`;
  }

  text += `Status: ${statusDisplay}
${data.status === 'approved' || data.status === 'partially_approved' ? 'Approved' : 'Rejected'} by: ${data.approverName} (${approverRoleDisplay})

Best regards,
TensorGo

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
  data: LeaveStatusEmailData,
  cc?: string | string[]
): Promise<boolean> => {
  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const statusDisplay = data.status === 'approved' ? 'Approved' : data.status === 'partially_approved' ? 'Partially Approved' : 'Rejected';
  const approverRoleDisplay = data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin';

  // Subject line based on status
  const emailSubject = `Leave Request Status - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;

  const emailHtml = generateLeaveStatusEmailHtml(data);
  const emailText = generateLeaveStatusEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    cc,
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Welcome to TensorGo LMS</h1>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Welcome to TensorGo Leave Management System! Your account has been created successfully. Please find your login credentials below.
              </p>
              
              <!-- Credentials Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Your Login Credentials</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Email:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Temporary Password:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Courier New', monospace; font-weight: 600; letter-spacing: 1px;">${data.temporaryPassword}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Login Button -->
              <div style="margin: 32px 0; text-align: center;">
                <a href="${data.loginUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-family: 'Poppins', sans-serif; font-size: 15px; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.25);">Login to Portal</a>
              </div>
              
              <!-- Security Notice -->
              <div style="background-color: #fffbeb; border: 1px solid #fbbf24; padding: 16px 20px; margin: 28px 0; border-radius: 6px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-weight: 500;">
                  <strong>Security Notice:</strong> Please change your password after your first login for security purposes.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
TensorGo

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
  comment?: string; // Optional comment from the person allocating leaves
  conversionNote?: string; // Optional note for LOP to casual conversions
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Leave Allocation Notification</h1>
            </td>
          </tr>
                <tr>
                  <td style="padding: 0; background-color: #059669;">
                    <div style="padding: 12px 40px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Leaves Allocated</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Additional leaves have been allocated to your account. Please find the allocation details below.
              </p>
              
              <!-- Allocation Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #059669; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #059669; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Allocation Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Leave Type:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Days Allocated:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Previous Balance:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.previousBalance} ${data.previousBalance === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">New Balance:</td>
                    <td style="padding: 12px 0; color: #059669; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.newBalance} ${data.newBalance === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Allocated By:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.allocatedBy}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Allocation Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${allocationDateDisplay}</td>
                  </tr>
                  ${data.comment ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Comment:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.comment}</td>
                  </tr>
                  ` : ''}
                </table>
                ${data.conversionNote ? `
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #d1fae5;">
                  <p style="margin: 0 0 8px 0; color: #059669; font-size: 13px; font-weight: 600;">Conversion Note:</p>
                  <p style="margin: 0; color: #047857; font-size: 13px; line-height: 1.5;">${data.conversionNote}</p>
              </div>
                ` : ''}
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
${data.comment ? `- Comment: ${data.comment}\n` : ''}${data.conversionNote ? `\nConversion Note: ${data.conversionNote}` : ''}

Best regards,
TensorGo

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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Security Notification</h1>
            </td>
          </tr>
                <tr>
                  <td style="padding: 0; background-color: #16a34a;">
                    <div style="padding: 12px 40px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Password Changed</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px 20px; margin: 0 0 28px 0; border-radius: 4px;">
                <p style="margin: 0; color: #15803d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; line-height: 1.5;">
                  Success: Your password has been successfully changed.
                </p>
              </div>
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.userName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                This is a security notification to inform you that your password was successfully changed.
              </p>
              
              <!-- Change Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Change Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Date & Time:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${changeDateDisplay}</td>
                  </tr>
                  ${data.ipAddress ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">IP Address:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.ipAddress}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              <!-- Security Notice -->
              <div style="background-color: #fffbeb; border: 1px solid #fbbf24; padding: 16px 20px; margin: 28px 0; border-radius: 6px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-weight: 500;">
                  <strong>Important:</strong> If you did not make this change, please contact your administrator immediately and change your password again.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated security notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
- Date: ${changeDateDisplay}
${data.ipAddress ? `- IP Address: ${data.ipAddress}\n` : ''}

⚠️ Important: If you did not make this change, please contact your administrator immediately and change your password again.

Best regards,
TensorGo

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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Pending Leave Approvals Reminder</h1>
            </td>
          </tr>
                <tr>
                  <td style="padding: 0; background-color: #f59e0b;">
                    <div style="padding: 12px 40px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Action Required</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                You have <strong style="color: #1f2937; font-weight: 600;">${data.pendingLeaves.length}</strong> pending leave ${data.pendingLeaves.length === 1 ? 'request' : 'requests'} awaiting your approval.
              </p>
              
              <!-- Pending Requests Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #f59e0b; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #92400e; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Pending Leave Requests</h3>
                ${data.pendingLeaves.map((leave, index) => `
                <div style="margin-bottom: ${index < data.pendingLeaves.length - 1 ? '20px' : '0'}; padding-bottom: ${index < data.pendingLeaves.length - 1 ? '20px' : '0'}; border-bottom: ${index < data.pendingLeaves.length - 1 ? '1px solid #e5e7eb' : 'none'};">
                  <p style="margin: 0 0 8px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${leave.employeeName} (${leave.employeeEmpId})</p>
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 13px;">Leave Type: ${formatLeaveType(leave.leaveType)}</p>
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 13px;">Dates: ${formatDateForDisplay(leave.startDate)} to ${formatDateForDisplay(leave.endDate)}</p>
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 13px;">Duration: ${leave.noOfDays} ${leave.noOfDays === 1 ? 'day' : 'days'}</p>
                  <p style="margin: 0; color: #92400e; font-size: 13px; font-weight: 600;">Pending for ${leave.daysPending} ${leave.daysPending === 1 ? 'day' : 'days'}</p>
                </div>
                `).join('')}
              </div>
              
              <!-- Action Notice -->
              <p style="margin: 28px 0 0 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Please review and take appropriate action on these leave requests at your earliest convenience.
              </p>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated daily reminder from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
TensorGo

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
  employeeEmpId?: string;
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Happy Birthday</h1>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <!-- Message -->
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7; text-align: left;">
                Warm wishes to you on your birthday.
              </p>
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7; text-align: left;">
                We value your contributions and commitment, and we appreciate the role you play in supporting our organization's goals. Your professionalism and dedication continue to make a positive impact.
              </p>
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7; text-align: left;">
                May the year ahead bring you continued success, good health, and personal fulfillment.
              </p>
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7; text-align: left;">
                We wish you a pleasant and memorable birthday.
              </p>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7; text-align: left;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated birthday wish from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
Happy Birthday

Dear ${data.employeeName},

Warm wishes to you on your birthday.

We value your contributions and commitment, and we appreciate the role you play in supporting our organization's goals. Your professionalism and dedication continue to make a positive impact.

May the year ahead bring you continued success, good health, and personal fulfillment.

We wish you a pleasant and memorable birthday.

Best regards,
TensorGo

---
This is an automated birthday wish from TensorGo Leave Management System.
Please do not reply to this email.
  `;
};

export const sendBirthdayWishEmail = async (
  birthdayEmployeeEmail: string,
  data: BirthdayWishEmailData,
  ccEmails?: string[]
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Happy Birthday ${data.employeeName}! [Ref: ${uniqueId}]`;
  const emailHtml = generateBirthdayWishEmailHtml(data);
  const emailText = generateBirthdayWishEmailText(data);

  return await sendEmail({
    to: birthdayEmployeeEmail,
    cc: ccEmails && ccEmails.length > 0 ? ccEmails : undefined,
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Leave Carry Forward Notification</h1>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Your leave balances from ${data.previousYear} have been carried forward to ${data.newYear}. Please find the details below.
              </p>
              
              <!-- Carry Forward Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Carry Forward Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Carried Forward:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${carriedForwardItems.join(', ') || 'None'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">New Year (${data.newYear}) Balances:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif;"></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0 8px 20px; color: #6b7280; font-size: 13px;">Casual Leave:</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 13px; font-weight: 600;">${data.newYearBalances.casual} ${data.newYearBalances.casual === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0 8px 20px; color: #6b7280; font-size: 13px;">Sick Leave:</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 13px; font-weight: 600;">${data.newYearBalances.sick} ${data.newYearBalances.sick === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0 8px 20px; color: #6b7280; font-size: 13px;">LOP:</td>
                    <td style="padding: 8px 0; color: #111827; font-size: 13px; font-weight: 600;">${data.newYearBalances.lop} ${data.newYearBalances.lop === 1 ? 'day' : 'days'}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
TensorGo

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
  data: LeaveApplicationEmailData,
  cc?: string | string[]
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  // Use professional urgent subject line
  const emailSubject = `URGENT: Leave Application - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;

  // Generate HTML with professional corporate styling
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
  <title>Urgent Leave Application Notification</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 0; vertical-align: middle;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Leave Application Notification</h1>
                        </td>
                        <td style="padding: 0; vertical-align: middle; text-align: right;">
                          <span style="display: inline-block; background-color: #dc2626; color: #fee2e2; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">URGENT</span>
                        </td>
                      </tr>
                    </table>
            </td>
          </tr>
                <tr>
                  <td style="padding: 0; background-color: #3b82f6;">
                    <div style="padding: 12px 40px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Immediate Action Required</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Urgency Banner -->
              <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px 20px; margin: 0 0 28px 0; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; line-height: 1.5;">
                  This is a leave application that requires your immediate attention and prompt review.
                </p>
              </div>
              
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                An urgent leave application has been submitted by <strong style="color: #1f2937; font-weight: 600;">${data.employeeName}</strong> (Employee ID: <strong style="color: #1f2937; font-weight: 600;">${data.employeeEmpId}</strong>). Please review the details below and take appropriate action at your earliest convenience.
              </p>
              
              <!-- Leave Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Leave Application Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Employee Name:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Leave Type:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Start Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${startDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${startTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">End Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${endDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${endTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Duration:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  ${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Time:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Reason:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.reason}</td>
                  </tr>
                  ${data.doctorNote && data.leaveType !== 'sick' ? `
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Medical Certificate:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.doctorNote}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Application Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${appliedDateDisplay}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Action Required Notice -->
              <div style="background-color: #fffbeb; border: 1px solid #fbbf24; padding: 16px 20px; margin: 28px 0; border-radius: 6px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-weight: 500;">
                  <strong>Action Required:</strong> This urgent leave application requires your prompt review and decision. Please log into the Leave Management System to approve or reject this request.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Thank you for your attention to this matter.
              </p>
              
              <p style="margin: 24px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
URGENT: Leave Application Notification

URGENT REQUEST - IMMEDIATE ACTION REQUIRED

Dear ${data.managerName},

An urgent leave application has been submitted by ${data.employeeName} (Employee ID: ${data.employeeEmpId}). This is an urgent request that requires your immediate attention and prompt review.

LEAVE APPLICATION DETAILS:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}
- Leave Type: ${leaveTypeDisplay}
- Start Date: ${startDateDisplay} (${startTypeDisplay})
- End Date: ${endDateDisplay} (${endTypeDisplay})
- Duration: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `- Time: ${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}\n` : ''}- Reason: ${data.reason}
${data.doctorNote && data.leaveType !== 'sick' ? `- Medical Certificate: ${data.doctorNote}\n` : ''}- Application Date: ${appliedDateDisplay}

ACTION REQUIRED: This urgent leave application requires your prompt review and decision. Please log into the Leave Management System to approve or reject this request.

Thank you for your attention to this matter.

Best regards,
TensorGo

---
This is an automated notification from TensorGo Leave Management System.
Please do not reply to this email.
Reference ID: ${uniqueId}
  `;

  return await sendEmail({
    to: managerEmail,
    cc,
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Employee Details Updated</h1>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <!-- Update Notice -->
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; margin: 0 0 28px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1e40af; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; line-height: 1.5;">
                  Your employee details have been updated
                </p>
              </div>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Your employee profile details have been updated by HR or Super Admin. Please log in to your account to review the changes.
              </p>
              
              <!-- Employee Information Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Employee Information</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Employee Name:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
TensorGo

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

// ============================================================================
// LOP TO CASUAL CONVERSION EMAIL
// ============================================================================

export interface LopToCasualConversionEmailData {
  employeeName: string;
  employeeEmpId: string;
  recipientName: string;
  recipientRole?: 'employee' | 'hr';
  leaveType: string;
  startDate: string;
  startType: string;
  endDate: string;
  endType: string;
  noOfDays: number;
  reason: string;
  converterName: string;
  converterRole: string;
  previousLopBalance: number;
  newLopBalance: number;
  previousCasualBalance: number;
  newCasualBalance: number;
}

/**
 * Generate LOP to Casual conversion email HTML
 */
const generateLopToCasualConversionEmailHtml = (data: LopToCasualConversionEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const converterRoleDisplay = data.converterRole === 'hr' ? 'HR' : 'Super Admin';

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
  <title>Leave Type Converted</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Corporate Branding -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Leave Type Converted</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0; background-color: #9FBA00;">
                    <div style="padding: 12px 40px; text-align: center;">
                      <p style="margin: 0; color: #ffffff; font-size: 13px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">LOP to Casual Conversion</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <!-- Conversion Notice -->
              <div style="background-color: #f0f9e8; border-left: 4px solid #9FBA00; padding: 16px 20px; margin: 0 0 28px 0; border-radius: 4px;">
                <p style="margin: 0; color: #4a5d00; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; line-height: 1.5;">
                  Leave Type Converted from LOP to Casual
                </p>
              </div>
              
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.recipientName},
              </p>
              
              <!-- Introduction -->
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Your leave request has been converted from LOP (Loss of Pay) to Casual Leave by ${data.converterName} (${converterRoleDisplay}).
              </p>
              
              <!-- Leave Details Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Leave Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Employee Name:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Leave Type:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Start Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${startDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${startTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">End Date:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${endDateDisplay} <span style="color: #6b7280; font-weight: 400;">(${endTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Duration:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Reason:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">${data.reason}</td>
                  </tr>
                </table>
              </div>
              
              <!-- Balance Changes Card -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #059669; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #059669; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">Balance Changes</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">LOP Balance:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.previousLopBalance} → ${data.newLopBalance} <span style="color: #059669; font-size: 13px;">(Refunded ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Casual Balance:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.previousCasualBalance} → ${data.newCasualBalance} <span style="color: #dc2626; font-size: 13px;">(Deducted ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})</span></td>
                  </tr>
                </table>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System. Please do not reply to this email.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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
 * Generate LOP to Casual conversion email plain text
 */
const generateLopToCasualConversionEmailText = (data: LopToCasualConversionEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const converterRoleDisplay = data.converterRole === 'hr' ? 'HR' : 'Super Admin';

  let text = `
Leave Type Converted from LOP to Casual

Dear ${data.recipientName},

Your leave request has been converted from LOP (Loss of Pay) to Casual Leave by ${data.converterName} (${converterRoleDisplay}).

Leave Details:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}
- Leave Type: ${leaveTypeDisplay}
- Start Date: ${startDateDisplay} (${startTypeDisplay})
- End Date: ${endDateDisplay} (${endTypeDisplay})
- Number of Days: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
- Reason: ${data.reason}

Balance Changes:
- LOP Balance: ${data.previousLopBalance} → ${data.newLopBalance} (Refunded ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})
- Casual Balance: ${data.previousCasualBalance} → ${data.newCasualBalance} (Deducted ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})

Best regards,
TensorGo

---
This is an automated sdhsgf email from TensorGo Leave Management System.
Please do not reply to this email.
  `;

  return text;
};

/**
 * Send LOP to Casual conversion email
 */
export const sendLopToCasualConversionEmail = async (
  recipientEmail: string,
  data: LopToCasualConversionEmailData,
  cc?: string | string[]
): Promise<boolean> => {
  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Leave Type Converted - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;
  const emailHtml = generateLopToCasualConversionEmailHtml(data);
  const emailText = generateLopToCasualConversionEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    cc,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// HOLIDAY LIST REMINDER EMAIL
// ============================================================================

export interface HolidayListReminderEmailData {
  recipientName: string;
  nextYear: number;
}

const generateHolidayListReminderEmailHtml = (data: HolidayListReminderEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Action Required: Add Holiday List</title>
</head>
<body style="font-family: 'Poppins', sans-serif; background-color: #f5f7fa; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Upcoming Year Holidays</h1>
    </div>
    <div style="padding: 40px;">
      <p style="color: #333; font-size: 16px;">Dear ${data.recipientName},</p>
      <p style="color: #555; line-height: 1.6;">This is an automated reminder to update the holiday list for the upcoming year <strong>${data.nextYear}</strong>.</p>
      <p style="color: #555; line-height: 1.6;">Please ensure the holiday calendar is updated before the start of the new year to avoid any disruptions in leave planning.</p>
      <br>
      <p style="color: #333;">Best regards,<br><strong>TensorGo</strong></p>
    </div>
    <div style="background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #999;">
       Reference ID: ${uniqueId}
    </div>
  </div>
</body>
</html>
  `;
};

const generateHolidayListReminderEmailText = (data: HolidayListReminderEmailData): string => {
  return `
Action Required: Add Holiday List for ${data.nextYear}

Dear ${data.recipientName},

This is an automated reminder to update the holiday list for the upcoming year ${data.nextYear}.
Please ensure the holiday calendar is updated before the start of the new year.

Best regards,
TensorGo
  `;
};

export const sendHolidayListReminderEmail = async (
  recipientEmail: string,
  data: HolidayListReminderEmailData,
  cc?: string | string[]
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return await sendEmail({
    to: recipientEmail,
    cc,
    subject: `Action Required: Add Holiday List for ${data.nextYear} [Ref: ${uniqueId}]`,
    html: generateHolidayListReminderEmailHtml(data),
    text: generateHolidayListReminderEmailText(data),
  });
};

// ============================================================================
// REPORTING MANAGER CHANGE EMAIL
// ============================================================================

export interface ReportingManagerChangeEmailData {
  employeeName: string;
  previousManagerName: string;
  newManagerName: string;
  newManagerEmpId: string;
}

const generateReportingManagerChangeEmailHtml = (data: ReportingManagerChangeEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporting Manager Updated</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 30px 0; background-color: #f5f7fa;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.3px;">Reporting Manager Updated</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 28px 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                This is to inform you that your reporting manager has been updated. This change occurred because your previous manager, <strong>${data.previousManagerName}</strong>, is no longer available as a reporting manager (e.g., transition to notice period or inactive status).
              </p>
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; padding: 28px; margin: 28px 0; border-radius: 6px;">
                <h3 style="margin: 0 0 20px 0; color: #1e3a8a; font-size: 17px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.2px;">New Reporting Manager</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top;">Name:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.newManagerName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #6b7280; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top;">Employee ID:</td>
                    <td style="padding: 12px 0; color: #111827; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600;">${data.newManagerEmpId}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 28px 0 0 0; color: #374151; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                From now on, please direct all your leave requests and professional communications to <strong>${data.newManagerName}</strong>.
              </p>
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1e3a8a;">TensorGo</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated notification from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 11px; font-family: 'Poppins', sans-serif; line-height: 1.5;">
                Reference ID: ${uniqueId}
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

const generateReportingManagerChangeEmailText = (data: ReportingManagerChangeEmailData): string => {
  return `
Reporting Manager Updated

Dear ${data.employeeName},

This is to inform you that your reporting manager has been updated. This change occurred because your previous manager, ${data.previousManagerName}, is no longer available as a reporting manager.

New Reporting Manager:
- Name: ${data.newManagerName}
- Employee ID: ${data.newManagerEmpId}

From now on, please direct all your leave requests and professional communications to your new manager.

Best regards,
TensorGo

---
This is an automated notification from TensorGo Leave Management System.
`;
};

export const sendReportingManagerChangeEmail = async (
  recipientEmail: string,
  data: ReportingManagerChangeEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return await sendEmail({
    to: recipientEmail,
    subject: `Your Reporting Manager has been updated [Ref: ${uniqueId}]`,
    html: generateReportingManagerChangeEmailHtml(data),
    text: generateReportingManagerChangeEmailText(data),
  });
};
