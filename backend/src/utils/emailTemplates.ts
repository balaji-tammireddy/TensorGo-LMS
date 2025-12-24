/**
 * Email templates for the LMS application
 */

export interface LeaveApplicationEmailData {
  employeeName: string;
  employeeEmpId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  noOfDays: number;
  startType?: string;
  endType?: string;
  timeForPermission?: { start?: string; end?: string };
  recipientName?: string; // Name of the person receiving the email (Manager or HR)
}

/**
 * Format leave type for display
 */
const formatLeaveType = (leaveType: string): string => {
  const types: { [key: string]: string } = {
    casual: 'Casual Leave',
    sick: 'Sick Leave',
    lop: 'Loss of Pay (LOP)',
    permission: 'Permission',
  };
  return types[leaveType] || leaveType.charAt(0).toUpperCase() + leaveType.slice(1);
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
 * Generate HTML email template for leave application notification to manager
 */
export const generateLeaveApplicationEmail = (data: LeaveApplicationEmailData): { subject: string; html: string; text: string } => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  
  // Format date range
  const dateRange = data.startDate === data.endDate 
    ? startDateDisplay 
    : `${startDateDisplay} to ${endDateDisplay}`;
  
  // Format day type info
  let dayTypeInfo = '';
  if (data.startType && data.endType) {
    if (data.startType === 'half' && data.endType === 'half' && data.startDate === data.endDate) {
      dayTypeInfo = ' (Half Day)';
    } else if (data.startType === 'half' || data.endType === 'half') {
      dayTypeInfo = ` (${data.startType === 'half' ? 'Half' : 'Full'} day start, ${data.endType === 'half' ? 'Half' : 'Full'} day end)`;
    }
  }
  
  // Format permission timings if applicable
  let permissionInfo = '';
  if (data.leaveType === 'permission' && data.timeForPermission) {
    permissionInfo = `<p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Time:</strong> ${data.timeForPermission.start || 'N/A'} to ${data.timeForPermission.end || 'N/A'}</p>`;
  }

  const subject = `Leave Application - ${data.employeeName} (${data.employeeEmpId})`;
  
  // Personalize greeting with recipient name, fallback to "Manager" if not provided
  const greeting = data.recipientName ? `Dear ${data.recipientName},` : 'Dear Manager,';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leave Application</title>
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
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                ${greeting}
              </p>
              
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                <strong>${data.employeeName}</strong> (Employee ID: ${data.employeeEmpId}) has applied for leave.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Leave Type:</strong> ${leaveTypeDisplay}</p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Date Range:</strong> ${dateRange}${dayTypeInfo}</p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Number of Days:</strong> ${data.noOfDays}</p>
                ${permissionInfo}
                <p style="margin: 10px 0 0 0; color: #333333; font-size: 14px;"><strong>Reason:</strong> ${data.reason}</p>
              </div>
              
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Please review and take appropriate action on this leave request.
              </p>
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                <strong>TensorGo LMS</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
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

  const text = `
Leave Application Notification

${greeting}

${data.employeeName} (Employee ID: ${data.employeeEmpId}) has applied for leave.

Leave Type: ${leaveTypeDisplay}
Date Range: ${dateRange}${dayTypeInfo}
Number of Days: ${data.noOfDays}
${data.leaveType === 'permission' && data.timeForPermission ? `Time: ${data.timeForPermission.start || 'N/A'} to ${data.timeForPermission.end || 'N/A'}\n` : ''}Reason: ${data.reason}

Please review and take appropriate action on this leave request.

Best regards,
TensorGo LMS

---
This is an automated email from TensorGo Leave Management System.
  `;

  return { subject, html, text };
};

export interface LeaveStatusEmailData {
  employeeName: string;
  employeeEmail: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  noOfDays: number;
  status: 'approved' | 'rejected' | 'partially_approved';
  approverName: string;
  approverRole: string;
  rejectionReason?: string;
}

/**
 * Generate HTML email template for leave approval/rejection notification to employee
 */
export const generateLeaveStatusEmail = (data: LeaveStatusEmailData): { subject: string; html: string; text: string } => {
  const leaveTypeDisplay = formatLeaveType(data.leaveType);
  const startDateDisplay = formatDateForDisplay(data.startDate);
  const endDateDisplay = formatDateForDisplay(data.endDate);
  
  // Format date range
  const dateRange = data.startDate === data.endDate 
    ? startDateDisplay 
    : `${startDateDisplay} to ${endDateDisplay}`;
  
  // Format approver role for display
  const approverRoleDisplay = data.approverRole === 'manager' 
    ? 'Manager' 
    : data.approverRole === 'hr' 
    ? 'HR' 
    : 'Super Admin';
  
  const isApproved = data.status === 'approved';
  const isPartiallyApproved = data.status === 'partially_approved';
  const isRejected = data.status === 'rejected';
  
  let statusColor: string;
  let statusText: string;
  let statusIcon: string;
  
  if (isApproved) {
    statusColor = '#10b981';
    statusText = 'Approved';
    statusIcon = '✅';
  } else if (isPartiallyApproved) {
    statusColor = '#f59e0b';
    statusText = 'Partially Approved';
    statusIcon = '⚠️';
  } else {
    statusColor = '#ef4444';
    statusText = 'Rejected';
    statusIcon = '❌';
  }

  const subject = `Leave ${statusText} - ${leaveTypeDisplay} from ${startDateDisplay} to ${endDateDisplay}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Leave ${statusText}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0; text-align: center; background-color: #ffffff;">
        <table role="presentation" style="width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: ${statusColor}; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Leave ${statusText} ${statusIcon}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${data.employeeName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Your leave application has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong>.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid ${statusColor}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Leave Type:</strong> ${leaveTypeDisplay}</p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Date Range:</strong> ${dateRange}</p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Number of Days:</strong> ${data.noOfDays}</p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;"><strong>${isApproved ? 'Approved by' : 'Rejected by'}:</strong> ${data.approverName} (${approverRoleDisplay})</p>
                ${!isApproved && data.rejectionReason ? `<p style="margin: 10px 0 0 0; color: #333333; font-size: 14px;"><strong>Reason:</strong> ${data.rejectionReason}</p>` : ''}
              </div>
              
              ${isApproved 
                ? '<p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">Your leave request has been approved. Please plan accordingly.</p>'
                : isPartiallyApproved
                ? '<p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">Your leave request has been partially approved. Some days are still pending approval. You will be notified once the final decision is made.</p>'
                : '<p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">If you have any questions or concerns, please contact your reporting manager or HR.</p>'
              }
              
              <p style="margin: 30px 0 0 0; color: #333333; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                <strong>TensorGo LMS</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated email from TensorGo Leave Management System.
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

  const text = `
Leave ${statusText}

Dear ${data.employeeName},

Your leave application has been ${statusText.toLowerCase()}.

Leave Type: ${leaveTypeDisplay}
Date Range: ${dateRange}
Number of Days: ${data.noOfDays}
Status: ${statusText}
${isApproved ? 'Approved by' : 'Rejected by'}: ${data.approverName} (${approverRoleDisplay})
${!isApproved && data.rejectionReason ? `Reason: ${data.rejectionReason}\n` : ''}
${isApproved 
  ? 'Your leave request has been approved. Please plan accordingly.'
  : isPartiallyApproved
  ? 'Your leave request has been partially approved. Some days are still pending approval. You will be notified once the final decision is made.'
  : 'If you have any questions or concerns, please contact your reporting manager or HR.'
}

Best regards,
TensorGo LMS

---
This is an automated email from TensorGo Leave Management System.
  `;

  return { subject, html, text };
};

