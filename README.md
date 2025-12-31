# TensorGo LMS - HR Leave Management System

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
  - Special logic for short absences.
  - Restricted to max **2 hours**.
  - Must be within office hours.
- **Validation**:
  - **Sick Leave**: Can be applied for past 3 days (retrospective) or future dates (limited to next day).
  - **Casual Leave**: Must be applied at least 3 days in advance (blocks immediate future dates).
  - **Overlap Detection**: Real-time checking against existing approved/pending leaves to prevent conflicts.
  - **Weekend Handling**: Automatic calculation of leave days excluding weekends.
  - **Half-Day Support**: Flexible "First Half" or "Second Half" selection.
- **Documentation**: File upload support for medical certificates (required for Sick leaves).

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
