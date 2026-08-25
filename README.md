# 🎵 AVC Cloud — St. Barnabas Amazing Voices Choir

> A modern, role-based cloud management platform built for the St. Barnabas Amazing Voices Choir.  
> Members, music, meetings, money and ministry — all in one place.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)
![Node](https://img.shields.io/badge/Node-22-339933?logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 📖 Overview

**AVC Cloud** is a full-stack web application designed to digitize the daily operations of the St. Barnabas Amazing Voices Choir. It replaces paper registers, WhatsApp voice notes, and scattered Excel sheets with a single, beautiful, mobile-friendly dashboard.

Every role in the choir — from the President to the newest chorister — gets a tailored experience with exactly the tools they need and nothing more.

---

## ✨ Key Features

### 👥 Role-Based Access Control
Seven distinct roles, each with precisely scoped permissions:

| Role | Responsibilities |
|------|-----------------|
| 🛡️ **Admin** | Full system control, user management, role assignment |
| 👑 **President** | Oversight, approvals, audit log viewing, dues settings |
| 📝 **Secretary** | Meeting minutes, announcements, document management |
| ⚖️ **Provost** | Discipline, probation, attendance marking |
| 🎵 **Custodian** | Music library, voice notes, song uploads |
| 🗳️ **Electoral** | Election management, nominations, polls |
| 🎤 **Member** | Personal dashboard, view library, pay dues, vote |

### 🎼 Music Library
- Upload MP3, PDF scores, and MIDI files
- Categorized by voice part (Soprano, Alto, Tenor, Bass, SATB Full)
- In-browser audio playback with progress tracking
- Search by title, tag, or occasion

### 💰 Financial Management
- **Weekly Dues** — automatic tracking per member per week
- **Absence & Lateness Dues** — recorded by the Provost
- **Debt Tracker** — live balance, partial payments, payment history
- **Receipts** — upload and categorize supporting documents
- CSV export for the Treasurer

### 🗳️ Election Centre
- Build nomination lists from approved members
- Create polls with multiple candidates per post
- Go live, close, and publish final results
- Real-time animated result bars

### 🎙️ Voice Notes
- Record rehearsal guides directly in the browser
- Waveform visualizer during playback
- Per-note titles and uploader attribution

### 📋 Minutes & Documents
- Secretary publishes meeting minutes in rich text
- Categorized document vault (Meetings, General, Announcements)
- Full history with author + role-at-time stamps

### 📅 Attendance
- Manual tick roster for Provost
- Time-limited QR code check-in for members
- Per-member attendance rate and history

### ⚖️ Probation Register
- Place, extend, and release members
- Full event history that is **never deleted**
- Expiry alerts for probations ending within 7 days

### 🔐 Security
- Audit log of every state-changing action (President/Admin view)
- JWT-based authentication with role-at-time stamping
- Optional Google OAuth sign-in
- All sensitive data behind authenticated routes

### 📱 Responsive Design
- Mobile-first layout with collapsible sidebar
- Touch-optimized controls
- Works flawlessly on phones, tablets, and desktops

---

## 🏗️ Tech Stack

### Frontend (`/client`)
- **React 19** — UI framework
- **Vite 8** — lightning-fast dev server and bundler
- **Framer Motion** — fluid animations
- **Recharts** — beautiful data visualizations
- **Lucide React** — consistent icon set
- **Tailwind-style custom CSS** — navy + gold theme matching the choir identity

### Backend (`/server`)
- **Node.js 22 + Express**
- **MongoDB + Mongoose** — flexible document storage
- **JWT + bcrypt** — secure authentication
- **Multer** — file uploads
- **google-auth-library** — Google OAuth verification *(optional)*

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 22 LTS** or higher — [download](https://nodejs.org/)
- **MongoDB 8** (local) or a free MongoDB Atlas cluster
- **npm 10+** (ships with Node)

### 1. Clone the repository
```bash
git clone https://github.com/samsax1805/AVC-CLOUD-APP.git
cd AVC-CLOUD-APP

2. Start the backend
cd server
npm install
cp .env.example .env        # edit with your MongoDB URI + JWT secret
npm run seed                # creates the 7 demo accounts
npm run dev                 # starts API on http://localhost:5000

3. Start the frontend (in a new terminal)
cd client
npm install
npm run dev                 # starts app on http://localhost:5173

** QRCODE EXTENSION INSTALLATION: npm install react-router-dom qrcode lucide-react socket.io-client

4. (Optional) Enable real Google Sign-In
Go to Google Cloud Console → Credentials
Create an OAuth 2.0 Client ID (Web application)
Add http://localhost:5173 to Authorized JavaScript origins
Copy the Client ID into client/.env:
   VITE_GOOGLE_CLIENT_ID=xxxxxx.apps.googleusercontent.com

Restart the frontend.
Without this, the Google button runs in sandbox mode and signs you in as a demo Google account.

🔑 Demo Accounts
Every account uses the password demo123:

Email                          Role                                    Purpose
admin@choircloud.com           Admin                               Full system access
president@choircloud.com      President                            Executive oversight
secretary@choircloud.com      Secretary                            Minutes & documents
provost@choircloud.com         Provost                          Discipline & attendance
custodian@choircloud.com      Custodian                              Music library
electoral@choircloud.com      Electoral                              Elections
miriam@choircloud.com          Member                       Regular chorister (Soprano)


🌐 API Endpoints (for the backend team)
All endpoints are prefixed with /api.

Authentication
Method                      Endpoint                      Purpose
POST                      /auth/login               Email + password login
POST                     /auth/register             New member registration
POST                      /auth/google                Google OAuth sign-in
POST                      /auth/section               Set choir voice part
POST                   /auth/forgot-password            Request reset link
POST                   /auth/reset-password           Confirm password reset
GET                         /auth/me                     Get current user


Members
Method                     Endpoint                       Purpose
GET                        /members                   List all members
PATCH                  /members/:id/role                 Update role
POST                  /members/:id/approve          Approve pending member
DELETE                    /members/:id                  Remove member

Music
Method                      Endpoint                       Purpose
GET                          /songs                     List library
POST                         /songs              Upload new song (multipart)
PATCH                      /songs/:id                     Edit song
DELETE                     /songs/:id                   Delete song


Attendance, Debts, Dues, Minutes, Elections, Voice Notes, Receipts, Probation, Audit

Similar CRUD shapes — see inline [BACKEND] comments in the frontend source for exact payloads.


📂 Project Structure
AVC-CLOUD-APP/
├── client/                   # React + Vite frontend
│   ├── public/               # Static assets (logo, favicon)
│   ├── src/
│   │   ├── components/       # AppShell, Sidebar, UI primitives
│   │   ├── context/          # AuthContext, DataContext, ToastContext
│   │   ├── data/             # Mock/seed data
│   │   ├── hooks/            # usePermissions, use-mobile
│   │   ├── pages/            # One file per feature (Login, Dashboard, etc.)
│   │   ├── services/         # Axios API client
│   │   ├── styles/           # Global CSS + themes
│   │   ├── utils/            # Helpers, formatters
│   │   ├── App.jsx           # Root component
│   │   └── main.jsx          # Entry point
│   ├── .env                  # VITE_GOOGLE_CLIENT_ID
│   └── package.json
│
├── server/                   # Express + MongoDB backend
│   ├── models/               # Mongoose schemas
│   ├── routes/               # Express routers
│   ├── middleware/           # Auth, upload, error handling
│   ├── seed.js               # Demo user seeder
│   └── package.json
│
├── README.md
├── LICENSE
└── .gitignore


🎨 Design Philosophy
Navy #1a2c60 + Gold #e9a63a — the choir's official colours
Serif headings — dignified, hymnal-inspired typography
Generous whitespace — calm, focused, distraction-free
Motion with purpose — Framer Motion only where it adds meaning


🤝 Contributing
Contributions are welcome! Please:
Fork the repository
Create a feature branch (git checkout -b feature/amazing-feature)
Commit your changes (git commit -m 'Add amazing feature')
Push to the branch (git push origin feature/amazing-feature)
Open a Pull Request

📜 License
This project is licensed under the MIT License — see the LICENSE file for details.

🙏 Acknowledgments
Built with ❤️ for the St. Barnabas Amazing Voices Choir
"Sing Praises to the Lord" — Psalm 149:1


