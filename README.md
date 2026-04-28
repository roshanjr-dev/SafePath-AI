# Emergency Lifeline

AI-powered indoor evacuation system for real-time emergency response.

---

## Problem

In indoor emergencies such as fires, people lack real-time guidance.  
GPS fails indoors, and evacuation becomes chaotic and dangerous.

---

## Solution

Emergency Lifeline provides:

- QR-based indoor positioning  
- Real-time user tracking  
- AI-powered safest path navigation  
- Dynamic rerouting during hazards  

---

## Features

- QR-based indoor location detection  
- Admin dashboard for live user monitoring  
- Fire detection using 3-user verification (consensus logic)  
- AI-powered safe path navigation (avoids danger zones)  
- Smart stair selection for safe exit routing  
- Floor-wise user tracking  
- "I am Safe" confirmation system  
- Admin controls (mark rooms safe / fire resolved)  
- Automatic room status updates based on user movement  
- AI-based fire spread prediction (time-to-risk estimation)  

---

## Technology Stack

- Frontend: React (Vite)  
- Backend: Flask (Python)  
- Database: MySQL  
- AI: Google Gemini AI + Pathfinding (Dijkstra Algorithm)  

---

## Project Structure

SafePath-AI/
└── emergency-lifeline/
    ├── frontend/        # React (Vite)
    ├── backend/         # Flask API
    │   ├── app.py
    │   ├── requirements.txt
    │   ├── database/
    │   │   ├── schema.sql
    │   │   ├── data.sql
    ├── README.md

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/roshanjr-dev/SafePath-AI.git
cd SafePath-AI/emergency-lifeline


## 2. Backend Setup
cd backend
pip install -r requirements.txt
python app.py
Backend runs on:
http://127.0.0.1:5000

## 3. Frontend Setup
Open a new terminal:
cd frontend
npm install
npm run dev
Frontend runs on:
http://localhost:5173

## 4. Database Setup
Create database:
CREATE DATABASE emergency_lifeline;
Import SQL files from:
backend/database/

## 5. Environment Variables
Create .env file inside backend folder:
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=emergency_lifeline
BASE_URL=http://localhost:5173
GEMINI_API_KEY=


## 6. Generate QR Codes
QR codes are dynamically generated based on the current BASE_URL.
Before generating, make sure to remove any old QR codes:

```bash
rm -rf frontend/public/qrcodes/*

Then run:
python generate_qrs.py
QR codes will be stored in:
frontend/public/qrcodes/

