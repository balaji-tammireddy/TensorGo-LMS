import { sendEmail } from './email';
import { logger } from './logger';

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

export interface PasswordResetEmailData {
  userName: string;
  otp: string;
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
  return `${day}-${month}-${year}`;
};

/**
 * Format date and time for display (DD-MM-YYYY HH:MM AM/PM)
 */
const formatDateTimeForDisplay = (dateStr: string): string => {
  const date = new Date(dateStr);

  // Convert UTC date to IST (UTC + 5:30)
  // getTimezoneOffset returns the difference in minutes between UTC and Local time.
  // We want to force IST (+330 minutes from UTC)
  const istDate = new Date(date.getTime() + (330 * 60 * 1000));

  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const year = istDate.getUTCFullYear();

  let hours = istDate.getUTCHours();
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'

  return `${day}-${month}-${year} at ${hours}:${minutes} ${ampm} IST`;
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
 * Common Styles and Wrapper for Outlook compatibility
 */
const generateEmailWrapper = (title: string, content: string, footerRefId: string, previewText: string = ''): string => {
  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${title}</title>
  <style type="text/css">
    /* Reset Styles */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; background-color: #f5f7fa; font-family: Arial, sans-serif; }
    
    /* Client Specific Resets */
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    
    /* Content Styles */
    p { margin: 1em 0; line-height: 1.6; }
    a { color: #2563eb; text-decoration: underline; }
    
    /* NO MOBILE MEDIA QUERIES - FORCE DESKTOP */
  </style>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa;">
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; color: #f5f7fa;">
    ${previewText}
  </div>
  
  <!-- Outer Wrapper -->
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td bgcolor="#f5f7fa" align="center" style="padding: 40px 10px;">
        
        <!-- Main Container - Fixed Width 600px -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="width: 600px;">
          <tr>
            <td bgcolor="#ffffff" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              
              <!-- Header -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td bgcolor="#1e3a8a" align="left" style="padding: 35px 40px; mso-line-height-rule: exactly; font-size: 24px; line-height: 1.5; font-weight: bold; color: #ffffff; font-family: Arial, sans-serif;">
                      ${title}
                  </td>
                </tr>
              </table>
              
              <!-- Body Content -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="padding: 40px; color: #374151; font-size: 16px; font-family: Arial, sans-serif;">
                    ${content}
                  </td>
                </tr>
              </table>
              
              <!-- Footer -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td bgcolor="#f8fafc" align="left" style="padding: 30px 40px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.5; font-family: Arial, sans-serif;">
                    <p style="margin: 0;">This is an automated notification from <strong>TensorGo Intranet</strong>. Please do not reply to this email.</p>
                    <p style="margin: 10px 0 0 0;">Reference ID: ${footerRefId}</p>
                  </td>
                </tr>
              </table>
              
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
 * Generate a consistent details table
 */
const generateDetailsTable = (items: Array<{ label: string; value: any; isBold?: boolean; isHtml?: boolean }>): string => {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-top: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
      <tr>
        <td style="padding: 20px;">
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
            ${items.map(item => `
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 14px; width: 38%; vertical-align: top; font-weight: 500;">${item.label}</td>
                <td style="padding: 10px 0; color: #111827; font-size: 14px; vertical-align: top; font-weight: ${item.isBold ? '700' : '600'};">
                  ${item.isHtml ? item.value : String(item.value).replace(/\n/g, '<br/>')}
                </td>
              </tr>
            `).join('')}
          </table>
        </td>
      </tr>
    </table>
  `;
};

/**
 * Generate password reset OTP email HTML
 */
const generatePasswordResetEmailHtml = (data: PasswordResetEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Dear ${data.userName},</p>
    <p>You have requested to reset your password for your <strong>TensorGo Intranet</strong> account.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; padding: 25px; margin: 30px 0; border-radius: 6px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px; font-weight: 500;">Your OTP Code:</p>
      <p style="margin: 0; color: #1e3a8a; font-size: 32px; letter-spacing: 8px; font-family: 'Courier New', monospace; font-weight: 700;">${data.otp}</p>
    </div>
    
    <p style="margin-top: 30px;">This OTP is valid for <strong>10 minutes</strong>. Please enter this code to reset your password.</p>
    <p>If you did not request a password reset, please ignore this email.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Password Reset Request',
    content,
    uniqueId,
    `Use code ${data.otp} to reset your password`
  );
};

/**
 * Generate password reset OTP email plain text
 */
const generatePasswordResetEmailText = (data: PasswordResetEmailData): string => {
  return `
Password Reset Request

Dear ${data.userName},

You have requested to reset your password for your TensorGo Intranet account.

Your OTP Code: ${data.otp}

This OTP is valid for 10 minutes. Please enter this code to reset your password.

If you did not request a password reset, please ignore this email.

Best Regards,
TensorGo Intranet
  `;
};

/**
 * Send password reset OTP email
 */
export const sendPasswordResetEmail = async (
  recipientEmail: string,
  data: PasswordResetEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Password Reset OTP - TensorGo Intranet [Ref: ${uniqueId}]`;
  const emailHtml = generatePasswordResetEmailHtml(data);
  const emailText = generatePasswordResetEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
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

  const detailsTable = generateDetailsTable([
    { label: 'Employee Name:', value: data.employeeName, isBold: true },
    { label: 'Employee ID:', value: data.employeeEmpId, isBold: true },
    { label: 'Leave Type:', value: leaveTypeDisplay, isBold: true },
    {
      label: 'Start Date:',
      value: `${startDateDisplay} <span style="color: #64748b; font-weight: normal;">(${startTypeDisplay})</span>`,
      isHtml: true
    },
    {
      label: 'End Date:',
      value: `${endDateDisplay} <span style="color: #64748b; font-weight: normal;">(${endTypeDisplay})</span>`,
      isHtml: true
    },
    { label: 'Duration:', value: `${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}` },
    ...(data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? [
      { label: 'Time:', value: `${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}` }
    ] : []),
    { label: 'Reason:', value: data.reason },
    ...(data.doctorNote && data.leaveType !== 'sick' ? [
      { label: 'Medical Certificate:', value: data.doctorNote }
    ] : []),
    { label: 'Application Date:', value: appliedDateDisplay }
  ]);

  const content = `
    <p>Dear ${data.managerName},</p>
    <p>A new leave application has been submitted by <strong>${data.employeeName}</strong> (Employee ID: <strong>${data.employeeEmpId}</strong>). Please review the details below and take appropriate action.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Leave Application Details</h3>
    ${detailsTable}
    <p style="margin-top: 30px;">Please review and take appropriate action on this leave application at your earliest convenience.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Leave Application Notification',
    content,
    uniqueId,
    `New leave application from ${data.employeeName}`
  );
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

Best Regards,
TensorGo Intranet

---
This is an automated email from TensorGo Intranet.
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
  approverEmpId: string;
  approverRole: string;
  comment?: string | null;
  status: 'approved' | 'partially_approved' | 'rejected';
  approvedStartDate?: string;
  approvedEndDate?: string;
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
  const approverRoleDisplay = data.approverRole === 'manager' ? 'Manager' : data.approverRole === 'hr' ? 'HR' : 'Super Admin';

  // Determine message based on recipient role
  let mainMessage = '';
  if (data.recipientRole === 'employee') {
    mainMessage = `Your leave request has been <strong>${statusDisplay.toLowerCase()}</strong> by ${data.approverName} (${data.approverEmpId}).`;
  } else {
    mainMessage = `Your team member's leave request has been <strong>${statusDisplay.toLowerCase()}</strong> by ${data.approverName} (${data.approverEmpId}).`;
  }

  // Add unique identifier to prevent email threading
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const statusColor = data.status === 'approved' ? '#10b981' : data.status === 'partially_approved' ? '#f59e0b' : '#dc2626';

  const detailsTable = generateDetailsTable([
    { label: 'Employee Name:', value: data.employeeName, isBold: true },
    { label: 'Employee ID:', value: data.employeeEmpId, isBold: true },
    { label: 'Leave Type:', value: leaveTypeDisplay, isBold: true },
    {
      label: 'Start Date:',
      value: `${startDateDisplay} <span style="color: #64748b; font-weight: normal;">(${startTypeDisplay})</span>`,
      isHtml: true
    },
    {
      label: 'End Date:',
      value: `${endDateDisplay} <span style="color: #64748b; font-weight: normal;">(${endTypeDisplay})</span>`,
      isHtml: true
    },
    { label: 'Duration:', value: `${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}` },
    { label: 'Reason:', value: data.reason },
    ...(data.status === 'partially_approved' && data.approvedStartDate && data.approvedEndDate ? [
      {
        label: 'Approved From:',
        value: formatDateForDisplay(data.approvedStartDate),
        isBold: true
      },
      {
        label: 'Approved To:',
        value: formatDateForDisplay(data.approvedEndDate),
        isBold: true
      }
    ] : []),
    ...(data.comment ? [
      { label: `${data.status === 'rejected' ? 'Rejection' : 'Approval'} Comment:`, value: data.comment }
    ] : []),
    {
      label: 'Status:',
      value: `<span style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${statusDisplay}</span>`,
      isHtml: true
    }
  ]);

  const content = `
    <p>Dear ${data.recipientName},</p>
    <p>${mainMessage}</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Leave Request Details</h3>
    ${detailsTable}
    <div style="margin-top: 30px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #1e40af;">
        <strong>${data.status === 'approved' ? 'Approved' : data.status === 'partially_approved' ? 'Partially Approved' : 'Rejected'} by:</strong> ${data.approverName} (${data.approverEmpId})
      </p>
    </div>
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Leave Request Status',
    content,
    uniqueId,
    `Your leave request has been ${statusDisplay.toLowerCase()}`
  );
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
    mainMessage = `Your leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${data.approverEmpId}).`;
  } else {
    mainMessage = `Your team member's leave request has been ${statusDisplay.toLowerCase()} by ${data.approverName} (${data.approverEmpId}).`;
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
${data.status === 'approved' || data.status === 'partially_approved' ? 'Approved' : 'Rejected'} by: ${data.approverName} (${data.approverEmpId})

Best Regards,
TensorGo Intranet

---
This is an automated email from TensorGo Intranet.
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
  role: string;
  temporaryPassword: string;
  loginUrl: string;
}

/**
 * Generate new employee credentials email HTML
 */
const generateNewEmployeeCredentialsEmailHtml = (data: NewEmployeeCredentialsEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const detailsTable = generateDetailsTable([
    { label: 'Employee ID:', value: data.employeeEmpId, isBold: true },
    { label: 'Official Email:', value: data.email, isBold: true },
    { label: 'Role:', value: data.role, isBold: true },
    {
      label: 'Temporary Password:',
      value: `<code style="font-family: Courier, monospace; letter-spacing: 1px; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${data.temporaryPassword}</code>`,
      isHtml: true,
      isBold: true
    }
  ]);

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>Welcome to <strong>TensorGo Intranet!</strong> Your account has been created successfully. Please find your login credentials below.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Your Login Credentials</h3>
    ${detailsTable}
    <div style="margin: 40px 0; text-align: center;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${data.loginUrl}" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="10%" stroke="f" fillcolor="#1e3a8a">
        <w:anchorlock/>
        <center>
      <![endif]-->
      <a href="${data.loginUrl}" style="background-color:#1e3a8a;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:50px;text-align:center;text-decoration:none;width:200px;-webkit-text-size-adjust:none;border-radius:6px;">Login to Portal</a>
      <!--[if mso]>
        </center>
      </v:roundrect>
      <![endif]-->
    </div>
    <div style="background-color: #fffbeb; border: 1px solid #fbbf24; padding: 15px; border-radius: 4px;">
      <p style="margin: 0; color: #92400e; font-size: 14px;">
        <strong>Security Notice:</strong> Please change your password after your first login for security purposes.
      </p>
    </div>
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Welcome to TensorGo Intranet',
    content,
    uniqueId,
    'Your account has been created successfully'
  );
};

