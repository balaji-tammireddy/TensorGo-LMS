# 🚀 TensorGo HR-LMS - Complete Enterprise HR Management System

Welcome to the **TensorGo HR Leave Management System (HR-LMS)**. A comprehensive, enterprise-grade HR solution that manages the complete employee lifecycle with advanced leave management, timesheet tracking, and intelligent automation.

---

## ✨ Key Features & Specialties

### 🎯 **Complete HR Management Suite**
- **Employee Lifecycle Management** - From onboarding to exit
- **Advanced Leave Management** - Smart, rule-based leave engine
- **Timesheet Management** - Track work hours with approval workflows
- **Project & Task Management** - Organize work with hierarchical structure
- **Professional PDF Reports** - Generate detailed timesheet reports
- **Email Notifications** - Automated alerts and reminders
- **Audit Trail** - Complete tracking of all system changes

### 🔐 **Enterprise Security**
- Role-Based Access Control (RBAC)
- Audit columns tracking (created_by, updated_by, created_at, updated_at)
- Secure file storage with OVHcloud S3
- Time-limited signed URLs for document access
- Password change enforcement on first login

### ⚡ **Performance & UX Excellence**
- **React Query Caching** - Lightning-fast data loading
- **Optimistic UI Updates** - Instant feedback on user actions
- **N+1 Query Optimization** - Handles thousands of records efficiently
- **Searchable Dropdowns** - Easy filtering in all forms
- **Responsive Design** - Works seamlessly on all devices

---

## 👥 User Roles & Permissions

### **🛡️ Super Admin**
The ultimate system authority with complete control.
- **System Configuration** - Manage global settings, holidays, and infrastructure
- **Ultimate Authority** - Edit, approve, or delete any record
- **User Management** - Create and manage HR and Admin roles
- **Security Oversight** - Monitor audit logs and system security
- **Full Timesheet Access** - View and manage all employee timesheets

### **💼 Human Resources (HR)**
Primary operators of the personnel database.
- **Employee Lifecycle** - Complete onboarding to exit management
- **Compliance Management** - Validate documents (PAN, Aadhar)
- **Manual Leave Allocation** - Grant additional leaves for special cases
- **Organizational Structure** - Manage reporting lines and hierarchy
- **Timesheet Oversight** - View and approve team timesheets
- **Report Generation** - Generate comprehensive HR reports

### **👔 Manager**
Team leaders with approval authority.
- **Team Oversight** - Real-time view of direct reports
- **Leave Approvals** - Approve, reject, or partially approve leaves
- **Timesheet Approvals** - Review and approve team work hours
- **Team Reports** - Generate reports for direct reportees
- **Availability Monitoring** - Track team availability for planning

### **👤 Employee / Intern**
Self-service users with personal management tools.
- **Leave Application** - Submit requests with smart validation
- **Timesheet Entry** - Log daily work hours with project/task details
- **Personal Dashboard** - Track leave balances and work history
- **Profile Management** - Update personal details and photos
- **Self-Service Reports** - View personal timesheet history

---

## 📅 Smart Leave Management Engine

### **Leave Types & Logic**

| Leave Type | Logic | Monthly Cap | Key Features |
|:-----------|:------|:------------|:-------------|
| **Casual** | Exclusive | 10 Days | Advance notice required. Excludes weekends/holidays |
| **Sick** | Exclusive | Unlimited* | 3-day past-date buffer. Future requests for "Tomorrow" only |
| **LOP (Loss of Pay)** | **Inclusive** | 5 Days | **Harsh Logic:** Weekends/Holidays counted if within period |
| **Permission** | Special | Hourly | Max 2 hours per request. 10 AM - 7 PM window only |

### **Advance Notice Requirements (Casual Leave)**
- **Small (0.5 - 2 Days)**: 3 days advance notice
- **Medium (3 - 5 Days)**: 7 days advance notice
- **Large (> 5 Days)**: 30 days advance notice

### **Special Rules**
- **"On Notice" Status**: Casual leave disabled during notice period
- **Inclusive LOP**: Fri-Mon LOP counts as 4 days (includes weekend)
- **Smart Validation**: Prevents holidays, weekends, and overlapping dates
- **Partial Approvals**: Managers can approve specific days only

---

## ⏱️ Advanced Timesheet Management

### **Core Features**
- **Daily Time Logging** - Track hours with project/module/task/activity breakdown
- **Hierarchical Structure** - Project → Module → Task → Activity
- **Approval Workflow** - Manager/HR approval required before submission
- **Flexible Entry** - Add, edit, delete entries before submission
- **System Entries** - Automatic holiday and leave entries
- **Status Tracking** - Draft, Submitted, Approved, Rejected states

### **Smart Validations**
- **40-Hour Minimum** - Weekly submission requires minimum 40 hours
- **No Future Dates** - Cannot log time for future dates
- **No Overlaps** - Prevents duplicate entries for same day
- **Holiday Detection** - Automatic system entries for holidays
- **Leave Integration** - Auto-creates entries for approved leaves

### **Manager Approval Features**
- **Bulk Approval** - Approve entire week at once
- **Day-wise Approval** - Approve specific days individually
- **Entry-level Rejection** - Reject individual entries with reasons
- **Team Overview** - See all reportees' timesheet status
- **Real-time Updates** - Instant status changes with notifications

### **Professional PDF Reports**
- **Comprehensive Filters**:
  - Employee selection (HR/Super Admin only)
  - Project, Module, Task, Activity filters
  - Date range selection
  - Cascading dropdowns with search
- **Rich PDF Layout**:
  - Company logo in header
  - Applied filters summary
  - Statistics (total hours, entries, employees)
  - Detailed data table with all timesheet entries
  - Page numbers and generation info
