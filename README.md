<div align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/3/33/F1.svg" alt="F1 Logo" width="120" />
  <h1>HaloSense: The Silent Co-Driver</h1>
  <p><strong>A Multimodal AI Pipeline for Real-Time Formula 1 Psychological Telemetry</strong></p>
  
  [![Demo Video](https://img.shields.io/badge/Demo-Watch_Video-red?style=for-the-badge&logo=youtube)](https://drive.google.com/file/d/13aLYUBx-lFcZV4CumY2e5_P2DtSQ_hru/view?usp=sharing)
  [![Team](https://img.shields.io/badge/Team-Code_Breakers-blue?style=for-the-badge)](#-team-code-breakers)
</div>

---

## 🏎️ The Problem
In modern Formula 1, race strategists have thousands of real-time data points for the car—tire temperatures, aerodynamic load, fuel flow, and engine mapping. However, they lack real-time telemetry on their most critical asset: **the driver**. 

High-stress situations lead to mistakes, missed apexes, and suboptimal tire degradation. Currently, teams rely entirely on gut feeling when listening to team radio. 

## 🧠 The Solution: HaloSense
**HaloSense** is a real-time, multimodal AI dashboard that extracts emotional states, stress indexes, and fatigue levels directly from driver radio communications. By combining audio processing (prosody, pitch, arousal) with natural language processing (transcript valence), HaloSense converts human emotion into actionable, quantitative telemetry.

This allows race engineers to mathematically correlate a driver's mood with their lap time deltas, providing a completely new dimension of race strategy.

---

## 🎥 Demo Video
> **[Watch Our Demo Video Here](https://drive.google.com/file/d/13aLYUBx-lFcZV4CumY2e5_P2DtSQ_hru/view?usp=sharing)**

*(Watch our team demonstrate how HaloSense processes live audio clips, plots arousal/valence, and correlates stress with tire degradation!)*

---

## ✨ Core Features
- **Multimodal Fusion Engine**: Analyzes both the acoustic properties of the voice (audio frequency, energy, arousal) and the semantic meaning of the transcript (valence).
- **Stress & Fatigue Index**: Custom mathematical algorithms that calculate driver stress and fatigue on a scale of 0 to 100.
- **Arousal/Valence Plotting**: Visualizes emotional states on a 2D plane to differentiate between "Calm", "Tired", "Stressed", and "Aggressive".
- **Lap Performance Correlation**: Maps psychological telemetry against physical lap time deltas (Δs) to prove the impact of emotion on race pace.
- **Live Ephemeral Processing**: Drag-and-drop new audio files to process them instantly. Custom uploads are handled safely and can be cleared instantly from the cache via the UI.

---

## 🛠️ Technology Stack
**Frontend**
- **Next.js 16 (Turbopack)** & **React**: Blazing fast, component-driven UI.
- **TailwindCSS**: Sleek, dark-mode, F1-inspired carbon fiber aesthetics.
- **Recharts**: High-performance SVGs for Lap Performance and Correlation scatter plots.

**Backend**
- **FastAPI (Python)**: High-performance async API for instantaneous inference.
- **Librosa & PyDub**: Advanced audio feature extraction (pitch, energy, duration).
- **Transformers / VADER**: Natural Language Processing for transcript sentiment analysis.
- **Uvicorn**: ASGI web server implementation for Python.

---

## 🚀 Running the Project Locally

To run this project, you will need two separate terminal windows.

### 1. Backend Setup (Terminal 1)
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2. Frontend Setup (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to access the HaloSense dashboard!

---

## 🏆 Team Code Breakers
This project was proudly engineered for the Hackathon by **Team Code Breakers**:
- **Lokesh Maheshwari** - Team Lead & Machine Learning Engineer *(Audio Processing, Multimodal Fusion & Emotion Telemetry)*
- **Himanshu Pragyan** - Backend Developer *(FastAPI, Ephemeral Session Management & Route Logic)*
- **Shrey Garg** - Frontend Developer *(React, UI/UX Architecture & Real-Time Visualization)*

*We brought the data, we brought the speed, and we broke the code. See you at the finish line! 🏁*