const generateNewEmployeeCredentialsEmailText = (data: NewEmployeeCredentialsEmailData): string => {
  return `
Welcome to TensorGo Intranet

Dear ${data.employeeName},

Welcome to TensorGo Intranet! Your account has been created successfully.

Your Login Credentials:
- Employee ID: ${data.employeeEmpId}
- Email: ${data.email}
- Role: ${data.role}
- Temporary Password: ${data.temporaryPassword}

Login URL: ${data.loginUrl}

Important: Please change your password after your first login for security purposes.

Best Regards,
TensorGo Intranet

---
This is an automated email from TensorGo Intranet.
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

  const emailSubject = `Welcome to TensorGo Intranet - Your Login Credentials [Ref: ${uniqueId}]`;
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
  allocatedByEmpId?: string; // ID of the person allocating leaves
  allocationDate: string;
  comment?: string; // Optional comment from the person allocating leaves
  conversionNote?: string; // Optional note for LOP to casual conversions
}

/**
 * Generate leave allocation email HTML
 */
const generateLeaveAllocationEmailHtml = (data: LeaveAllocationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const allocationDateDisplay = formatDateForDisplay(data.allocationDate);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const detailsTable = generateDetailsTable([
    { label: 'Leave Type:', value: leaveTypeDisplay, isBold: true },
    { label: 'Days Allocated:', value: `${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}`, isBold: true },
    { label: 'Previous Balance:', value: `${data.previousBalance} ${data.previousBalance === 1 ? 'day' : 'days'}` },
    {
      label: 'New Balance:',
      value: `<span style="color: #111827; font-weight: bold;">${data.newBalance} ${data.newBalance === 1 ? 'day' : 'days'}</span>`,
      isHtml: true,
      isBold: true
    },
    { label: 'Allocated By:', value: data.allocatedByEmpId ? `${data.allocatedBy} (${data.allocatedByEmpId})` : data.allocatedBy },
    { label: 'Allocation Date:', value: allocationDateDisplay },
    ...(data.comment ? [{ label: 'Comment:', value: data.comment }] : [])
  ]);

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>Additional leaves have been allocated to your account. Please find the allocation details below.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Allocation Details</h3>
    ${detailsTable}
    ${data.conversionNote ? `
      <div style="margin-top: 30px; padding: 15px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px;">
        <p style="margin: 0; color: #166534; font-size: 14px;"><strong>Conversion Note:</strong> ${data.conversionNote}</p>
      </div>
    ` : ''}
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Leave Allocation Notification',
    content,
    uniqueId,
    `${data.allocatedDays} days of ${leaveTypeDisplay} allocated`
  );
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

Best Regards,
TensorGo Intranet

---
This is an automated email from TensorGo Intranet.
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

/**
 * Generate password change security email HTML
 */
const generatePasswordChangeSecurityEmailHtml = (data: PasswordChangeSecurityEmailData): string => {
  const changeDateDisplay = formatDateTimeForDisplay(data.changeTimestamp);
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
                  <td style="padding: 32px 40px; background-color: #1e3a8a; text-align: left;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-family: 'Poppins', sans-serif; font-weight: 600; letter-spacing: 0.5px;">Password Changed</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px 20px; margin: 0 0 28px 0; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; font-family: 'Poppins', sans-serif; font-weight: 600; line-height: 1.5;">
                  Security Alert: Your password has been successfully changed.
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
                  <strong>Important:</strong> If you did not make this change, please contact your HR immediately and change your password again.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="margin: 32px 0 0 0; color: #1f2937; font-size: 15px; font-family: 'Poppins', sans-serif; line-height: 1.7;">
                Best Regards,<br/><strong>TensorGo Intranet</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; font-family: 'Poppins', sans-serif; line-height: 1.6;">
                This is an automated security notification from TensorGo Intranet. Please do not reply to this email.
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
  const changeDateDisplay = formatDateTimeForDisplay(data.changeTimestamp);

  return `
Security Notification - Password Changed

Dear ${data.userName},

This is a security notification to inform you that your password was successfully changed.

Change Details:
- Date: ${changeDateDisplay}
${data.ipAddress ? `- IP Address: ${data.ipAddress}\n` : ''}

⚠️ Important: If you did not make this change, please contact your HR immediately and change your password again.

Best Regards,
TensorGo Intranet

---
This is an automated security email from TensorGo Intranet.
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

/**
 * Generate pending leave reminder email HTML
 */
const generatePendingLeaveReminderEmailHtml = (data: PendingLeaveReminderEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
      <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">
        Action Required: You have pending leave requests awaiting review.
      </p>
    </div>
    <p>Dear ${data.managerName},</p>
    <p>This is a reminder that there are leave applications pending your approval.</p>
    <p style="margin-top: 30px;">Please login to the portal to check and take action on these requests.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Pending Leave Approvals Reminder',
    content,
    uniqueId,
    `You have pending leave requests`
  );
};

