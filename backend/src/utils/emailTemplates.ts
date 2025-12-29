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
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #3c6ff2 0%, #2951c8 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">Leave Application Notification</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                Dear ${data.managerName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                A new leave application has been submitted by ${data.employeeName} (${data.employeeEmpId}).
              </p>
              
              <div style="background-color: #f8f9fc; border: 1px solid #d7deec; border-left: 4px solid #3c6ff2; padding: 24px; margin: 24px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 18px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">Leave Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%; font-weight: 500; font-family: 'Poppins', sans-serif;">Employee Name:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Employee ID:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Leave Type:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Start Date:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${startDateDisplay} (${startTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">End Date:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${endDateDisplay} (${endTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Number of Days:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  ${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Time:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Reason:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.reason}</td>
                  </tr>
                  ${data.doctorNote && data.leaveType !== 'sick' ? `
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Doctor Note:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.doctorNote}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">Applied Date:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${appliedDateDisplay}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 20px 0 0 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                Please review and take appropriate action on the leave application.
              </p>
              
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                Best regards,<br>
                <strong style="font-weight: 600;">TensorGo-LMS</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8f9fc; border-top: 1px solid #e6e8f0; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #5a6c7d; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #5a6c7d; font-size: 12px; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">
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
  const statusBgColor = data.status === 'approved' ? '#d1fae5' : '#fee2e2';
  const headerColor = data.status === 'approved' ? '#10b981' : '#ef4444';
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
  <title>Leave Request ${statusDisplay}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, ${headerColor} 0%, ${data.status === 'approved' ? '#059669' : '#dc2626'} 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">Leave Request ${statusDisplay}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 25px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                Dear ${data.recipientName},
              </p>
              
              <!-- Status Banner -->
              <div style="background: linear-gradient(135deg, ${statusBgColor} 0%, ${data.status === 'approved' ? '#a7f3d0' : '#fecaca'} 100%); border-left: 5px solid ${statusColor}; padding: 24px; margin: 24px 0; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                <p style="margin: 0; color: ${statusColor}; font-size: 20px; font-family: 'Poppins', sans-serif; font-weight: 600; margin-bottom: 8px; font-family: 'Poppins', sans-serif;">Leave Request ${statusDisplay}</p>
                <p style="margin: 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; font-family: 'Poppins', sans-serif;">${mainMessage}</p>
              </div>
              
              <!-- Leave Details Card -->
              <div style="background-color: #f8f9fc; border: 1px solid #d7deec; border-left: 4px solid #3c6ff2; padding: 24px; margin: 24px 0; border-radius: 10px;">
                <h3 style="margin: 0 0 20px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">Leave Details</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 38%; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Employee Name:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Employee ID:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Leave Type:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Start Date:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${startDateDisplay} <span style="color: #4b5875; font-weight: 400;">(${startTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">End Date:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${endDateDisplay} <span style="color: #4b5875; font-weight: 400;">(${endTypeDisplay})</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Number of Days:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: 'Poppins', sans-serif;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Reason:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.5; font-family: 'Poppins', sans-serif;">${data.reason}</td>
                  </tr>
                  ${data.comment ? `
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">${data.status === 'approved' ? 'Approval' : 'Rejection'} Comment:</td>
                    <td style="padding: 10px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.5; background-color: #ffffff; padding: 12px; border-radius: 8px; border-left: 3px solid ${statusColor}; font-family: 'Poppins', sans-serif;">${data.comment}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 10px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 500; vertical-align: top; font-family: 'Poppins', sans-serif;">Status:</td>
                    <td style="padding: 10px 0;">
                      <span style="display: inline-block; background-color: ${statusBgColor}; color: ${statusColor}; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-family: 'Poppins', sans-serif;">${statusDisplay}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- Approver Info -->
              <div style="background-color: #e3ebf8; border-left: 4px solid #3c6ff2; padding: 18px 20px; margin: 24px 0; border-radius: 10px;">
                <p style="margin: 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                  <strong style="font-weight: 600;">Approved by:</strong> ${data.approverName} (${approverRoleDisplay})
                </p>
              </div>
              
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 15px; line-height: 1.6; font-family: 'Poppins', sans-serif;">
                Best regards,<br>
                <strong style="font-weight: 600; color: #1f2a3d;">TensorGo-LMS Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8f9fc; border-top: 1px solid #e6e8f0; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #5a6c7d; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6; text-align: left; font-family: 'Poppins', sans-serif;">
                This is an automated email from TensorGo Leave Management System.<br>
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
  
  // Determine message based on recipient role
  let mainMessage = '';
  if (data.recipientRole === 'employee') {
    mainMessage = `Your leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).`;
  } else {
    mainMessage = `Your team member's leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${approverRoleDisplay}).`;
  }

  let text = `
Leave Request ${statusDisplay}
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
    text += `${data.status === 'approved' ? 'Approval' : 'Rejection'} Comment: ${data.comment}\n`;
  }

  text += `Status: ${statusDisplay}
Approved by: ${data.approverName} (${approverRoleDisplay})

Best regards,
TensorGo-LMS Team

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
  
  // Subject line based on status
  const emailSubject = `Leave Request ${statusDisplay} - ${data.employeeName} (${data.employeeEmpId}) [Ref: ${uniqueId}]`;
  
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #3c6ff2 0%, #2951c8 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Welcome to TensorGo LMS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Welcome to TensorGo Leave Management System! Your account has been created successfully.
              </p>
              <div style="background-color: #f8f9fc; border-left: 4px solid #3c6ff2; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif;">Your Login Credentials:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Email:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Temporary Password:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif; font-family: monospace;">${data.temporaryPassword}</td>
                  </tr>
                </table>
              </div>
              <div style="margin: 30px 0;">
                <a href="${data.loginUrl}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #3c6ff2 0%, #2951c8 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-family: 'Poppins', sans-serif; box-shadow: 0 8px 18px rgba(60, 111, 242, 0.28);">Login to Portal</a>
              </div>
              <p style="margin: 20px 0 0 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                <strong>Important:</strong> Please change your password after your first login for security purposes.
              </p>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background-color: #10b981; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Leave Allocation Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Additional leaves have been allocated to your account.
              </p>
              <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #10b981; font-size: 18px; font-family: 'Poppins', sans-serif;">Allocation Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Days Allocated:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Previous Balance:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.previousBalance} ${data.previousBalance === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">New Balance:</td>
                    <td style="padding: 8px 0; color: #10b981; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.newBalance} ${data.newBalance === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Allocated By:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.allocatedBy}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Allocation Date:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${allocationDateDisplay}</td>
                  </tr>
                </table>
                ${data.conversionNote ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #10b981;">
                  <p style="margin: 0; color: #059669; font-size: 13px; font-weight: 600;">ℹ️ Conversion Note:</p>
                  <p style="margin: 5px 0 0 0; color: #047857; font-size: 13px;">${data.conversionNote}</p>
                </div>
                ` : ''}
              </div>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
${data.conversionNote ? `\nConversion Note: ${data.conversionNote}` : ''}

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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background-color: #ef4444; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Security Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 10px;">
                <p style="margin: 0; color: #ef4444; font-size: 32px; font-weight: 700; margin-bottom: 10px;">🔒</p>
                <p style="margin: 0; color: #ef4444; font-size: 20px; font-family: 'Poppins', sans-serif; font-weight: 600;">Your Password Has Been Changed</p>
              </div>
              <p style="margin: 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.userName},
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is a security notification to inform you that your password was successfully changed.
              </p>
              <div style="background-color: #f8f9fc; border-left: 4px solid #3c6ff2; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif;">Change Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Date & Time:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${changeDateDisplay}</td>
                  </tr>
                  ${data.ipAddress ? `
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">IP Address:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.ipAddress}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                  <strong>⚠️ Important:</strong> If you did not make this change, please contact your administrator immediately and change your password again.
                </p>
              </div>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS Security Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated security email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background-color: #f59e0b; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Pending Leave Approvals Reminder</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                You have <strong>${data.pendingLeaves.length}</strong> pending leave ${data.pendingLeaves.length === 1 ? 'request' : 'requests'} awaiting your approval.
              </p>
              <div style="background-color: #f8f9fc; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #f59e0b; font-size: 18px; font-family: 'Poppins', sans-serif;">Pending Leave Requests:</h3>
                ${data.pendingLeaves.map((leave, index) => `
                <div style="margin-bottom: ${index < data.pendingLeaves.length - 1 ? '20px' : '0'}; padding-bottom: ${index < data.pendingLeaves.length - 1 ? '20px' : '0'}; border-bottom: ${index < data.pendingLeaves.length - 1 ? '1px solid #e0e0e0' : 'none'};">
                  <p style="margin: 0 0 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${leave.employeeName} (${leave.employeeEmpId})</p>
                  <p style="margin: 0 0 4px 0; color: #4b5875; font-size: 13px;">Leave Type: ${formatLeaveType(leave.leaveType)}</p>
                  <p style="margin: 0 0 4px 0; color: #4b5875; font-size: 13px;">Dates: ${formatDateForDisplay(leave.startDate)} to ${formatDateForDisplay(leave.endDate)}</p>
                  <p style="margin: 0 0 4px 0; color: #4b5875; font-size: 13px;">Days: ${leave.noOfDays} ${leave.noOfDays === 1 ? 'day' : 'days'}</p>
                  <p style="margin: 0; color: #f59e0b; font-size: 13px; font-weight: 600;">Pending for ${leave.daysPending} ${leave.daysPending === 1 ? 'day' : 'days'}</p>
                </div>
                `).join('')}
              </div>
              <p style="margin: 20px 0 0 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Please review and take appropriate action on these leave requests at your earliest convenience.
              </p>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated daily reminder from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 600;">🎉 Happy Birthday! 🎂</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 18px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-weight: 600;">
                Dear ${data.employeeName},
              </p>
              ${data.birthdayEmployeeName ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 10px;">
                <p style="margin: 0; color: #92400e; font-size: 18px; font-family: 'Poppins', sans-serif; font-weight: 600;">
                  🎉 Today is ${data.birthdayEmployeeName}'s (${data.birthdayEmployeeEmpId}) birthday! 🎂
                </p>
              </div>
              ` : ''}
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                ${data.birthdayEmployeeName ? `Let's join together to wish ${data.birthdayEmployeeName} a wonderful birthday filled with joy, happiness, and success!` : 'Wishing you a wonderful birthday filled with joy, happiness, and success!'}
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                ${data.birthdayEmployeeName ? `May this special day bring ${data.birthdayEmployeeName} countless reasons to smile and celebrate. We hope their year ahead is filled with new opportunities, achievements, and memorable moments.` : 'May this special day bring you countless reasons to smile and celebrate. We hope your year ahead is filled with new opportunities, achievements, and memorable moments.'}
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                ${data.birthdayEmployeeName ? `Thank you ${data.birthdayEmployeeName} for being a valuable part of our team. Have a fantastic day!` : 'Thank you for being a valuable part of our team. Have a fantastic day!'}
              </p>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Warm regards,<br>
                <strong>TensorGo-LMS Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated birthday wish from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #3c6ff2 0%, #2951c8 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Leave Carry Forward Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Your leave balances from ${data.previousYear} have been carried forward to ${data.newYear}.
              </p>
              <div style="background-color: #f8f9fc; border-left: 4px solid #3c6ff2; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif;">Carry Forward Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Carried Forward:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${carriedForwardItems.join(', ') || 'None'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">New Year (${data.newYear}) Balances:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;"></td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0 4px 20px; color: #4b5875; font-size: 13px;">Casual Leave:</td>
                    <td style="padding: 4px 0; color: #1f2a3d; font-size: 13px; font-weight: 600;">${data.newYearBalances.casual} ${data.newYearBalances.casual === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0 4px 20px; color: #4b5875; font-size: 13px;">Sick Leave:</td>
                    <td style="padding: 4px 0; color: #1f2a3d; font-size: 13px; font-weight: 600;">${data.newYearBalances.sick} ${data.newYearBalances.sick === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0 4px 20px; color: #4b5875; font-size: 13px;">LOP:</td>
                    <td style="padding: 4px 0; color: #1f2a3d; font-size: 13px; font-weight: 600;">${data.newYearBalances.lop} ${data.newYearBalances.lop === 1 ? 'day' : 'days'}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <tr>
            <td style="padding: 30px 40px; background-color: #ef4444; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">🚨 URGENT: Leave Application</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #fee2e2; border: 2px solid #ef4444; padding: 15px; margin: 0 0 20px 0; border-radius: 10px;">
                <p style="margin: 0; color: #ef4444; font-size: 18px; font-family: 'Poppins', sans-serif; font-weight: 700;">⚠️ URGENT REQUEST - REQUIRES IMMEDIATE ATTENTION</p>
              </div>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.managerName},
              </p>
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                An <strong>URGENT</strong> leave application has been submitted by ${data.employeeName} (${data.employeeEmpId}).
              </p>
              <div style="background-color: #f8f9fc; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #ef4444; font-size: 18px; font-family: 'Poppins', sans-serif;">Leave Details:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Start Date:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${startDateDisplay} (${startTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">End Date:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${endDateDisplay} (${endTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Number of Days:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  ${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Time:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Reason:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.reason}</td>
                  </tr>
                  ${data.doctorNote && data.leaveType !== 'sick' ? `
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Doctor Note:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.doctorNote}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Applied Date:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${appliedDateDisplay}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 20px 0 0 0; color: #ef4444; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6; font-weight: 600;">
                ⚠️ This is an URGENT request. Please review and take action as soon as possible.
              </p>
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(135deg, #3c6ff2 0%, #2951c8 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Employee Details Updated</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <div style="background-color: #dbeafe; border-left: 4px solid #3c6ff2; padding: 20px; margin: 20px 0; border-radius: 10px;">
                <p style="margin: 0; color: #3c6ff2; font-size: 20px; font-family: 'Poppins', sans-serif; font-weight: 600;">Your employee details have been updated</p>
              </div>
              
              <p style="margin: 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Your employee profile details have been updated by HR or Super Admin. Please log in to your account to review the changes.
              </p>
              
              <div style="background-color: #f8f9fc; border-left: 4px solid #3c6ff2; padding: 20px; margin: 20px 0; border-radius: 10px;">
                <h3 style="margin: 0 0 15px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif;">Employee Information:</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeEmpId}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 30px 0 0 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #4b5875; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
              </p>
              <p style="margin: 8px 0 0 0; color: #4b5875; font-size: 12px;">
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
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 35, 95, 0.12);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f59e0b; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600;">Leave Type Converted</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Dear ${data.recipientName},
              </p>
              
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 10px;">
                <p style="margin: 0; color: #f59e0b; font-size: 20px; font-family: 'Poppins', sans-serif; font-weight: 600;">Leave Type Converted from LOP to Casual</p>
              </div>
              
              <p style="margin: 20px 0; color: #1f2a3d; font-size: 16px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Your leave request has been converted from LOP (Loss of Pay) to Casual Leave by ${data.converterName} (${converterRoleDisplay}).
              </p>
              
              <div style="background-color: #f8f9fc; border-left: 4px solid #3c6ff2; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #3c6ff2; font-size: 18px; font-family: 'Poppins', sans-serif;">Leave Details:</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">Employee Name:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Employee ID:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.employeeEmpId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Leave Type:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${leaveTypeDisplay}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Start Date:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${startDateDisplay} (${startTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">End Date:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${endDateDisplay} (${endTypeDisplay})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Number of Days:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Reason:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif;">${data.reason}</td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 10px; text-align: left;">
                <h3 style="margin: 0 0 15px 0; color: #10b981; font-size: 18px; font-family: 'Poppins', sans-serif;">Balance Changes:</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; width: 40%;">LOP Balance:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.previousLopBalance} → ${data.newLopBalance} (Refunded ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif;">Casual Balance:</td>
                    <td style="padding: 8px 0; color: #1f2a3d; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; font-family: 'Poppins', sans-serif;">${data.previousCasualBalance} → ${data.newCasualBalance} (Deducted ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 20px 0 0 0; color: #4b5875; font-size: 14px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                Best regards,<br>
                TensorGo-LMS
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fc; border-radius: 0 0 12px 12px; text-align: left; border-top: 1px solid #e6e8f0;">
              <p style="margin: 0; color: #8a9ba8; font-size: 12px; line-height: 1.5;">
                This is an automated email from TensorGo Leave Management System.<br>
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
TensorGo-LMS

---
This is an automated email from TensorGo Leave Management System.
Please do not reply to this email.
`;

  return text;
};

/**
 * Send LOP to Casual conversion email
 */
export const sendLopToCasualConversionEmail = async (
  recipientEmail: string,
  data: LopToCasualConversionEmailData
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
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};
