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
      <td style="padding: 20px 0; text-align: center; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Leave Application Notification</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px; text-align: center;">
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
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
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
