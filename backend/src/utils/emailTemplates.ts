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
                    <p style="margin: 0;">This is an auto-generated email from the <strong>TensorGo Intranet</strong>. Please do not reply to this message.</p>
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
    <p>Hello ${data.userName},</p>
    <p>We received a request to reset your TensorGo Intranet password.</p>
    <p>Please use the One-Time Password (OTP) below to proceed:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; padding: 25px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px; font-weight: 500;">OTP Code:</p>
      <p style="margin: 0; color: #1e3a8a; font-size: 32px; letter-spacing: 8px; font-family: 'Courier New', monospace; font-weight: 700;">${data.otp}</p>
      <p style="margin: 10px 0 0 0; color: #64748b; font-size: 14px;">Valid for: 10 Minutes</p>
    </div>
    
    <p>If you did not request this password reset, please ignore this email or report it immediately to the HR Team.</p>
    <p>For security reasons, do not share this OTP with anyone.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Password Reset OTP – TensorGo Intranet',
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
Password Reset OTP – TensorGo Intranet

Hello ${data.userName},

We received a request to reset your TensorGo Intranet password.

Please use the One-Time Password (OTP) below to proceed:

OTP: ${data.otp}
Valid for: 10 Minutes

If you did not request this password reset, please ignore this email or report it immediately to the HR Team.

For security reasons, do not share this OTP with anyone.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
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

  const emailSubject = `Password Reset OTP – TensorGo Intranet [Ref: ${uniqueId}]`;
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
    <p>Hello ${data.managerName},</p>
    <p>A new leave application has been submitted by <strong>${data.employeeName}</strong> (Employee ID: <strong>${data.employeeEmpId}</strong>). Kindly review the request and take appropriate action.</p>
    
    <h3 style="margin: 30px 0 10px 0; font-size: 18px; color: #1e3a8a;">Leave Application Details</h3>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px;">
      ${detailsTable}
    </div>

    <p style="margin-top: 30px;">Please log in to the TensorGo Intranet to review and approve/reject this request at your earliest convenience.</p>
    <p>For any clarification, please contact the HR Team.</p>

    <p>Regards,<br/>TensorGo HR Team</p>
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
Leave Application Submitted – Action Required

Hello ${data.managerName},

A new leave application has been submitted by ${data.employeeName} (Employee ID: ${data.employeeEmpId}). Kindly review the request and take appropriate action.

Leave Application Details
• Employee Name: ${data.employeeName}
• Employee ID: ${data.employeeEmpId}
• Leave Type: ${leaveTypeDisplay}
• Start Date: ${startDateDisplay} (${startTypeDisplay})
• End Date: ${endDateDisplay} (${endTypeDisplay})
• Duration: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
`;

  if (data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd) {
    text += `• Time: ${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}\n`;
  }

  text += `• Reason: ${data.reason}\n`;

  // Exclude doctor note for sick leaves (privacy)
  if (data.doctorNote && data.leaveType !== 'sick') {
    text += `• Medical Certificate: ${data.doctorNote}\n`;
  }

  text += `• Application Date: ${appliedDateDisplay}

