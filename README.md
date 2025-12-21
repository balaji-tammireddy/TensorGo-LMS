# HR Leave Management System

A production-ready HR Leave Management Web Application built with React, Express.js, and PostgreSQL.

## Features

- Role-based access control (Employee, Manager, HR, Super Admin)
- Leave application and approval workflow
- Employee management (HR only)
- Profile management
- Multi-day leave day-wise breakdown
- Approval hierarchy enforcement
- Real-time notifications

## Tech Stack

### Frontend
- React 18+ with TypeScript
- React Router v6
- React Query for server state
- React Hook Form + Zod for validation
- Axios for API calls
- Poppins font (SemiBold for headings)

### Backend
- Express.js with TypeScript
- PostgreSQL 14+
- JWT authentication
- Zod validation
- Winston logging

## Project Structure

```
TG-LMS/
├── backend/          # Express.js API server
├── frontend/         # React SPA
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE hr_lms;
```

2. Update `backend/.env` with your database credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hr_lms
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your-super-secret-jwt-key
```

### Backend Setup
```bash
cd backend
npm install
npm run migrate    # Creates database schema
npm run seed       # Creates sample users (optional)
npm run dev        # Starts development server on port 5000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev        # Starts development server on port 3000
```

### Default Login Credentials (from seed)

- **Super Admin**: admin@tensorgo.com / admin123
- **HR**: hr@tensorgo.com / hr1234
- **Manager**: balaji@tensorgo.com / manager123
- **Employee**: jaiwanth@tensorgo.com / emp123

## Default Roles

- **Employee**: Can apply leave, view own profile
- **Manager**: Can approve direct reports' leaves
- **HR**: Can manage employees, approve manager leaves
- **Super Admin**: Full access to all features

## License

Proprietary

