# 🚀 TensorGo LMS - Complete User & System Guide

Welcome to the **TensorGo Leave Management System (LMS)**. This portal is a comprehensive HR solution designed to manage the entire lifecycle of an employee while providing a robust, rule-based engine for leave tracking and organizational hierarchy management.

---

## 👥 1. User Roles & Responsibilities
The system is built on a strict **Role-Based Access Control (RBAC)** model. Each role has specific permissions tailored to their position in the company.

### **🛡️ Super Admin**
The "God Mode" of the system. 
- **System Configuration**: Manage global settings, holiday lists, and infrastructure keys.
- **Ultimate Authority**: Can edit, approve, or delete any record in the system, bypassing hierarchy constraints if necessary.
- **User Management**: Creating and managing high-level roles like HR and other Admins.
- **Security Oversight**: Monitoring audit logs and managing sensitive infrastructure data.

### **💼 Human Resources (HR)**
The primary operators of the personnel database.
- **Employee Lifecycle**: Handing everything from "Onboarding" (creating new records) to "Exit" (marking as resigned/inactive).
- **Compliance**: Ensuring all employee documents (PAN, Aadhar) are valid and formatted correctly.
- **Manual Leave Allocation**: Power to grant additional leaves to any employee for rewards or special cases.
- **Infrastructure Management**: Managing the organizational structure and reporting lines for everyone except Super Admins.
- **Hierarchy Boundary**: Cannot edit other HR users or Super Admins to ensure mutual accountability.

### **👔 Manager**
The frontline decision-makers for their teams.
- **Team Oversight**: Real-time view of direct reports, their leave history, and current balances.
- **Leave Approvals**: Authority to Approve, Reject, or **Partially Approve** (approving only specific days) leave requests.
- **Reporting**: Monitoring team availability to ensure project continuity.

### **👤 Employee / Intern**
The self-service users.
- **Leave Application**: Submitting requests with smart validation (prevents picking holidays, weekends, or overlapping dates).
- **Personal Dashboard**: Tracking personal leave balances (Casual, Sick, LOP) and application history.
- **Profile Management**: Updating personal details and uploading profile photos.
- **Security**: Forced password change on first login to ensure account integrity.

---

## 📅 2. The Smart Leave Engine (Core Logics)
Our system doesn't just record dates; it applies complex business logic to ensure company policies are automatically enforced.

### **Leave Type Breakdown**
| Leave Type | Logic | Monthly Cap | Key Feature |
| :--- | :--- | :--- | :--- |
| **Casual** | Exclusive | 10 Days | Requires advance notice. Excludes weekends/holidays. |
| **Sick** | Exclusive | Unlimited* | 3-day past-date buffer. Future requests only for "Tomorrow". |
| **LOP (Loss of Pay)** | **Inclusive** | 5 Days | **Harsh Logic:** Weekends/Holidays are *counted* if within the period. |
| **Permission** | Special | Hourly | Max 2 hours per request. Restricted to 10 AM - 7 PM window. |

### **Advance Notice Logic (Casual Leave)**
To ensure team planning, the system enforces the following notice periods:
- **Small (0.5 - 2 Days)**: Must apply **3 days** in advance.
- **Medium (3 - 5 Days)**: Must apply **1 week (7 days)** in advance.
- **Large (> 5 Days)**: Must apply **1 month (30 days)** in advance.

### **"On Notice" Status Logic**
When an employee resigns and is in their notice period:
- **Casual Leave is DISABLED**: To ensure they are available for handovers.
- **Restricted Access**: They can only apply for *Sick*, *LOP*, or *Permission*.

### **The "Inclusive" LOP Rule**
If an employee takes LOP from Friday to Monday:
- **Casual Logic**: Counts as 2 days (Fri, Mon).
- **LOP Logic**: Counts as 4 days (Fri, **Sat, Sun**, Mon).

---

## 🏗️ 3. Organizational Hierarchy & Automated Flow
The system manages a deep **L1 ➔ L2 ➔ L3** reporting chain to ensure no action goes unmonitored.

- **Primary Approver (L1)**: Usually the Manager.
- **Secondary Oversight (L2)**: Usually the HR.
- **Global Oversight (L3)**: The Super Admin.

### **⚡ Automated Reassignment (The "Safety Net")**
If a Manager's status is changed to *Resigned*, *Inactive*, or *Terminated*:
1.  **Detection**: The system scans for all employees reporting to that manager.
2.  **Re-routing**: Every reportee is automatically moved to report to the **Super Admin**.
3.  **Notification**: An automated "Reporting Manager Changed" email is sent to every affected employee.

---

## 📋 4. Employee Management & Validation Logic
HR/Admins are guided by strict validation to maintain high data quality:
- **Identity Documents**: PAN cards must follow the `ABCDE1234F` regex. Aadhar must be exactly 12 digits.
- **Age Integrity**: Prevents onboarding anyone under **18 years old**.
- **Educational Gaps**: Validates that 12th happened before UG, and UG before PG.
- **Joining Verification**: Prevents "Future" joining dates and ensures at least 18 years gap from DOB.

---

## � 5. Communication & Automation
The portal never sleeps, thanks to integrated background services.

### **Automatic Email Notifications**
- **Welcome**: New employees get their credentials and a secure login link.
- **Leave Actions**: Managers get "Urgent" alerts for same-day leaves; Employees get "Status Changed" alerts for approvals.
- **Hierarchy Changes**: Alerts for role updates or manager shifts.

### **Cron Jobs (Daily 9:00 AM IST)**
- **Birthday Wishes**: Team-wide emails celebrating birthdays (CC'ing the whole team).
- **Pending Reminders**: Daily nudges to Managers who have pending leave requests older than 24 hours.

---

## 🛠️ 6. Technical Excellence (For Admins)
- **High Performance**: Uses **React Query** for caching. If two users check the same profile, the second load is instantaneous.
- **Zero Latency (Optimistic UI)**: When you approve a leave, the UI updates *immediately* before the server even confirms the database update.
- **Secure File Storage**: Medical certificates and photos are stored in **OVHcloud (S3-Compatible)** using time-limited "Signed URLs" (links that expire for security).
- **N+1 Optimization**: Critical API endpoints are optimized to handle thousands of records without slowing down the browser.

---

## 🏁 7. Getting Started
1.  **Login**: Use your organization email (`@tensorgo.com` or `@tensorgo.co.in`).
2.  **Change Password**: You will be prompted to set a permanent password on first login.
3.  **Explore**: Check your 'Leave History' or apply for your first leave on the 'Apply Leave' page.

---
*Created with ❤️ by the TensorGo Dev Team*