Please log in to the TensorGo Intranet to review and approve/reject this request at your earliest convenience.
For any clarification, please contact the HR Team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
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

  const emailSubject = `Leave Application Submitted – Action Required [Ref: ${uniqueId}]`;
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

  let content = '';

  if (data.status === 'approved') {
    content = `
    <p>Hello ${data.employeeName},</p>
    <p>Your leave request has been approved by <strong>${data.approverName}</strong>.</p>
    
    <h3 style="margin: 30px 0 10px 0; font-size: 18px; color: #1e3a8a;">Leave Request Details</h3>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px;">
      ${detailsTable}
    </div>
    
    <div style="margin-top: 20px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
       <p style="margin: 0; font-size: 14px; color: #1e40af;">
        <strong>Approved by:</strong> ${data.approverName} (${data.approverEmpId})
      </p>
    </div>

    <p style="margin-top: 30px;">Please ensure a proper handover of responsibilities, if applicable, before you leave.</p>
    <p>For any clarification, contact the HR team.</p>

    <p>Regards,<br/>TensorGo HR Team</p>
  `;

    return generateEmailWrapper(
      'Leave Request Status',
      content,
      uniqueId,
      `Your leave request has been approved`
    );

  } else {
    // Rejected
    content = `
    <p>Hello ${data.employeeName},</p>
    <p>Your leave request has been reviewed and not approved by <strong>${data.approverName}</strong>.</p>
    
    <h3 style="margin: 30px 0 10px 0; font-size: 18px; color: #1e3a8a;">Leave Request Details</h3>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px;">
      ${detailsTable}
    </div>
    
    <div style="margin-top: 20px; padding: 15px; background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px;">
       <p style="margin: 0; font-size: 14px; color: #991b1b;">
        <strong>Rejected by:</strong> ${data.approverName} (${data.approverEmpId})
      </p>
    </div>

    <p style="margin-top: 30px;">Please log in to the portal to review the details.</p>
    <p>For any clarification, contact your reporting manager or the HR team.</p>

    <p>Regards,<br/>TensorGo HR Team</p>
  `;

    return generateEmailWrapper(
      'Leave Request Status',
      content,
      uniqueId,
      `Your leave request has been rejected`
    );
  }
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

  let text = '';

  if (data.status === 'approved') {
    text = `
Leave Request Approved – Confirmation

Hello ${data.employeeName},

Your leave request has been approved by ${data.approverName}.

Leave Request Details
• Employee Name: ${data.employeeName}
• Employee ID: ${data.employeeEmpId}
• Leave Type: ${leaveTypeDisplay}
• Start Date: ${startDateDisplay} (${startTypeDisplay})
• End Date: ${endDateDisplay} (${endTypeDisplay})
• Duration: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
• Reason: ${data.reason}
${data.comment ? `• Approval Comment: ${data.comment}\n` : ''}• Status: APPROVED

Please ensure a proper handover of responsibilities, if applicable, before you leave.
For any clarification, contact the HR team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
    `;
  } else {
    // Rejected or Partially Approved (treating partial same as rejected for template structure if not specified otherwise, but user specific rejected. defaulting others to this or simple modification)
    // Actually user only specified Approved and Rejected.

    // For Rejected
    text = `
Leave Request Update – Rejected

Hello ${data.employeeName},

Your leave request has been reviewed and not approved by ${data.approverName}.

Leave Request Details
• Employee Name: ${data.employeeName}
• Employee ID: ${data.employeeEmpId}
• Leave Type: ${leaveTypeDisplay}
• Start Date: ${startDateDisplay} (${startTypeDisplay})
• End Date: ${endDateDisplay} (${endTypeDisplay})
• Duration: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
• Reason: ${data.reason}
${data.comment ? `• Rejection Comment: ${data.comment}\n` : ''}• Status: REJECTED

Please log in to the portal to review the details.
For any clarification, contact your reporting manager or the HR team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
    `;
  }

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
  let emailSubject = '';
  if (data.status === 'approved') {
    emailSubject = `Leave Request Approved – Confirmation [Ref: ${uniqueId}]`;
  } else if (data.status === 'rejected') {
    emailSubject = `Leave Request Update – Rejected [Ref: ${uniqueId}]`;
  } else {
    emailSubject = `Leave Request Status - ${data.employeeName} [Ref: ${uniqueId}]`;
  }

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

  const content = `
    <p>Hello ${data.employeeName},</p>
    <p>Welcome to the TensorGo Intranet.</p>
    <p>Your account has been successfully created. You can now access the platform to manage your profile, collaborate with teams, and stay updated on company announcements and resources.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Login Details</h3>
    <ul style="color: #374151; font-size: 16px; line-height: 1.6;">
      <li><strong>Portal URL:</strong> <a href="${data.loginUrl}">${data.loginUrl}</a></li>
      <li><strong>Username:</strong> ${data.email}</li>
      <li><strong>Temporary Password:</strong> ${data.temporaryPassword}</li>
    </ul>
    <p>For security reasons, you will be prompted to change your password during your first login.</p>
    <p>If you face any issues accessing your account, please contact the HR team.</p>
    <p>We’re excited to have you onboard.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Welcome to TensorGo Intranet – Access Details',
    content,
    uniqueId,
    'Welcome to the TensorGo Intranet'
  );
};

const generateNewEmployeeCredentialsEmailText = (data: NewEmployeeCredentialsEmailData): string => {
  return `
Welcome to TensorGo Intranet – Access Details

Hello ${data.employeeName},

Welcome to the TensorGo Intranet.

Your account has been successfully created. You can now access the platform to manage your profile, collaborate with teams, and stay updated on company announcements and resources.

Login Details
• Portal URL: ${data.loginUrl}
• Username: ${data.email}
• Temporary Password: ${data.temporaryPassword}

For security reasons, you will be prompted to change your password during your first login.

If you face any issues accessing your account, please contact the HR team.

We’re excited to have you onboard.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendNewEmployeeCredentialsEmail = async (
  employeeEmail: string,
  data: NewEmployeeCredentialsEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Welcome to TensorGo Intranet – Access Details`;
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
  documentUrl?: string; // Optional document URL or key
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
    { label: 'Employee Name:', value: data.employeeName, isBold: true },
    { label: 'Employee ID:', value: data.employeeEmpId || 'N/A' },
    { label: 'Leave Type:', value: leaveTypeDisplay, isBold: true },
    { label: 'Days Allocated:', value: `${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}`, isBold: true },
    { label: 'Allocated By:', value: data.allocatedBy },
    { label: 'Allocation Date:', value: allocationDateDisplay }
  ]);

  const content = `
    <p>Hello ${data.allocatedBy},</p>
    <p>This is to notify you that a leave allocation has been processed in the TensorGo system for the employee listed below.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Allocation Details</h3>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px;">
      ${detailsTable}
    </div>
    <p>This update has been recorded for administrative tracking and compliance purposes.</p>
    <p>If this allocation was not intended or requires verification, please review the transaction in the admin portal or contact HR immediately.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Leave Allocation Alert - Super Admin',
    content,
    uniqueId,
    `Leave allocation processed for ${data.employeeName}`
  );
};