const generatePendingLeaveReminderEmailText = (data: PendingLeaveReminderEmailData): string => {
  return `
Pending Leave Approvals Reminder

Dear ${data.managerName},

This is a reminder that there are leave applications pending your approval.

Please login to the portal to check and take action on these requests.

Best Regards,
TensorGo Intranet

---
This is an automated daily reminder from TensorGo Intranet.
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

  const emailSubject = `Reminder: Pending Leave Requests Awaiting Approval [Ref: ${uniqueId}]`;
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
}

/**
 * Generate birthday wish email HTML
 */
const generateBirthdayWishEmailHtml = (data: BirthdayWishEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <div style="text-align: left; padding: 20px 0;">
      <p style="font-size: 16px; line-height: 1.7; color: #374151; margin-bottom: 20px;">
        On behalf of Team <strong>TensorGo Intranet</strong>, we extend our best wishes to you on your birthday and for the year ahead.
      </p>
      <p style="font-size: 16px; line-height: 1.7; color: #374151; margin-bottom: 20px;">
        We appreciate your continued commitment and contributions to the organization. May the coming year bring you sustained success, professional growth, and good health.
      </p>
      <p style="font-size: 16px; line-height: 1.7; color: #374151; margin-bottom: 20px;">
        We wish you a pleasant birthday and a successful year ahead.
      </p>
    </div>
    <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 30px; text-align: left;">
      <p style="margin: 0; font-size: 16px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
    </div>
  `;

  return generateEmailWrapper(
    `HAPPY BIRTHDAY ${data.employeeName.toUpperCase()}`,
    content,
    uniqueId,
    `Wishing you a very happy birthday, ${data.employeeName}!`
  );
};