- **Permission-based Access**:
  - Managers: See reportees only
  - HR/Super Admin: See all employees

---

## 🏗️ Organizational Hierarchy & Automation

### **Reporting Chain**
- **L1 (Primary)**: Direct Manager
- **L2 (Secondary)**: HR
- **L3 (Global)**: Super Admin

### **⚡ Automated Reassignment**
When a Manager's status changes to Resigned/Inactive/Terminated:
1. **Detection**: System scans for all reportees
2. **Re-routing**: Reportees automatically moved to Super Admin
3. **Notification**: Automated emails to all affected employees

---

## 📋 Employee Management & Validation

### **Document Validation**
- **PAN Card**: Must follow `ABCDE1234F` format
- **Aadhar**: Exactly 12 digits
- **Age Verification**: Minimum 18 years old
- **Educational Timeline**: Validates 12th → UG → PG progression
- **Joining Date**: No future dates, minimum 18 years from DOB

### **Profile Management**
- **Photo Upload**: Secure storage with signed URLs
- **Document Management**: Medical certificates, ID proofs
- **Leave Balance Tracking**: Real-time balance updates
- **Work History**: Complete timesheet and leave history

---

## 📧 Communication & Automation

### **Automated Email Notifications**
- **Welcome Emails**: New employee credentials and login link
- **Leave Alerts**: 
  - Urgent alerts for same-day leaves
  - Status change notifications (approved/rejected)
- **Timesheet Notifications**:
  - Submission confirmations
  - Approval/rejection alerts
- **Hierarchy Changes**: Role updates and manager changes
- **Report Generation**: PDF report download confirmations

### **Cron Jobs (Daily 9:00 AM IST)**
- **Birthday Wishes**: Team-wide celebration emails
- **Pending Reminders**: Daily nudges for pending approvals (24+ hours old)
- **Timesheet Reminders**: Weekly submission reminders

---

## 🛠️ Technical Architecture

### **Backend (Node.js + TypeScript)**
- **Express.js** - RESTful API framework
- **PostgreSQL** - Robust relational database
- **PDFKit** - Professional PDF generation
- **Node-cron** - Scheduled job automation
- **Nodemailer** - Email service integration
- **JWT** - Secure authentication
- **Multer** - File upload handling

### **Frontend (React + TypeScript)**
- **React 18** - Modern UI framework
- **React Query** - Advanced caching and state management
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Lucide Icons** - Beautiful icon library
- **Custom UI Components** - Reusable design system

### **Infrastructure**
- **OVHcloud S3** - Secure file storage
- **Signed URLs** - Time-limited document access
- **Database Migrations** - Version-controlled schema changes
- **Audit Logging** - Complete change tracking
- **Error Handling** - Comprehensive error management

### **Performance Optimizations**
- **React Query Caching**: Second load is instantaneous
- **Optimistic UI**: Updates before server confirmation
- **N+1 Query Prevention**: Efficient database queries
- **Lazy Loading**: Components loaded on demand
- **Code Splitting**: Reduced initial bundle size

---

## 📊 Reporting & Analytics

### **Available Reports**
- **Timesheet Reports**: Detailed work hour breakdowns
- **Leave Reports**: Leave history and balance tracking
- **Team Reports**: Manager view of team activities
- **Audit Reports**: System change tracking

### **Report Features**
- **Multiple Formats**: PDF, CSV export options
- **Advanced Filters**: Multi-level filtering capabilities
- **Searchable Data**: Quick find with search bars
- **Date Ranges**: Flexible date selection
- **Permission-based**: Role-specific data access

---

## 🚀 Getting Started

### **First-Time Login**
1. **Access Portal**: Use your organization email (`@tensorgo.com` or `@tensorgo.co.in`)
2. **Change Password**: Set a permanent password on first login
3. **Complete Profile**: Update personal details and upload photo
4. **Explore Dashboard**: Check leave balances and timesheet status

### **Daily Workflow**
1. **Log Timesheet**: Enter daily work hours with project details
2. **Apply Leaves**: Submit leave requests when needed
3. **Check Approvals**: Monitor status of pending requests
4. **Generate Reports**: Download timesheet reports as needed

### **Manager Workflow**
1. **Review Requests**: Check pending leave and timesheet approvals
2. **Approve/Reject**: Process team requests with comments
3. **Monitor Team**: Track team availability and work hours
4. **Generate Reports**: Create team performance reports

---

## 🎨 UI/UX Highlights

- **Modern Design**: Clean, professional interface
- **Responsive Layout**: Works on desktop, tablet, and mobile
- **Intuitive Navigation**: Easy-to-use menu structure
- **Smart Forms**: Auto-validation and helpful error messages
- **Real-time Updates**: Instant feedback on all actions
- **Searchable Dropdowns**: Quick filtering in all selects
- **Loading States**: Clear indicators for async operations
- **Toast Notifications**: Non-intrusive success/error messages

---

## 🔒 Security Features

- **Role-Based Access Control (RBAC)**
- **JWT Authentication**
- **Password Encryption**
- **Audit Trail Logging**
- **Secure File Storage**
- **Time-limited URLs**
- **Input Validation**
- **SQL Injection Prevention**
- **XSS Protection**

---

## 📝 System Requirements

### **Backend**
- Node.js 18+
- PostgreSQL 14+
- NPM or Yarn

### **Frontend**
- Modern browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- Minimum 1024x768 resolution

---

## 🏁 Quick Start Commands

### **Backend**
```bash
cd backend
npm install
npm run dev
```

### **Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## 📞 Support

For technical support or feature requests, contact the TensorGo Dev Team.

---

*Built with ❤️ by the TensorGo Development Team*

**Version**: 2.0  
**Last Updated**: January 2026