const generateLeaveAllocationEmailText = (data: LeaveAllocationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const allocationDateDisplay = formatDateForDisplay(data.allocationDate);

  return `
Leave Allocation Alert – Administrative Notification

Hello ${data.allocatedBy},

This is to notify you that a leave allocation has been processed in the TensorGo system for the employee listed below.

Allocation Details
• Employee Name: ${data.employeeName}
• Employee ID: ${data.employeeEmpId || 'N/A'}
• Leave Type: ${leaveTypeDisplay}
• Days Allocated: ${data.allocatedDays}
• Allocated By: ${data.allocatedBy}
• Allocation Date: ${allocationDateDisplay}

This update has been recorded for administrative tracking and compliance purposes.
If this allocation was not intended or requires verification, please review the transaction in the admin portal or contact HR immediately.

Regards,
TensorGo HR Team
This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

/**
 * Generate super admin leave allocation notification email HTML
 */
const generateSuperAdminLeaveAllocationEmailHtml = (data: LeaveAllocationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const allocationDateDisplay = formatDateForDisplay(data.allocationDate);
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const detailsTable = generateDetailsTable([
    { label: 'Employee Name:', value: data.employeeName, isBold: true },
    { label: 'Employee ID:', value: data.employeeEmpId },
    { label: 'Leave Type:', value: leaveTypeDisplay, isBold: true },
    { label: 'Days Allocated:', value: `${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}`, isBold: true },
    { label: 'Allocated By:', value: data.allocatedBy },
    { label: 'Allocation Date:', value: allocationDateDisplay },
    ...(data.comment ? [{ label: 'Comment:', value: data.comment }] : []),
    ...(data.documentUrl ? [{
      label: 'Document:',
      value: `<a href="${data.documentUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">View Attachment</a>`,
      isHtml: true
    }] : [])
  ]);

  const content = `
    <p>Dear Super Admin,</p>
    <p>This is to notify you that <strong>${data.allocatedBy}</strong> has added <strong>${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'}</strong> of <strong>${leaveTypeDisplay}</strong> to <strong>${data.employeeName}'s</strong> leave balance.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 18px;">Allocation Details</h3>
    ${detailsTable}
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Leave Allocation Alert - Super Admin',
    content,
    uniqueId,
    `${data.allocatedBy} added leaves to ${data.employeeName}`
  );
};

/**
 * Generate super admin leave allocation notification email text
 */
const generateSuperAdminLeaveAllocationEmailText = (data: LeaveAllocationEmailData): string => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const allocationDateDisplay = formatDateForDisplay(data.allocationDate);

  return `
Leave Allocation Alert - Super Admin

Dear Super Admin,

This is to notify you that ${data.allocatedBy} has added ${data.allocatedDays} ${data.allocatedDays === 1 ? 'day' : 'days'} of ${leaveTypeDisplay} to ${data.employeeName}'s leave balance.

Allocation Details:
- Employee Name: ${data.employeeName}
- Employee ID: ${data.employeeEmpId}
- Leave Type: ${leaveTypeDisplay}
- Days Allocated: ${data.allocatedDays}
- Allocated By: ${data.allocatedBy}
- Allocation Date: ${allocationDateDisplay}
${data.comment ? `- Comment: ${data.comment}\n` : ''}${data.documentUrl ? `- Document: ${data.documentUrl}\n` : ''}

Best Regards,
TensorGo Intranet
  `;
};

export const sendLeaveAllocationEmail = async (
  employeeEmail: string,
  data: LeaveAllocationEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Leave Balance Updated [Ref: ${uniqueId}]`;
  // Create a copy of data without documentUrl for employee
  const employeeData = { ...data };
  delete employeeData.documentUrl;

  const emailHtml = generateLeaveAllocationEmailHtml(employeeData);
  const emailText = generateLeaveAllocationEmailText(employeeData);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

/**
 * Send leave allocation notification to Super Admins
 */
export const sendSuperAdminLeaveAllocationEmail = async (
  adminEmail: string,
  data: LeaveAllocationEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Leave Allocation Alert: ${data.allocatedBy} ➜ ${data.employeeName} [Ref: ${uniqueId}]`;
  const emailHtml = generateSuperAdminLeaveAllocationEmailHtml(data);
  const emailText = generateSuperAdminLeaveAllocationEmailText(data);

  return await sendEmail({
    to: adminEmail,
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
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Hello ${data.userName},</p>
    <p>Your TensorGo Intranet password has been changed.</p>
    <p>If this wasn’t you, please reset your password immediately and contact the HR Team.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Alert: Password Changed',
    content,
    uniqueId,
    'Your password has been successfully changed'
  );
};

const generatePasswordChangeSecurityEmailText = (data: PasswordChangeSecurityEmailData): string => {
  return `
Alert: Password Changed

Hello ${data.userName},

Your TensorGo Intranet password has been changed.

If this wasn’t you, please reset your password immediately and contact the HR Team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendPasswordChangeSecurityEmail = async (
  userEmail: string,
  data: PasswordChangeSecurityEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Alert: Password Changed [Ref: ${uniqueId}]`;
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
    <div style="background-color: #fefce8; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
      <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">
        Action Required: You have pending leave requests awaiting review.
      </p>
    </div>
    <p>Hello ${data.managerName},</p>
    <p>This is a reminder that there are leave requests pending your review and approval in the TensorGo Intranet.</p>
    <p>Timely action is important to ensure workforce planning and employee scheduling are not impacted.</p>
    <p style="margin-top: 20px;">Please log in to the portal to review and take the necessary action on the pending requests.</p>
    <p>If you require any assistance, please contact the HR team.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Pending Leave Approvals Reminder',
    content,
    uniqueId,
    `You have pending leave requests awaiting review`
  );
};

