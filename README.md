# SettleFlow

> A full-stack group expense management application that uses AI to simplify expense entry and intelligently settle shared expenses.

SettleFlow helps groups track shared expenses, calculate individual balances, and determine a simplified way to settle debts.

Instead of forcing users to manually enter every detail of an expense, SettleFlow allows them to describe expenses in **natural language**. An LLM extracts the structured information, while a deterministic settlement algorithm calculates who should pay whom.

---

## ✨ Features

### 💸 Group Expense Management

Create groups and record shared expenses between members.

Users can track:

* Who paid
* How much was paid
* Who participated in the expense
* How the expense should be split
* Individual balances

---

### 🤖 Natural Language Expense Parsing

Expenses can be entered using plain English.

For example:

```text
"Rahul paid ₹1200 for dinner for Rahul, Aman and Rohan."
```

The application uses the **Groq LLM API** to convert the natural-language input into structured expense data.

```text
Natural Language
       │
       ▼
   Groq LLM
       │
       ▼
Structured Expense
       │
       ▼
Database
```

This removes the need for users to manually enter multiple fields for every expense.

---

### 🔄 Optimized Debt Settlement

After calculating everyone's net balance, SettleFlow determines a simplified sequence of transactions.

For example:

```text
A owes ₹500
B owes ₹300
C should receive ₹800
```

Instead of requiring multiple unnecessary payments, the settlement algorithm generates:

```text
A → C : ₹500
B → C : ₹300
```

The goal is to reduce the number of transactions required to settle the group.

---

### 💬 Plain-English Settlement Explanations

SettleFlow can explain balances and settlements in a simple way so users don't have to interpret raw numbers.

Instead of:

```text
Rahul: -450
Aman: +700
Rohan: -250
```

the application can present the result in an understandable form:

```text
Rahul needs to pay Aman ₹450.
Rohan needs to pay Aman ₹250.
```

---

### 📊 Monthly Spending Insights

Users can analyze group expenses over time and get a clearer picture of spending patterns.

---

### 🌗 Dark / Light Mode

The application supports both dark and light themes for a more flexible user experience.

---

## 🧠 AI Architecture

SettleFlow uses AI where it provides a practical advantage, while keeping financial calculations deterministic.

### Expense Processing

```text
User Input
    │
    ▼
Natural Language Expense
    │
    ▼
Groq LLM API
    │
    ▼
Structured Expense Data
    │
    ▼
Validation
    │
    ▼
MongoDB
```

The LLM is responsible for **understanding the user's language**, not for performing the final financial calculations.

---

## ⚙️ Settlement Algorithm

The settlement process is deterministic.

First, the application calculates each user's **net balance**:

```text
Net Balance = Amount Paid - Amount Owed
```

Users with positive balances are creditors, while users with negative balances are debtors.

The algorithm then matches debtors with creditors and generates transactions until all balances are settled.

```text
             Group Expenses
                   │
                   ▼
          Calculate Individual
               Balances
                   │
                   ▼
        ┌─────────────────────┐
        │ Positive Balance    │
        │      Creditors      │
        └──────────┬──────────┘
                   │
                   │
        ┌──────────▼──────────┐
        │ Negative Balance    │
        │       Debtors       │
        └──────────┬──────────┘
                   │
                   ▼
          Settlement Algorithm
                   │
                   ▼
        Simplified Transactions
```

This separation is intentional: the **LLM handles language understanding**, while the **application logic handles money and settlement calculations**.

---

## 🛠️ Tech Stack

### Frontend

* React.js
* Tailwind CSS
* Vite

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT Authentication

### AI

* Groq LLM API
* Natural-language expense parsing

### Deployment

* **Frontend:** Vercel
* **Backend:** Render
* **Database:** MongoDB Atlas

---

## 🏗️ Architecture

```text
                     ┌──────────────────┐
                     │   React Client   │
                     │    + Tailwind    │
                     └────────┬─────────┘
                              │
                              │ REST API
                              ▼
                     ┌──────────────────┐
                     │  Express Server  │
                     │     Node.js      │
                     └───────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌───────────┐   ┌────────────┐
        │ MongoDB  │   │    JWT    │   │ Groq API   │
        │  Atlas   │   │   Auth    │   │    LLM     │
        └──────────┘   └───────────┘   └────────────┘
```

---

