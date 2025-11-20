# 💸 SettleFlow — Smart Group Expense & Settlement Manager

A modern **MERN-stack** app for managing shared expenses with:

- **Text-based expense input** (paste “Rohit paid 600 for dinner…”)
- **Smart parsing** into structured expenses
- **Minimal-transaction settlement optimization**
- **Explainable settlements**
- Clean **dark UI** with light/dark toggle

<div align="center">
  <img src="./assets/hero-banner.png" alt="SettleFlow banner" width="800" />
</div>

---

## ✨ Features

### 🧠 1. Natural-Language Expense Parsing

Instead of filling 4–5 fields per expense, users can paste text like:

> “I paid 1200 for hotel, Rohit paid 600 for dinner, Aman paid 300 for snacks”

SettleFlow’s **NLP-lite parser**:

- Extracts payer names  
- Extracts amounts  
- Infers descriptions  
- Auto-splits across members  
- Creates multiple expenses in one shot  

No external AI calls → **fast** and **privacy-friendly**.

---

### 🔄 2. Minimal-Transaction Settlements

SettleFlow computes **who owes whom** using a simple optimization:

- Groups debtors and creditors
- Matches largest debtors to largest creditors
- Produces a **minimal set of transfers** instead of many small ones

This makes settlements easy to execute in real life:
fewer UPI/Paytm/GPay transactions, less confusion.

The app also generates a **plain-English explanation** of why each transfer is suggested.

---

### 📊 3. Monthly Insights

For each group, SettleFlow provides:

- Total spent this month  
- Number of transactions  
- Category-wise breakdown (food, travel, shopping, etc.)  
- A short summary highlighting patterns (top categories, suggestions)

---

### 👥 4. Group & Member Management

- Create groups for **trips**, **flats**, **fests**, etc.  
- Add members by email (registered users)  
- Every expense is linked to a group and payer  

---

### 🎨 5. Fintech-Style Dark UI + Theme Toggle

- Dark-first design with **black × teal** fintech vibe  
- Clean cards, layouts, and typography using **TailwindCSS**  
- Light/dark theme toggle built with React state + Tailwind `dark` class  
- Heroicons for modern, non-emoji icons

---

## 🧱 Tech Stack

**Frontend**

- React (Vite)
- React Router
- Context API for auth
- TailwindCSS
- Heroicons

**Backend**

- Node.js + Express
- MongoDB + Mongoose
- JWT-based authentication
- Custom NLP-like parsing logic
- Settlement optimization + explanation layer

**Other**

- RESTful API design
- Environment-based configuration
- Ready for deployment to Render/Railway (backend) + Vercel/Netlify (frontend)

---

## 🏛 Architecture Overview

> Frontend ↔ Backend ↔ Database

```text
[ React + Tailwind ]  <--->  [ Node.js + Express APIs ]  <--->  [ MongoDB (Mongoose) ]
          |                                |                              |
   Auth Context / JWT                Auth middleware                 Groups / Expenses
   Pages & Routes                    Routes & Controllers           Users / Stats