const generatePendingLeaveReminderEmailText = (data: PendingLeaveReminderEmailData): string => {
  return `
Reminder: Pending Leave Requests Awaiting Your Action

Hello ${data.managerName},

This is a reminder that there are leave requests pending your review and approval in the TensorGo Intranet.
Timely action is important to ensure workforce planning and employee scheduling are not impacted.
Please log in to the portal to review and take the necessary action on the pending requests.
If you require any assistance, please contact the HR team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendPendingLeaveReminderEmail = async (
  managerEmail: string,
  data: PendingLeaveReminderEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Reminder: Pending Leave Requests Awaiting Your Action [Ref: ${uniqueId}]`;
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
        Wishing you a very happy birthday!
      </p>
      <p style="font-size: 16px; line-height: 1.7; color: #374151; margin-bottom: 20px;">
        May the year ahead bring you success, happiness, and new achievements. We value your contributions to TensorGo and look forward to another great year together.
      </p>
      <p style="font-size: 16px; line-height: 1.7; color: #374151; margin-bottom: 20px;">
        Enjoy your special day!
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

Wishing you a very happy birthday!

May the year ahead bring you success, happiness, and new achievements. We value your contributions to TensorGo and look forward to another great year together.

Enjoy your special day!

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
    <p style="margin-top: 30px;">Please log in to your portal to view your updated leave summary.</p>
    <p>For any discrepancies, contact HR.</p>
    <p>Best Regards,<br/><strong>TensorGo Intranet</strong></p>
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
    <p>Hello ${data.managerName},</p>
    <p>An urgent leave request has been submitted by <strong>${data.employeeName}</strong> (Employee ID: <strong>${data.employeeEmpId}</strong>) and requires your immediate attention.</p>
    
    <h3 style="margin: 30px 0 10px 0; font-size: 18px; color: #1e3a8a;">Leave Application Details</h3>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px;">
      ${detailsTable}
    </div>

    <p style="margin-top: 30px;">Kindly review and take the necessary action on priority via the TensorGo Intranet.</p>
    <p>For any clarification or support, please contact the HR team.</p>

    <p>Regards,<br/>TensorGo HR Team</p>
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
  const emailSubject = `Urgent Leave Application – Immediate Action Required [Ref: ${uniqueId}]`;

  // Generate HTML with professional corporate styling
  const emailHtml = generateUrgentLeaveApplicationEmailHtml(data, uniqueId);

  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  const startTypeDisplay = formatDayType(data.startType);
  const endTypeDisplay = formatDayType(data.endType);
  const appliedDateDisplay = formatDateForDisplay(data.appliedDate);

  const emailText = `
Urgent Leave Application – Immediate Action Required

Hello ${data.managerName},

An urgent leave request has been submitted by ${data.employeeName} (Employee ID: ${data.employeeEmpId}) and requires your immediate attention.

URGENT: This leave application requires your immediate attention and prompt review.

Leave Application Details
• Employee Name: ${data.employeeName}
• Employee ID: ${data.employeeEmpId}
• Leave Type: ${leaveTypeDisplay}
• Start Date: ${startDateDisplay} (${startTypeDisplay})
• End Date: ${endDateDisplay} (${endTypeDisplay})
• Duration: ${data.noOfDays} ${data.noOfDays === 1 ? 'day' : 'days'}
${data.leaveType === 'permission' && data.timeForPermissionStart && data.timeForPermissionEnd ? `• Time: ${formatTime(data.timeForPermissionStart)} - ${formatTime(data.timeForPermissionEnd)}\n` : ''}• Reason: ${data.reason}
${data.doctorNote && data.leaveType !== 'sick' ? `• Medical Certificate: ${data.doctorNote}\n` : ''}• Application Date: ${appliedDateDisplay}

Kindly review and take the necessary action on priority via the TensorGo Intranet.
For any clarification or support, please contact the HR team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
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
    <p>Hello ${data.employeeName},</p>
    <p>Your profile information has been updated in the TensorGo Intranet.</p>
    <p>Please log in to the portal to review and verify your details.</p>
    <p>If you notice any discrepancies, contact the HR Team.</p>

    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Profile Update Notification',
    content,
    uniqueId,
    'Your profile information has been updated'
  );
};

/**
 * Generate employee details update email plain text
 */
const generateEmployeeDetailsUpdateEmailText = (data: EmployeeDetailsUpdateEmailData): string => {
  return `
Profile Update Notification – TensorGo Intranet

Hello ${data.employeeName},

Your profile information has been updated in the TensorGo Intranet.
Please log in to the portal to review and verify your details.
If you notice any discrepancies, contact the HR Team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
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

  const emailSubject = `Profile Update Notification – TensorGo Intranet [Ref: ${uniqueId}]`;
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
// LOP TO CASUAL CONVERSION EMAIL REMOVED AS PER USER REQUEST
// ============================================================================

// ============================================================================
// HOLIDAY CALENDAR REMINDER EMAIL
// ============================================================================

export interface HolidayCalendarReminderEmailData {
  recipientName: string; // Usually HR Team or specific admin
  nextYear: number;
}

/**
 * Generate holiday calendar reminder email HTML
 */
const generateHolidayCalendarReminderEmailHtml = (data: HolidayCalendarReminderEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Hello ${data.recipientName},</p>
    <p>This is a reminder to review and update the organizational holiday calendar for the upcoming year <strong>${data.nextYear}</strong>.</p>
    <p>Kindly ensure it is finalized and published before the new year.</p>
    <h3 style="margin: 30px 0 10px 0; font-size: 16px;">Action Steps:</h3>
    <ul style="color: #374151; font-size: 16px; line-height: 1.6;">
      <li>Log in to the Admin Portal.</li>
      <li>Navigate to Leave Settings > Holiday Calendar.</li>
      <li>Add the holiday list for ${data.nextYear}.</li>
    </ul>
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return generateEmailWrapper(
    'Upcoming Year Holiday List Reminder',
    content,
    uniqueId,
    `Action Required: Update holiday calendar for ${data.nextYear}`
  );
};

/**
 * Generate holiday calendar reminder email plain text
 */
const generateHolidayCalendarReminderEmailText = (data: HolidayCalendarReminderEmailData): string => {
  return `
Reminder: Update Upcoming Year Holiday Calendar

Hello ${data.recipientName},

This is a reminder to review and update the organizational holiday calendar for the upcoming year ${data.nextYear}.
Kindly ensure it is finalized and published before the new year.

Action Steps:
- Log in to the Admin Portal.
- Navigate to Leave Settings > Holiday Calendar.
- Add the holiday list for ${data.nextYear}.

Best Regards,
TensorGo Intranet
  `;
};

/**
 * Send holiday calendar reminder email
 */
export const sendHolidayCalendarReminderEmail = async (
  recipientEmail: string,
  data: HolidayCalendarReminderEmailData,
  cc?: string | string[]
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  return await sendEmail({
    to: recipientEmail,
    cc,
    subject: `Reminder: Update Upcoming Year Holiday Calendar [Ref: ${uniqueId}]`,
    html: generateHolidayCalendarReminderEmailHtml(data),
    text: generateHolidayCalendarReminderEmailText(data),
  });
};







// ============================================================================
// TIMESHEET EMAILS
// ============================================================================

export interface TimesheetStatusEmailData {
  employeeName: string;
  employeeEmpId?: string;
  status: 'approved' | 'rejected';
  startDate?: string;
  endDate?: string;
  logDate?: string; // For single entry rejection
  reason?: string;
  approverName?: string;
}

export interface TimesheetReminderEmailData {
  employeeName: string;
  reminderType: 'daily' | 'friday_alert' | 'criteria_not_met';
  hoursLogged?: number;
  date?: string;
}

export interface TimesheetSubmissionEmailData {
  managerName?: string;
  employeeName: string;
  hoursLogged: number;
  startDate: string;
  endDate: string;
  isLate?: boolean;
  isResubmission?: boolean;
}

/**
 * Send Timesheet Status Email (Approval/Rejection)
 */
export const sendTimesheetStatusEmail = async (
  recipientEmail: string,
  data: TimesheetStatusEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const isApproved = data.status === 'approved';
  const title = `Timesheet ${isApproved ? 'Approved' : 'Rejected'}`;

  let mainMessage = `Dear ${data.employeeName},<br/><br/>`;
  if (isApproved) {
    mainMessage += `Your timesheet for the period <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> has been <strong>approved</strong>.`;
  } else {
    if (data.logDate) {
      mainMessage += `Your timesheet entry for <strong>${data.logDate}</strong> has been <strong>rejected</strong>.`;
    } else if (data.startDate === data.endDate) {
      mainMessage += `Your timesheet entries for <strong>${data.startDate}</strong> have been <strong>rejected</strong>.`;
    } else {
      mainMessage += `Your timesheet entries for <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> have been <strong>rejected</strong>.`;
    }
  }

  const detailsTable = generateDetailsTable([
    { label: 'Status:', value: data.status.toUpperCase(), isBold: true },
    ...(data.startDate ? [
      data.startDate === data.endDate
        ? { label: 'Date:', value: data.startDate }
        : { label: 'Period:', value: `${data.startDate} to ${data.endDate}` }
    ] : []),
    ...(data.logDate ? [{ label: 'Date:', value: data.logDate }] : []),
    ...(data.reason ? [{ label: 'Reason:', value: data.reason }] : []),
    ...(data.approverName ? [{ label: 'Action By:', value: data.approverName }] : []),
  ]);

  const content = `
    ${mainMessage}
    ${detailsTable}
    ${!isApproved ? '<p style="margin-top: 20px; color: #dc2626;"><strong>Action Required:</strong> Please log in to the portal to correct and resubmit your timesheet.</p>' : ''}
    <p style="margin-top: 30px;">Best Regards,<br/><strong>TensorGo Intranet</strong></p>
  `;

  return await sendEmail({
    to: recipientEmail,
    subject: `${title} - TensorGo Intranet [Ref: ${uniqueId}]`,
    html: generateEmailWrapper(title, content, uniqueId, `${title} notification`),
    text: `${title}\n\n${mainMessage.replace(/<br\/>/g, '\n').replace(/<\/?[^>]+(>|$)/g, "")}`
  });
};

/**
 * Send Timesheet Reminder/Alert Email
 */
export const sendTimesheetReminderEmail = async (
  recipientEmail: string,
  data: TimesheetReminderEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  let title = 'Timesheet Reminder';
  let message = '';
  let preview = '';
  let buttonText = 'Update Timesheet';

  if (data.reminderType === 'daily') {
    title = 'Reminder: Daily Timesheet Pending';
    message = `
      <p>Hello ${data.employeeName},</p>
      <p>Our records indicate that your timesheet for today (<strong>${data.date}</strong>) has not yet been submitted.</p>
      <p>Timely updates are important to ensure accurate project tracking, team coordination, and operational planning.</p>
      <p>Please log in to portal and update your timesheet at the earliest.</p>
    `;
    preview = `Daily timesheet pending for ${data.date}`;
  } else if (data.reminderType === 'friday_alert') {
    title = 'Timesheet Alert: Low Hours'; // Header as per request image (Subject is slightly longer)
    message = `
      <p>Hello ${data.employeeName},</p>
      <p>Your logged timesheet hours for this week are currently below the expected threshold.</p>
      <p><strong>Logged Hours:</strong> ${data.hoursLogged}</p>
      <p><strong>Expected Weekly Hours:</strong> 40</p>
      <p><strong>Submission Deadline:</strong> Saturday 9 PM</p>
      <div style="margin: 25px 0; text-align: center;">
        <a href="https://intra.tensorgo.com/project-management" style="background-color:#1e3a8a;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:200px;border-radius:4px;">${buttonText}</a>
      </div>
      <p>Please review and update your timesheet to ensure alignment with project tracking, workload planning, and team coordination.</p>
      <p>If you believe this alert has been triggered in error or need assistance, please contact your reporting manager or HR.</p>
    `;
    preview = `Weekly hours alert: ${data.hoursLogged} hours logged`;
  } else if (data.reminderType === 'criteria_not_met') {
    title = 'Timesheet Criteria Not Met';
    message = `
      <p>Hello ${data.employeeName},</p>
      <p>Your timesheet for the current week does not meet the required submission criteria.</p>
      <p><strong>Logged Hours:</strong> ${data.hoursLogged}</p>
      <p><strong>Minimum Required Hours:</strong> 40</p>
      <p><strong>Timesheet Status:</strong> <span style="color: #dc2626; font-weight: bold;">Not Submitted / Incomplete</span></p>
      <p>Timely submission is essential to ensure accurate project visibility, workload planning, and team coordination.</p>
      <div style="margin: 25px 0; text-align: center;">
        <a href="https://intra.tensorgo.com/project-management" style="background-color:#1e3a8a;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:200px;border-radius:4px;">${buttonText}</a>
      </div>
      <p style="color: #dc2626; font-weight: bold;">Action Required: Please log in and update your timesheet immediately.</p>
      <p>If you require assistance or believe this notification was triggered in error, please contact your reporting manager or HR.</p>
    `;
    preview = 'Immediate action required: Timesheet criteria not met';
  }

  // Common Footer
  const content = `
    ${message}
    ${data.reminderType === 'daily' ? `
    <div style="margin: 25px 0; text-align: center;">
      <a href="https://intra.tensorgo.com/project-management" style="background-color:#1e3a8a;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:200px;border-radius:4px;">${buttonText}</a>
    </div>` : ''}
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  // Determine Subject based on type
  let subject = title;
  if (data.reminderType === 'friday_alert') subject = 'Timesheet Alert: Weekly Hours Below Expected Threshold';
  if (data.reminderType === 'criteria_not_met') subject = 'Timesheet Criteria Not Met – Immediate Action Required';

  return await sendEmail({
    to: recipientEmail,
    subject: `${subject}`,
    html: generateEmailWrapper(title, content, uniqueId, preview),
    text: `${subject}\n\n${message.replace(/<\/?[^>]+(>|$)/g, "")}` // Simple text stripping
  });
};

/**
 * Send Timesheet Submission Email (to Manager)
 */
export const sendTimesheetSubmissionEmail = async (
  managerEmail: string,
  data: TimesheetSubmissionEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const title = 'Timesheet Submitted';
  const subject = 'Timesheet Submitted – Review Required';

  const content = `
    <p>Hello ${data.managerName || 'Manager'},</p>
    <p><strong>${data.employeeName}</strong>, who reports to you, has submitted their timesheet. Please log in to the portal to review and approve it.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; font-size: 14px; color: #374151;">
        <tr>
          <td style="padding: 5px 0; width: 40%; color: #64748b;">Employee Name:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.employeeName}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Weekly Hours:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.hoursLogged} hours</td>
        </tr>
         <tr>
          <td style="padding: 5px 0; color: #64748b;">Period:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.startDate} to ${data.endDate}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Status:</td>
          <td style="padding: 5px 0; font-weight: bold; color: #1e3a8a; text-transform: uppercase;">SUBMITTED</td>
        </tr>
      </table>
    </div>

    <p style="margin-top: 30px;">For any clarification, please contact HR.</p>
    <p>This is an auto-generated email. Please do not reply.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return await sendEmail({
    to: managerEmail,
    subject: `${subject} [Ref: ${uniqueId}]`,
    html: generateEmailWrapper(title, content, uniqueId, `${data.employeeName} has submitted their timesheet`),
    text: `${subject}\n\nHello ${data.managerName},\n\n${data.employeeName} has submitted their timesheet.\nHours: ${data.hoursLogged}\nPeriod: ${data.startDate} to ${data.endDate}\n\nPlease review and approve.`
  });
};

