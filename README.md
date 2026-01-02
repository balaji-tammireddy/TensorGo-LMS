# TensorGo LMS - HR Management System

A comprehensive, production-ready HR Leave Management System (LMS) designed to streamline employee leave tracking, approvals, and personnel management. Built with a modern tech stack ensuring performance, scalability, and a premium user experience.

## 🚀 Features

### 👤 Role-Based Access Control
- **Super Admin**: 
  - Complete control over the system.
  - Can manage HR, Managers, and Employees.
  - View and edit all leave records.
  - Bypass approval hierarchies if necessary.
- **HR**: 
  - Full employee lifecycle management (Onboarding to Exit).
  - Can view and manage leave history for all employees.
  - Override manager decisions if required.
- **Manager**: 
  - View team structure and direct reports.
  - Approve or reject leave applications.
  - Track team leave balances.
- **Employee**: 
  - Self-service portal for leave applications.
  - View personal leave history and balances.
  - Manage personal profile.

### 📅 Advanced Leave Management

#### 📝 Leave Application
- **Multiple Leave Types**: Support for **Casual**, **Sick**, **LOP** (Loss of Pay), and **Permission**.
- **Permission Leave**: 
  - Special logic for short absences (max **2 hours**).
  - Restricted to office hours (10 AM - 7 PM).
- **Validation & Business Logic**:
  - **LOP (Loss of Pay)**: Inclusive logic—Saturdays, Sundays, and Holidays are **counted** as leave days if they fall within the LOP period.
  - **Casual/Sick Leave**: Exclusive logic—Weekends and Holidays are automatically **excluded** from the duration.
  - **Sick Leave**: Retrospective application (past 3 days) supported; future dates restricted to next day.
  - **Casual Leave**: Requires 3 days advance notice.
  - **Overlap Detection**: Real-time checking across all request statuses (Approved, Pending, Partially Approved).
- **Documentation**: S3-backed file upload for medical certificates (Sick leave).
- **LOP to Casual Conversion**: HR/Admins can instantly convert an LOP request to Casual leave with automatic balance reconciliation and duration recalculation.

#### ✅ Approval Workflow
- **Dashboard**: Centralized "Pending Requests" view for Managers/HR.
- **Filtering**: Filter requests by Leave Type (Casual, Sick, LOP) or Status.
- **Search**: Quick search by Employee Name or ID.
- **Batch Actions**: Bulk approve or reject leaves for efficiency.
- **Granular Control**: Approve specific days within a multi-day request while rejecting others.
- **Optimistic UI**: Instant feedback on actions before server confirmation for a snappy experience.
- **LOP Conversion**: Ability for HR/Admin to convert LOP requests to Casual leave.

#### 📊 History & Tracking
- **Live Updates**: "Leave History" view automatically fetches the latest data without page reloads.
- **Status Tracking**: Clear visual indicators for Pending, Approved, Rejected, and Partially Approved states.
- **Balance Tracking**: Automated deduction and tracking of available leave balances.
- **Holiday Calendar**: Integrated holiday list view customized by year.

### 🚀 Performance & UX Optimization

#### ⚡ Backend Performance
- **N+1 Query Resolution**: Refactored major API endpoints (`getMyLeaveRequests`, `getPendingLeaveRequests`, `getApprovedLeaves`) to fetch data in efficient batches. This eliminates database bottlenecks and ensures smooth table loading even with thousands of records.
- **Gzip Content Compression**: All API responses are compressed using Gzip, reducing payload sizes by up to 80% and improving load times on slower networks.
- **Efficient Caching**: Implemented intelligent cache headers for static assets (profile photos, medical certificates) and optimized `React Query` cache times for frequently accessed data.

#### 🎨 Snappy User Experience
- **True Optimistic Updates**: Leave applications and balance changes are reflected in the UI **instantly**. The system predicts the result and updates the cache before the server even responds, creating a zero-latency feel.
- **Intelligent Data Prefetching**: Profile data, leave balances, and holidays are proactively loaded in the background as soon as a user logs in, making the first click on any module feel instantaneous.
- **Localized Loading States**: Replaced jarring full-page loaders with refined, localized skeleton states and background "fetching" indicators. This ensures the UI remains stable and interactive during data refreshes.
- **Memoized Logic**: Complex data processing and filtering (e.g., in the Leave Approval dashboard) are wrapped in `useMemo` to prevent UI jank during high-frequency interactions.

