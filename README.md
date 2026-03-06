# Vibe Tech Labs — Enterprise Workspace

<p align="center">
  <strong>Custom enterprise HR and attendance tracking dashboard built for Vibe Tech Labs.</strong>
</p>

<p align="center">
  <a href="https://it-attendence-web.vercel.app">🌐 Live Demo</a> •
  <a href="#features">✨ Features</a> •
  <a href="#tech-stack">🛠 Tech Stack</a> •
  <a href="#getting-started">🚀 Getting Started</a>
</p>

---

## 🏢 About

This project is a custom-built Next.js enterprise application developed exclusively for **Vibe Tech Labs** to handle employee authentication, daily attendance logs, leave management, and administrative monitoring dashboards. It provides a seamless, secure, and intuitive workforce management experience.

---

## ✨ Features

### 🕐 Attendance Management
- **Geofenced Check-in/Check-out** — GPS-based with 100m radius enforcement around the Vibe Tech Labs office
- **Device Session Binding** — Prevents buddy clock-ins; check-out must be from the same device
- **Interactive Calendar** — Click any past date to view check-in/out times, working hours, and verification scores
- **Remarks on Check-in** — Optional remark field for employees arriving late
- **IST Timezone Support** — Times clearly displayed regardless of server or user locale

### 📋 Leave Management & Approvals
- **Apply for Leave** — Select leave type, date range, and supply reasoning
- **Leave Balance Tracking** — Real-time view of available, used, and pending leave days
- **Manager Approval Workflow** — Managers approve/reject their team's leaves; HR manages company-wide
- **Status Filters** — Filter by Pending, Approved, Rejected + type filters (Leave, WFH, Overtime)

### 🛡️ Security Dashboard (Admin/HR Only)
- **Risk Score** — Real-time organizational security assessment
- **Security Events Table** — Login attempts, anomalies, and active threats
- **Geographic Access Map** — Activity location visualization

### 👤 User Profiles & Password Management
- **Personal Info** — Role, department, manager, join date, work location
- **Account Security** — Secure password changing interface with strength indicators

### 🔒 Security Implementations
- **Login Options** — Login securely via Employee ID or Email
- **JWT Authentication** — Access + refresh token flow
- **SHA-256 Encryption** — Secure password hashing
- **Audit Logging** — All critical actions logged with hash chain integrity

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript |
| **Styling** | Vanilla CSS with custom design tokens for a premium UI |
| **Backend** | Next.js API Routes, Prisma ORM |
| **Database** | PostgreSQL (Neon serverless) |
| **Auth** | Custom JWT (jose library), SHA-256 |
| **Deployment** | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (or Neon account)

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

## 🗺 Roadmap

- [ ] Desktop Monitoring Agent integration
- [ ] Shift management and rotation scheduling
- [ ] Multi-location support for expanded offices
- [ ] SSO/SAML integration

---

## 📄 License

This project is private and proprietary to Vibe Tech Labs.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/Devam510">Devam Patel</a>
</p>