export interface TimesheetSummaryEmailData {
  managerName: string;
  startDate: string;
  endDate: string;
  submissions: Array<{ name: string; hours: number }>;
  failures: Array<{ name: string; hours: number }>;
}

/**
 * Send Timesheet Summary Email (to Manager)
 */
export const sendTimesheetSummaryEmail = async (
  managerEmail: string,
  data: TimesheetSummaryEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const title = 'Weekly Timesheet Summary';

  const submissionRows = data.submissions.length > 0
    ? data.submissions.map(s => `<tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${s.name}</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${s.hours}h</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #166534; font-weight: bold; text-align: right;">SUBMITTED</td></tr>`).join('')
    : '<tr><td colspan="3" style="padding: 12px; color: #64748b; text-align: center;">No auto-submissions</td></tr>';

  const failureRows = data.failures.length > 0
    ? data.failures.map(f => `<tr><td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${f.name}</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${f.hours}h</td><td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #991b1b; font-weight: bold; text-align: right;">FAILED</td></tr>`).join('')
    : '<tr><td colspan="3" style="padding: 12px; color: #64748b; text-align: center;">None</td></tr>';

  const content = `
    <p>Hello ${data.managerName || 'Manager'},</p>
    <p>Please find below the weekly timesheet summary for your team for the period <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong>.</p>
    
    <h3 style="margin: 30px 0 10px 0; font-size: 16px; color: #1e3a8a;">Auto-Submissions (Confirmed)</h3>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 10px; text-align: left; color: #475569;">Employee</th>
          <th style="padding: 10px; text-align: right; color: #475569;">Hours</th>
          <th style="padding: 10px; text-align: right; color: #475569;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${submissionRows}
      </tbody>
    </table>

    <h3 style="margin: 30px 0 10px 0; font-size: 16px; color: #991b1b;">Missed Submissions (Action Required)</h3>
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 10px; text-align: left; color: #475569;">Employee</th>
          <th style="padding: 10px; text-align: right; color: #475569;">Hours</th>
          <th style="padding: 10px; text-align: right; color: #475569;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${failureRows}
      </tbody>
    </table>

    <p style="margin-top: 30px;">Please review submitted timesheets and follow up on any pending or incomplete entries to ensure accurate project tracking and planning.</p>
    <p>For assistance, contact HR.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return await sendEmail({
    to: managerEmail,
    subject: `Weekly Timesheet Summary – Team Status Report [Ref: ${uniqueId}]`,
    html: generateEmailWrapper(title, content, uniqueId, 'Weekly timesheet status summary for your team'),
    text: `Weekly Timesheet Summary – Team Status Report\n\nPeriod: ${data.startDate} to ${data.endDate}\n\nSubmissions:\n${data.submissions.map(s => `${s.name}: ${s.hours}h (SUBMITTED)`).join('\n')}\n\nMissed Submissions:\n${data.failures.map(f => `${f.name}: ${f.hours}h (FAILED)`).join('\n')}`
  });
};

// ============================================================================
// TIMESHEET STATUS EMAILS (APPROVED / REJECTED)
// ============================================================================

/**
 * Generate timesheet approved email HTML
 */
const generateTimesheetApprovedEmailHtml = (data: TimesheetStatusEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  const approver = data.approverName || 'Manager';

  const content = `
    <p>Hello ${data.employeeName},</p>
    <p>Your timesheet for the period <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> has been <strong>approved</strong> by <strong>${approver}</strong>.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; font-size: 14px; color: #374151;">
        <tr>
          <td style="padding: 5px 0; width: 40%; color: #64748b;">Status:</td>
          <td style="padding: 5px 0; font-weight: bold; color: #166534; text-transform: uppercase;">APPROVED</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Period:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.startDate} to ${data.endDate}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Action By:</td>
          <td style="padding: 5px 0; font-weight: bold;">${approver}</td>
        </tr>
      </table>
    </div>

    <p>If you notice any discrepancies, please contact your reporting manager or HR.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Timesheet Approved',
    content,
    uniqueId,
    `Your timesheet for ${data.startDate} to ${data.endDate} has been approved`
  );
};