### � Email Services & Automation
- **Email Notifications**: 
  - Powered by **Nodemailer** using SMTP (Gmail/Custom).
  - Reliable delivery with error handling and logging.
- **Automated Cron Jobs**: 
  - **Daily Reminders (9:00 AM)**: auto-emails Managers and HR about pending leave requests.
  - **Birthday Wishes (9:00 AM)**: Sends automated birthday greetings to employees, CC'ing the rest of the team.
- **Smart Scheduling**: Uses `node-cron` for precise timing and timezone management (Asia/Kolkata).

### ☁️ Cloud Storage & Security
- **Object Storage**: Integrated with **OVHcloud** (S3-compatible) for secure file storage.
- **Signed URLs**: Generates time-limited signed URLs for private file access (e.g., medical certificates).
- **Public URLs**: Supports public access for non-sensitive assets like profile placeholders.
- **Secure Authentication**: JWT-based login system with auto-expiry handling.
- **Force Password Change**: Security feature forcing users to change default passwords on first login.
- **Profile Management**:
  - **Photo Upload**: Secure profile picture upload directly to cloud storage.
  - **Data Privacy**: Employees can view but not edit sensitive employment fields (Role, Department, etc.).

### 👥 Employee Management (HR/Admin)
- **Centralized Directory**: Searchable list of all employees with advanced filtering.
- **Onboarding**: Comprehensive multi-step form capturing Personal, Employment, Document (Aadhar/PAN), and Educational details.
- **Validation**: Strict validation for PAN format, Aadhar length (12 digits), Age (18+), and Phone numbers.
- **Direct Leave Assignment**: HR/Admins can grant leaves directly to employees.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: React Query (TanStack Query) for efficient server state management and caching.
- **Routing**: React Router v6
- **Styling**: Vanilla CSS with modern aesthetics, `clsx`, `tailwind-merge`.
- **UI Components**: Radix UI primitives, React Icons, Lucide React.
- **Forms**: React Hook Form + Zod validation.
- **Date Handling**: `date-fns` for robust date math and formatting.

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript
- **Database**: PostgreSQL 14+
- **ORM/Querying**: Raw SQL / `pg` (custom service layer for performance).
- **Validation**: Zod schema validation.
- **Authentication**: JSON Web Tokens (JWT).
- **Logging**: Winston logger.
- **Email**: Nodemailer + SMTP.
- **Scheduling**: Node-cron.
- **Storage**: AWS SDK v3 (S3 Client) for OVHcloud.

## 📂 Project Structure

```
TensorGo-LMS/
├── backend/          # Express.js API server
│   ├── src/
│   │   ├── controllers/ # Request handlers
│   │   ├── services/    # Business logic & DB interaction
│   │   ├── routes/      # API route definitions
│   │   ├── utils/       # Helpers (Email, Storage, Cron, Logger)
│   │   ├── database/    # Migrations & Seeds
│   │   └── ...
├── frontend/         # React + Vite SPA
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route components (Logic heavy)
│   │   ├── services/    # Axios API integrations
│   │   └── ...
└── README.md
```

## 🏁 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- OVHcloud / S3 Credentials (for file uploads)
- SMTP Credentials (for emails)

### 1. Database Setup
Create a PostgreSQL database named `hr_lms`.
```sql
CREATE DATABASE hr_lms;
```

Update `backend/.env` with your credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hr_lms
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your-super-secret-jwt-key

# Email Config
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=tapp-password

# OVHcloud / S3 Config
OVH_ENDPOINT=https://s3.gra.cloud.ovh.net
OVH_REGION=gra
OVH_BUCKET_NAME=your-bucket
OVH_ACCESS_KEY=your-access-key
OVH_SECRET_KEY=your-secret-key
```

### 2. Backend Setup
```bash
cd backend
npm install
npm run migrate    # Creates database schema
npm run seed       # Populates default users
npm run dev        # Starts server on port 5000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev        # Starts client on port 5173 (or 3000)
```

## 🔑 Default Login Credentials
*(From default seed data)*

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | admin@tensorgo.com | admin123 |
| **HR** | hr@tensorgo.com | hr1234 |
| **Manager** | balaji@tensorgo.com | manager123 |
| **Employee** | jaiwanth@tensorgo.com | emp123 |
