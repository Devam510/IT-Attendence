# NEXUS — Enterprise Workforce Management

<p align="center">
  <strong>Real-time attendance tracking, leave management, and workforce analytics</strong>
</p>

<p align="center">
  <a href="https://it-attendence-web.vercel.app">🌐 Live Demo</a> •
  <a href="#features">✨ Features</a> •
  <a href="#tech-stack">🛠 Tech Stack</a> •
  <a href="#getting-started">🚀 Getting Started</a>
</p>

---

## ✨ Features

### 🕐 Attendance Management
- **Geofenced Check-in/Check-out** — GPS-based with 100m radius enforcement
- **Device Session Binding** — prevents buddy clock-ins; check-out must be from the same device
- **Interactive Calendar** — click any past date to view check-in/out times, working hours, and verification score
- **Live Timer** — real-time elapsed time display while checked in
- **IST Timezone Support** — times always displayed correctly regardless of server location

### 📋 Leave Management
- **Apply for Leave** — select leave type (Casual, Sick, Earned), date range, and reason
- **Leave Balance Tracking** — real-time view of available, used, and pending leave days
- **Approval Workflow** — managers approve/reject their team's leaves; HR sees company-wide
- **Leave Balance Updates** — auto-debit on approval, auto-release on rejection

### ✅ Approvals
- **Pending Requests** — managers see their team's pending leave requests
- **Approve/Reject** — individual or bulk actions with optional comments
- **Role-Based Filtering** — Managers see direct reports, HR sees all, Admin sees everything
- **Status Filters** — filter by Pending, Approved, Rejected + type filters (Leave, WFH, Overtime)

### 🛡️ Security Dashboard
- **Risk Score** — real-time organizational security assessment
- **Security Events** — login attempts, anomalies, and threats table
- **Anomaly Detection** — flagged suspicious activities with severity indicators
- **Geographic Access Map** — activity location visualization
- **Access Restricted** — only HR Admin and Super Admin can view

### 📊 Dashboard
- **Employee Dashboard** — attendance summary, leave balance, recent activity
- **Manager Dashboard** — team overview, pending approvals, attendance trends

### 👤 Profile
- **Personal Info** — department, manager, join date, work location
- **Dark Mode Toggle** — system-wide theme switching
- **Security Settings** — MFA status, active sessions, password change

### 🔒 Security Features
- **JWT Authentication** — access + refresh token flow
- **SHA-256 Password Hashing**
- **MFA Ready** — TOTP-based two-factor authentication support
- **Audit Logging** — all actions logged with hash chain integrity
- **Device Trust** — session tokens bound to check-in device
- **Rate Limiting** — with Redis graceful degradation

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Vanilla CSS with design tokens, dark mode |
| **Backend** | Next.js API Routes, Prisma ORM |
| **Database** | PostgreSQL (Neon serverless) |
| **Auth** | JWT (jose library), SHA-256, TOTP |
| **Deployment** | Vercel |
| **Monorepo** | Turborepo |

### Project Structure

```
nexus/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/
│       │   ├── (app)/          # Authenticated pages
│       │   │   ├── attendance/ # Check-in/out, calendar
│       │   │   ├── leaves/     # Apply, history
│       │   │   ├── approvals/  # Manager approvals
│       │   │   ├── dashboard/  # Employee/Manager dashboards
│       │   │   ├── profile/    # User profile & settings
│       │   │   ├── security/   # Security dashboard
│       │   │   ├── notifications/
│       │   │   └── admin/      # Audit logs, system health
│       │   └── api/            # Backend API routes
│       │       ├── attendance/ # checkin, checkout, today, history
│       │       ├── leaves/     # apply, balance, history, respond
│       │       ├── approvals/  # pending, respond, bulk
│       │       ├── auth/       # login, token refresh
│       │       ├── dashboard/  # employee, manager
│       │       ├── profile/    # view, update
│       │       └── audit-logs/ # security events
│       ├── context/            # Auth, Theme providers
│       ├── lib/                # api-client, auth, audit, errors
│       └── styles/             # CSS design system
├── packages/
│   ├── db/                     # Prisma schema, seed, migrations
│   └── shared/                 # Shared types, schemas, constants
└── turbo.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (or [Neon](https://neon.tech) account)

### Installation

```bash
# Clone the repository
git clone https://github.com/Devam510/IT-Attendence.git
cd nexus

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Run database migrations
cd packages/db
npx prisma migrate deploy

# Seed the database
npx tsx src/seed.ts

# Start development server
cd ../..
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:pass@host:5432/dbname"
JWT_SECRET="your-secret-key"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
REDIS_URL="redis://..." # Optional — graceful degradation if unavailable
```

---

## 👥 Test Accounts

All accounts use password: **`Nexus@123`**

| Role | Email | Name | Access |
|------|-------|------|--------|
| **Super Admin** | admin@nexus.dev | Arjun Mehta | Full system access |
| **HR Admin** | priya@nexus.dev | Priya Sharma | HR functions, all employees |
| **Manager** | rahul@nexus.dev | Rahul Verma | Team management, approvals |
| **Employee** | neha@nexus.dev | Neha Gupta | Self-service |
| **Employee** | amit@nexus.dev | Amit Patel | Self-service |
| **Employee** | sara@nexus.dev | Sara Khan | Self-service |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email + password |
| POST | `/api/auth/token` | Refresh access token |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance/today` | Today's check-in/out status |
| GET | `/api/attendance/history?month=2026-03` | Monthly calendar data |
| POST | `/api/attendance/checkin` | GPS check-in with device binding |
| POST | `/api/attendance/checkout` | Check-out with session token |

### Leaves
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leaves/apply` | Submit leave request |
| GET | `/api/leaves/balance` | Leave balance summary |
| GET | `/api/leaves/history` | Leave request history |
| POST | `/api/leaves/respond` | Approve/reject a leave |

### Approvals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/approvals/pending?status=pending` | Pending approval items |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile` | User profile data |
| GET | `/api/dashboard/employee` | Employee dashboard metrics |
| GET | `/api/dashboard/manager` | Manager dashboard metrics |
| GET | `/api/audit-logs` | Audit event log (Admin/HR only) |

---

## 🔐 Security Architecture

- **Authentication**: JWT access tokens (15min) + refresh tokens (7 days)
- **Password Storage**: SHA-256 hashed (no plaintext)
- **Device Binding**: Unique session token on check-in, enforced on check-out
- **Geofencing**: GPS coordinates validated against office location (100m radius)
- **Audit Trail**: Every action logged with actor, timestamp, IP, and hash chain
- **Role-Based Access**: API routes enforce role permissions (EMP, MGR, HRA, SADM)
- **CSRF Protection**: Token-based API authentication
- **Graceful Degradation**: Redis/BullMQ failures don't crash the application

---

## 🗺 Roadmap

- [ ] Mobile app (React Native) with biometric check-in
- [ ] Shift management and rotation scheduling
- [ ] Payroll integration
- [ ] AI-powered attendance insights
- [ ] Multi-location support
- [ ] SSO/SAML integration
- [ ] Push notifications

---

## 📄 License

This project is private and proprietary.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/Devam510">Devam Patel</a>
</p>
