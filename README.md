# 🚀 Competitive Intelligence AI Agent

> **An AI-powered strategic analysis tool that automates market research, competitor tracking, and financial insight generation.**

This project demonstrates the intersection of **AI Strategy** and **Software Engineering**, designed to help business consultants and analysts rapidly synthesize unstructured data into actionable strategic insights.

---

## 🎯 Project Overview
In high-stakes consulting and strategy work, gathering competitive intelligence is manual and time-consuming. This agent automates the collection and synthesis of:
- **Market News & Trends:** Real-time retrieval of industry-specific news.
- **Financial Performance:** Analysis of key metrics and quarterly reports.
- **Strategic Positioning:** AI-driven SWOT and competitive landscape mapping.

## 🛠️ Tech Stack
*   **Frontend:** Next.js (React, Tailwind CSS) – *Responsive, modern dashboard UI.*
*   **Backend:** FastAPI (Python) – *High-performance API handling AI orchestration.*
*   **AI/LLM:** OpenAI GPT-4o / LangChain – *Context-aware reasoning and summarization.*
*   **Data Processing:** Python (Pandas, NumPy) – *Financial data structuring.*
*   **Deployment:** Docker / Vercel (Ready)

---

## ⚡ Key Features
### 1. **Live Market Pulse**
Integrates with external APIs to fetch real-time news articles, press releases, and competitor announcements, filtered by relevance.

### 2. **Automated SWOT Analysis**
Uses Generative AI to digest hundreds of data points and output a structured Strengths, Weaknesses, Opportunities, and Threats assessment for any target company.

### 3. **Financial Health Dashboard**
Visualizes key financial ratios and stock performance trends, allowing for "at-a-glance" health checks of competitor firms.

<img width="1381" height="726" alt="Screenshot 2026-02-08 at 5 40 08 PM" src="https://github.com/user-attachments/assets/962a2627-1253-4f9f-bb77-df300be78a2c" />


---

For a **detailed app description and technical architecture** (data flow, backend/frontend structure, APIs, agents, deployment), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## 🚀 Getting Started

### Prerequisites
*   Node.js & npm
*   Python 3.10+
*   OpenAI API Key

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/nipunikajain/comp-intel-agent.git
cd comp-intel-agent

**2. Setup Backend (FastAPI)**
cd backend
python -m venv venv
source venv/bin/activate  # (On Windows: venv\Scripts\activate)
pip install -r requirements.txt
# Create a .env file and add your OPENAI_API_KEY
uvicorn main:app --reload

**3. Setup Frontend (Next.js)**
cd frontend
npm install
npm run dev

The application will be live at http://localhost:3000.