const generateTimesheetApprovedEmailText = (data: TimesheetStatusEmailData): string => {
  const approver = data.approverName || 'Manager';
  return `
Timesheet Approved – Confirmation

Hello ${data.employeeName},

Your timesheet for the period ${data.startDate} to ${data.endDate} has been approved by ${approver}.

Status: APPROVED
Period: ${data.startDate} to ${data.endDate}
Action By: ${approver}

If you notice any discrepancies, please contact your reporting manager or HR.

Regards,
TensorGo HR Team
This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendTimesheetApprovedEmail = async (
  recipientEmail: string,
  data: TimesheetStatusEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Timesheet Approved – Confirmation [Ref: ${uniqueId}]`;
  const emailHtml = generateTimesheetApprovedEmailHtml(data);
  const emailText = generateTimesheetApprovedEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

/**
 * Generate timesheet rejected email HTML
 */
const generateTimesheetRejectedEmailHtml = (data: TimesheetStatusEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;
  const approver = data.approverName || 'Manager';

  const content = `
    <p>Hello ${data.employeeName},</p>
    <p>Your timesheet for <strong>${data.logDate}</strong> has been reviewed and <strong>rejected</strong>.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; font-size: 14px; color: #374151;">
        <tr>
          <td style="padding: 5px 0; width: 40%; color: #64748b;">Status:</td>
          <td style="padding: 5px 0; font-weight: bold; color: #dc2626; text-transform: uppercase;">REJECTED</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Date:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.logDate}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Reason:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.reason}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #64748b;">Action By:</td>
          <td style="padding: 5px 0; font-weight: bold;">${approver}</td>
        </tr>
      </table>
    </div>

    <p style="color: #dc2626; font-weight: bold;">Action Required: Please log in to the portal to correct and resubmit your timesheet at the earliest to avoid reporting delays.</p>
    <p>For any clarification, contact your reporting manager or HR.</p>
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Timesheet Rejected',
    content,
    uniqueId,
    `Your timesheet for ${data.logDate} has been rejected`
  );
};

const generateTimesheetRejectedEmailText = (data: TimesheetStatusEmailData): string => {
  const approver = data.approverName || 'Manager';
  return `
Timesheet Rejected – Action Required

Hello ${data.employeeName},

Your timesheet for ${data.logDate} has been reviewed and rejected.

Status: REJECTED
Date: ${data.logDate}
Reason: ${data.reason}
Reviewed By: ${approver}

Action Required: Please log in to the portal to correct and resubmit your timesheet at the earliest to avoid reporting delays.
For any clarification, contact your reporting manager or HR.

Regards,
TensorGo HR Team
This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendTimesheetRejectedEmail = async (
  recipientEmail: string,
  data: TimesheetStatusEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Timesheet Rejected – Action Required [Ref: ${uniqueId}]`;
  const emailHtml = generateTimesheetRejectedEmailHtml(data);
  const emailText = generateTimesheetRejectedEmailText(data);

  return await sendEmail({
    to: recipientEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// ROLE UPDATE NOTIFICATION EMAIL
// ============================================================================

export interface RoleUpdateEmailData {
  employeeName: string;
  newRole: string;
  effectiveDate: string;
  updatedBy?: string;
}

/**
 * Generate role update email HTML
 */
const generateRoleUpdateEmailHtml = (data: RoleUpdateEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Hello ${data.employeeName},</p>
    <p>Your role and access permissions on the TensorGo Intranet have been updated.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 25px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; color: #1e3a8a; font-size: 16px; font-weight: 600;">Updated Role: <span style="color: #1e40af;">${data.newRole}</span></p>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Effective Date: ${data.effectiveDate}</p>
      ${data.updatedBy ? `<p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 13px;">Updated by: ${data.updatedBy}</p>` : ''}
    </div>

    <p>These changes may impact the modules, dashboards, and workflows available to you.</p>
    <p>If you believe this update was made in error or require additional access, please reach out to HR.</p>
    
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Role Update Notification – TensorGo Intranet',
    content,
    uniqueId,
    `Your role has been updated to ${data.newRole}`
  );
};

const generateRoleUpdateEmailText = (data: RoleUpdateEmailData): string => {
  return `
Role Update Notification – TensorGo Intranet

Hello ${data.employeeName},

Your role and access permissions on the TensorGo Intranet have been updated.

Updated Role: ${data.newRole}
Effective Date: ${data.effectiveDate}
${data.updatedBy ? `Updated by: ${data.updatedBy}` : ''}

These changes may impact the modules, dashboards, and workflows available to you.

If you believe this update was made in error or require additional access, please reach out to HR.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendRoleUpdateEmail = async (
  employeeEmail: string,
  data: RoleUpdateEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Role Update Notification – TensorGo Intranet [Ref: ${uniqueId}]`;
  const emailHtml = generateRoleUpdateEmailHtml(data);
  const emailText = generateRoleUpdateEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// EMPLOYMENT STATUS UPDATE NOTIFICATION EMAIL
// ============================================================================

export interface StatusUpdateEmailData {
  employeeName: string;
  newStatus: string;
  effectiveDate: string;
  updatedBy?: string;
}

/**
 * Generate employment status update email HTML
 */
const generateStatusUpdateEmailHtml = (data: StatusUpdateEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Hello ${data.employeeName},</p>
    <p>This is to notify you that your employment status in the TensorGo system has been updated.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 25px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; color: #1e3a8a; font-size: 16px; font-weight: 600;">Updated Status: <span style="color: #1e40af;">${data.newStatus}</span></p>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Effective Date: ${data.effectiveDate}</p>
      ${data.updatedBy ? `<p style="margin: 10px 0 0 0; color: #94a3b8; font-size: 13px;">Updated by: ${data.updatedBy}</p>` : ''}
    </div>

    <p>Your system access, benefits, or workflows may be impacted based on this change.</p>
    <p>For any clarification, please contact the HR team.</p>
    
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Employment Status Update Notification',
    content,
    uniqueId,
    `Your employment status has been updated to ${data.newStatus}`
  );
};

const generateStatusUpdateEmailText = (data: StatusUpdateEmailData): string => {
  return `
Employment Status Update Notification

Hello ${data.employeeName},

This is to notify you that your employment status in the TensorGo system has been updated.

Updated Status: ${data.newStatus}
Effective Date: ${data.effectiveDate}
${data.updatedBy ? `Updated by: ${data.updatedBy}` : ''}

Your system access, benefits, or workflows may be impacted based on this change.

For any clarification, please contact the HR team.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendStatusUpdateEmail = async (
  employeeEmail: string,
  data: StatusUpdateEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Employment Status Update Notification [Ref: ${uniqueId}]`;
  const emailHtml = generateStatusUpdateEmailHtml(data);
  const emailText = generateStatusUpdateEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

// ============================================================================
// REPORTING MANAGER UPDATE NOTIFICATION EMAIL
// ============================================================================

export interface ReportingManagerUpdateEmailData {
  employeeName: string;
  managerName: string;
  managerId: string;
}

/**
 * Generate reporting manager update email HTML
 */
const generateReportingManagerUpdateEmailHtml = (data: ReportingManagerUpdateEmailData): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const content = `
    <p>Hello ${data.employeeName},</p>
    <p>Your reporting manager has been updated.</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; padding: 25px; margin: 30px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; color: #1e3a8a; font-size: 16px; font-weight: 600;">Name: <span style="color: #1e40af;">${data.managerName}</span></p>
      <p style="margin: 0; color: #64748b; font-size: 14px;">Employee ID: ${data.managerId}</p>
    </div>

    <p>Please route all leave and work-related communications to your new manager effective immediately. For any clarification, contact HR.</p>
    
    <p>Regards,<br/>TensorGo HR Team</p>
  `;

  return generateEmailWrapper(
    'Reporting Manager Updated',
    content,
    uniqueId,
    `Your reporting manager has been updated to ${data.managerName}`
  );
};

const generateReportingManagerUpdateEmailText = (data: ReportingManagerUpdateEmailData): string => {
  return `
Reporting Manager Updated – TensorGo Intranet

Hello ${data.employeeName},

Your reporting manager has been updated.

Name: ${data.managerName}
Employee ID: ${data.managerId}

Please route all leave and work-related communications to your new manager effective immediately. For any clarification, contact HR.

Regards,
TensorGo HR Team

This is an auto-generated email from the TensorGo Intranet. Please do not reply to this message.
  `;
};

export const sendReportingManagerUpdateEmail = async (
  employeeEmail: string,
  data: ReportingManagerUpdateEmailData
): Promise<boolean> => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const uniqueId = `${timestamp}${randomStr}`;

  const emailSubject = `Reporting Manager Updated – TensorGo Intranet [Ref: ${uniqueId}]`;
  const emailHtml = generateReportingManagerUpdateEmailHtml(data);
  const emailText = generateReportingManagerUpdateEmailText(data);

  return await sendEmail({
    to: employeeEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText,
  });
};