## 🔐 Authentication

SettleFlow uses **JWT-based authentication** to protect user-specific resources.

The authentication flow is:

```text
User Login
    │
    ▼
Credentials Verified
    │
    ▼
JWT Generated
    │
    ▼
Stored in HttpOnly Cookie
    │
    ▼
Authenticated API Requests
```

Using an HttpOnly cookie prevents client-side JavaScript from directly accessing the token.

---

## 📂 Project Structure

```text
SettleFlow/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── ...
│   └── package.json
│
├── server/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── utils/
│   └── server.js
│
├── .gitignore
└── README.md
```

> Update the structure above to match the current repository if your folder names differ.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have:

* Node.js installed
* MongoDB Atlas account
* Groq API key
* npm

### Clone the repository

```bash
git clone https://github.com/divyank0203/SettleFlow.git
cd SettleFlow
```

---

### Install dependencies

Install frontend dependencies:

```bash
cd client
npm install
```

Install backend dependencies:

```bash
cd ../server
npm install
```

---

### Environment Variables

Create a `.env` file inside the backend directory.

```env
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

GROQ_API_KEY=your_groq_api_key

CLIENT_URL=http://localhost:5173
```

Never commit your `.env` file to the repository.

---

### Run the backend

```bash
cd server
npm run dev
```

---

### Run the frontend

Open another terminal:

```bash
cd client
npm run dev
```

The application will typically be available at:

```text
http://localhost:5173
```

---

## 🔄 Example Workflow

A typical SettleFlow workflow looks like this:

```text
1. Create a group
        ↓
2. Add members
        ↓
3. Add an expense
        ↓
4. Describe expense naturally
        ↓
5. Groq extracts expense details
        ↓
6. Expense is stored in MongoDB
        ↓
7. Balances are recalculated
        ↓
8. Settlement transactions are generated
        ↓
9. Users see who needs to pay whom
```

---

## 💡 Example

Suppose three friends share expenses:

```text
Rahul paid ₹1200 for dinner
Aman paid ₹600 for transportation
Rohan paid ₹300 for snacks
```

SettleFlow calculates the amount each person should ultimately contribute and compares it with what they already paid.

The result is a set of simplified transactions rather than requiring everyone to transfer money to everyone else.

---

## 📈 Design Decisions

### Why MongoDB?

The application's data model contains naturally nested and changing entities such as:

* Users
* Groups
* Group members
* Expenses
* Participants
* Settlement information

MongoDB provides a flexible document model that fits these relationships well and works naturally with the Node.js/Mongoose stack.

---

### Why use an LLM?

Natural-language expense entry is primarily a **language-understanding problem**.

Instead of forcing users to manually specify:

```text
Amount
Description
Payer
Participants
Split
```

they can describe the expense naturally and let the LLM extract the relevant fields.

The LLM is therefore used as an **input-processing layer**, while the application's business logic remains responsible for calculations and settlement.

---

### Why not let the LLM calculate settlements?

Financial calculations should be deterministic and reproducible.

Therefore, SettleFlow separates:

```text
LLM
→ Understand the user's input

Application Logic
→ Calculate balances and settlements
```

This makes the core financial logic easier to validate and reason about.

---

## 🌐 Deployment

The application uses a separate frontend and backend deployment architecture:

```text
                 ┌──────────────┐
                 │    Vercel    │
                 │   Frontend   │
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │    Render    │
                 │   Backend    │
                 └──────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      MongoDB        Groq API      JWT Auth
       Atlas
```

---

## 🔗 Live Demo

**Frontend:**
https://settle-flow.vercel.app

---

## 🧪 Future Improvements

* [ ] Receipt/image-based expense extraction
* [ ] Recurring expenses
* [ ] Expense categories and analytics
* [ ] Group activity history
* [ ] Better settlement visualizations
* [ ] Payment integration
* [ ] More advanced spending insights
* [ ] Improved error handling for ambiguous natural-language inputs

---

## 📚 Concepts Demonstrated

This project demonstrates practical experience with:

* Full-stack web development
* REST API design
* JWT authentication
* MongoDB and Mongoose
* React application architecture
* Tailwind CSS
* LLM API integration
* Natural-language processing
* Deterministic financial logic
* Algorithmic debt settlement
* Cloud deployment
* Frontend/backend separation
* CORS and environment configuration

---