const generateBirthdayWishEmailText = (data: BirthdayWishEmailData): string => {
  return `
HAPPY BIRTHDAY ${data.employeeName.toUpperCase()}

Dear ${data.employeeName},

On behalf of Team TensorGo Intranet, we extend our best wishes to you on your birthday and for the year ahead.

We appreciate your continued commitment and contributions to the organization. May the coming year bring you sustained success, professional growth, and good health.

We wish you a pleasant birthday and a successful year ahead.

Best Regards,
TensorGo Intranet

---
This is an automated birthday wish from TensorGo Intranet.
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

  const carriedForwardRows = [];
  if (data.carriedForwardLeaves.casual) {
    carriedForwardRows.push({ label: 'Casual Leave Carried:', value: `${data.carriedForwardLeaves.casual} days` });
  }
  if (data.carriedForwardLeaves.sick) {
    carriedForwardRows.push({ label: 'Sick Leave Carried:', value: `${data.carriedForwardLeaves.sick} days` });
  }
  if (data.carriedForwardLeaves.lop) {
    carriedForwardRows.push({ label: 'LOP Carried:', value: `${data.carriedForwardLeaves.lop} days` });
  }

  const detailsTable = generateDetailsTable([
    { label: 'Previous Year:', value: data.previousYear, isBold: true },
    { label: 'New Year:', value: data.newYear, isBold: true },
    ...carriedForwardRows,
    { label: 'Current Casual Bal:', value: `${data.newYearBalances.casual} days`, isBold: true },
    { label: 'Current Sick Bal:', value: `${data.newYearBalances.sick} days`, isBold: true },
    { label: 'Current LOP Bal:', value: `${data.newYearBalances.lop} days`, isBold: true },
  ]);

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>Your leave balances from <strong>${data.previousYear}</strong> have been carried forward to the new year <strong>${data.newYear}</strong>.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Carry Forward Details</h3>
    ${detailsTable}
    <div style="margin-top: 30px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
      <p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>Note:</strong> Carry-forward is subject to the company's leave policy limits.</p>
    </div>
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Leave Carry Forward Notification',
    content,
    uniqueId,
    `Leaves from ${data.previousYear} carried forward to ${data.newYear}`
  );
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

Best Regards,
TensorGo Intranet

---
This is an automated email from TensorGo Intranet.
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
/**
 * Generate urgent leave application email HTML
 */
const generateUrgentLeaveApplicationEmailHtml = (data: LeaveApplicationEmailData, uniqueId: string): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const appliedDateDisplay = formatDateForDisplay(data.appliedDate);

  const detailsTable = generateDetailsTable([
    { label: 'Employee Name:', value: data.employeeName, isBold: true },
    { label: 'Employee ID:', value: data.employeeEmpId, isBold: true },
    { label: 'Leave Type:', value: leaveTypeDisplay, isBold: true },
    {
      label: 'Start Date:',
      value: `${startDateDisplay} <span style="color: #64748b; font-weight: normal;">(${startTypeDisplay})</span>`,
      isHtml: true
    },
    {
      label: 'End Date:',
      value: `${endDateDisplay} <span style="color: #64748b; font-weight: normal;">(${endTypeDisplay})</span>`,
      isHtml: true
    },
    { label: 'Duration:', value: `${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}` },
    ...(data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? [
      { label: 'Time:', value: `${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}` }
    ] : []),
    { label: 'Reason:', value: data.reason },
    ...(data.doctorNote && data.leaveType !== 'sick' ? [
      { label: 'Medical Certificate:', value: data.doctorNote }
    ] : []),
    { label: 'Application Date:', value: appliedDateDisplay }
  ]);

  const content = `
    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
      <p style="margin: 0; color: #991b1b; font-weight: bold; font-size: 14px;">
        URGENT: This leave application requires your immediate attention and prompt review.
      </p>
    </div>
    <p>Dear ${data.managerName},</p>
    <p>An urgent leave application has been submitted by <strong>${data.employeeName}</strong> (Employee ID: <strong>${data.employeeEmpId}</strong>). Please review the details below and take appropriate action at your earliest convenience.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Leave Application Details</h3>
    ${detailsTable}
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Urgent Leave Application',
    content,
    uniqueId,
    `IMPORTANT: Urgent leave application from ${data.employeeName}`
  );
};

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
  const emailHtml = generateUrgentLeaveApplicationEmailHtml(data, uniqueId);

  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const appliedDateDisplay = formatDateForDisplay(data.appliedDate);

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

