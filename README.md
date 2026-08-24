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
git clone https://github.com/christian1-malonga/AVC-CLOUD-APP.git
cd AVC-CLOUD-APP
