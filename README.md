# TensorGo LMS - HR Leave Management System

A comprehensive, production-ready HR Leave Management System (LMS) designed to streamline employee leave tracking, approvals, and personnel management. Built with a modern tech stack ensuring performance, scalability, and a premium user experience.

## 🚀 Features

### 👤 Role-Based Access Control
- **Super Admin**: Full system control, including admin management.
- **HR**: Employee lifecycle management, leave oversight, and reporting.
- **Manager**: Team oversight and leave approval workflows.
- **Employee**: Self-service portal for leave applications and profile management.

### 📅 Leave Management
- **Smart Application**: Intuitive interface for applying for leaves (Casual, Sick, LOP, etc.).
- **Day-wise Breakdown**: Support for multi-day leaves with half-day options.
- **Approval Workflow**: Hierarchical approval process enforcing manager review.
- **Leave History**: Real-time tracking of past and current leave requests with status updates.
- **Balance Tracking**: Automated tracking of available leave balances.

### 👥 Employee Management (HR/Admin)
- **Centralized Directory**: Searchable list of all employees with advanced filtering (Active/Inactive, Search by Name/ID).
- **CRUD Operations**: Add, view, edit, and delete employee records.
- **Onboarding**: Comprehensive form for personal, professional, and educational details.
- **Direct Leave Assignment**: HR/Admins can grant leaves directly to employees.
- **Live Updates**: "Leave History" view automatically fetches the latest data without page reloads.

### 🔐 Security & Profile
- **Secure Authentication**: JWT-based login system.
- **Profile Management**: Employees can view and manage their personal details.
- **Password Management**: Secure password change functionality.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: React Query (TanStack Query) for efficient server state management
- **Routing**: React Router v6
- **Styling**: Vanilla CSS with modern aesthetics, `clsx`, `tailwind-merge`
- **UI Components**: Radix UI primitives, React Icons, Lucide React
- **Forms**: React Hook Form + Zod validation
- **Date Handling**: `date-fns`, `react-day-picker`

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript
- **Database**: PostgreSQL 14+
- **ORM/Querying**: Raw SQL / `pg` (with structured service layer)
- **Validation**: Zod
- **Authentication**: JSON Web Tokens (JWT)
- **Logging**: Winston

## 📂 Project Structure

```
TensorGo-LMS/
├── backend/          # Express.js API server
│   ├── src/
│   │   ├── controllers/
│   │   ├── database/    # Migrations & Seeds
│   │   ├── routes/
│   │   ├── services/
│   │   └── ...
├── frontend/         # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/    # API integrations
│   │   └── ...
└── README.md
```

## 🏁 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

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

## 📄 License
Proprietary software developed for TensorGo.