ACTION REQUIRED: This urgent leave application requires your prompt review and decision. Please log into the TensorGo Intranet to approve or reject this request.

Thank you for your attention to this matter.

Best Regards,
TensorGo Intranet

---
This is an automated notification from TensorGo Intranet.
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
  updatedBy: string;
}

/**
 * Generate employee details update email HTML
 */
const generateEmployeeDetailsUpdateEmailHtml = (data: EmployeeDetailsUpdateEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>This is to inform you that your profile details have been updated in the <strong>TensorGo Intranet</strong> by <strong>${data.updatedBy}</strong>.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0; color: #475569; line-height: 1.6;">
        For security purposes, we do not include specific changes in this email. Please log in to the portal to review your updated profiles.
      </p>
    </div>

    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Profile Update Notification',
    content,
    uniqueId,
    'Your profile details have been updated'
  );
};

/**
 * Generate employee details update email plain text
 */
const generateEmployeeDetailsUpdateEmailText = (data: EmployeeDetailsUpdateEmailData): string => {
  return `
Profile Update Notification

Dear ${data.employeeName},

This is to inform you that your profile details have been updated in the TensorGo Intranet by ${data.updatedBy}.

For security purposes, we do not include specific changes in this email. Please log in to the portal to review your updated profiles.


Best Regards,
TensorGo Intranet
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
  converterEmpId: string; // ID of the person converting
  converterRole: string;
  previousLopBalance: number;
  newLopBalance: number;
  previousCasualBalance: number;
  newCasualBalance: number;
  conversionDate: string;
  comment?: string;
}

/**
 * Generate LOP to Casual conversion email HTML
 */
const generateLopToCasualConversionEmailHtml = (data: LopToCasualConversionEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const detailsTable = generateDetailsTable([
    { label: 'Dates Range:', value: `${formatDateForDisplay(data.startDate)} to ${formatDateForDisplay(data.endDate)}`, isBold: true },
    { label: 'Days Converted:', value: `${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}`, isBold: true },
    { label: 'Conversion Date:', value: formatDateForDisplay(data.conversionDate) },
    { label: 'Converted By:', value: `${data.converterName} (${data.converterEmpId})` },
    ...(data.comment ? [{ label: 'Comment:', value: data.comment }] : [])
  ]);

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>Your previous <strong>Loss of Pay (LOP)</strong> leave recorded for the following dates has been converted to <strong>Casual Leave</strong>. This adjustment has been processed successfully.</p>
    
    <h3 style="margin: 30px 0 10px 0; color: #1e3a8a; font-size: 18px; font-weight: 600;">Conversion Details</h3>
    ${detailsTable}
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #059669; padding: 24px; margin: 28px 0; border-radius: 6px;">
      <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 17px; font-weight: 600;">Balance Changes</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 38%;">LOP Balance:</td>
          <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">
            ${data.previousLopBalance} → ${data.newLopBalance} 
            <span style="color: #059669; font-weight: normal; font-size: 13px;">(Refunded ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #6b7280; font-size: 14px;">Casual Balance:</td>
          <td style="padding: 10px 0; color: #111827; font-size: 14px; font-weight: 600;">
            ${data.previousCasualBalance} → ${data.newCasualBalance}
            <span style="color: #dc2626; font-weight: normal; font-size: 13px;">(Deducted ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})</span>
          </td>
        </tr>
      </table>
    </div>
    
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Leave Type Conversion',
    content,
    uniqueId,
    'Your LOP leave has been converted to Casual Leave'
  );
};


/**
 * Generate LOP to Casual conversion email plain text
 */
const generateLopToCasualConversionEmailText = (data: LopToCasualConversionEmailData): string => {
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const converterRoleDisplay = data.converterRole === 'hr' ? 'HR' : 'Super Admin';

  return `
Leave Type Converted - LOP to Casual

Dear ${data.employeeName},

Your previous Loss of Pay (LOP) leave recorded for the following dates has been converted to Casual Leave.

Conversion Details:
- Dates Range: ${startDateDisplay} to ${endDateDisplay}
- Days Converted: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
- Conversion Date: ${formatDateForDisplay(data.conversionDate)}
- Converted By: ${data.converterName} (${data.converterEmpId})
${data.comment ? `- Comment: ${data.comment}` : ''}

Balance Changes:
- LOP Balance: ${data.previousLopBalance} → ${data.newLopBalance} (Refunded ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})
- Casual Balance: ${data.previousCasualBalance} → ${data.newCasualBalance} (Deducted ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'})

Best Regards,
TensorGo Intranet
  `;
};

/**
 * Send LOP to Casual conversion email
 */
export const sendLopToCasualConversionEmail = async (
  recipientEmail: string,
  data: LopToCasualConversionEmailData,
  cc?: string | string[]
): Promise<boolean> => {
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

/**
 * Generate holiday list reminder email HTML
 */
const generateHolidayListReminderEmailHtml = (data: HolidayListReminderEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Dear ${data.recipientName},</p>
    <p>This is an automated reminder to update the holiday list for the upcoming year <strong>${data.nextYear}</strong>.</p>
    <p>Please ensure the holiday calendar is updated before the start of the new year to avoid any disruptions in leave planning.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Upcoming Year Holiday List Reminder',
    content,
    uniqueId,
    `Action Required: Add Holiday List for ${data.nextYear}`
  );
};

/**
 * Generate holiday list reminder email plain text
 */
const generateHolidayListReminderEmailText = (data: HolidayListReminderEmailData): string => {
  return `
Action Required: Add Holiday List for ${data.nextYear}

Dear ${data.recipientName},

This is an automated reminder to update the holiday list for the upcoming year ${data.nextYear}.
Please ensure the holiday calendar is updated before the start of the new year.

Best Regards,
TensorGo Intranet
  `;
};

/**
 * Send holiday list reminder email
 */
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

/**
 * Generate reporting manager change email HTML
 */
const generateReportingManagerChangeEmailHtml = (data: ReportingManagerChangeEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const detailsTable = generateDetailsTable([
    { label: 'New Manager Name:', value: data.newManagerName, isBold: true },
    { label: 'New Manager ID:', value: data.newManagerEmpId, isBold: true }
  ]);

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>This is to inform you that your reporting manager has been updated in the <strong>TensorGo Intranet</strong>.</p>

    
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">New Reporting Manager Details</h3>
    ${detailsTable}
    
    <p style="margin-top: 30px;">From now on, please direct all your leave requests and professional communications to <strong>${data.newManagerName}</strong>.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Reporting Manager Updated',
    content,
    uniqueId,
    'Your reporting manager has been updated'
  );
};

/**
 * Generate reporting manager change email plain text
 */
const generateReportingManagerChangeEmailText = (data: ReportingManagerChangeEmailData): string => {
  return `
Reporting Manager Updated

Dear ${data.employeeName},

This is to inform you that your reporting manager has been updated.

New Reporting Manager:
- Name: ${data.newManagerName}
- Employee ID: ${data.newManagerEmpId}

From now on, please direct all your leave requests and professional communications to your new manager.

Best Regards,
TensorGo Intranet
  `;
};

/**
 * Send reporting manager change email
 */
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

// ============================================================================
// ROLE CHANGE NOTIFICATION EMAIL
// ============================================================================

export interface RoleChangeEmailData {
  employeeName: string;
  newRole: string;
  updatedBy: string;
}

export const sendRoleChangeEmail = async (recipientEmail: string, data: RoleChangeEmailData): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>This is to inform you that your role in the <strong>TensorGo Intranet</strong> has been updated.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 20px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0; font-size: 16px; color: #1e3a8a;"><strong>New Role:</strong> ${data.newRole.toUpperCase()}</p>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #64748b;">Updated by: ${data.updatedBy}</p>
    </div>
    <p>If you have any questions regarding this change, please contact your reporting manager or the HR department.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return await sendEmail({
    to: recipientEmail,
    subject: `Your Role has been updated [Ref: ${uniqueId}]`,
    html: generateEmailWrapper('Role Update Notification', content, uniqueId, `Your role has been updated to ${data.newRole}`),
    text: `
Role Update Notification

Dear ${data.employeeName},

This is to inform you that your role has been updated to ${data.newRole.toUpperCase()} by ${data.updatedBy}.

If you have any questions, please contact HR.

Best Regards,
TensorGo Intranet
    `
  });
};

// ============================================================================
// STATUS CHANGE NOTIFICATION EMAIL
// ============================================================================

export interface StatusChangeEmailData {
  employeeName: string;
  newStatus: string;
  updatedBy: string;
}

export const sendStatusChangeEmail = async (recipientEmail: string, data: StatusChangeEmailData): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Dear ${data.employeeName},</p>
    <p>This is to inform you that your employment status in the <strong>TensorGo Intranet</strong> has been updated.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 20px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0; font-size: 16px; color: #1e3a8a;"><strong>New Status:</strong> ${data.newStatus.toUpperCase()}</p>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #64748b;">Updated by: ${data.updatedBy}</p>
    </div>
    <p>If you have any questions regarding this change, please contact the HR department.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return await sendEmail({
    to: recipientEmail,
    subject: `Your Employment Status has been updated [Ref: ${uniqueId}]`,
    html: generateEmailWrapper('Status Update Notification', content, uniqueId, `Your status has been updated to ${data.newStatus}`),
    text: `
Status Update Notification

Dear ${data.employeeName},

This is to inform you that your employment status has been updated to ${data.newStatus.toUpperCase()} by ${data.updatedBy}.

If you have any questions, please contact HR.

Best Regards,
TensorGo Intranet
    `
  });
};
