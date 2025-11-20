import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function Groupview() {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [settlements, setSettlements] = useState([]);
  const [settleExplanation, setSettleExplanation] = useState("");
  const [nlText, setNlText] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const groups = await api("/api/groups");
        const g = groups.find((x) => x._id === id);
        setGroup(g);
        setMembers(g?.members || []);
        const ex = await api(`/api/expenses/group/${id}`);
        setExpenses(ex);
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, [id]);

  async function addExpense(e) {
    e.preventDefault();
    try {
      const share = Number(amount) / members.length;
      const splits = members.map((m) => ({ user: m._id, share }));
      await api("/api/expenses", "POST", {
        groupId: id,
        payer,
        amount: Number(amount),
        splits,
        description,
      });
      const ex = await api(`/api/expenses/group/${id}`);
      setExpenses(ex);
      setAmount("");
      setDescription("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function addMember(e) {
    e.preventDefault();
    try {
      const updatedGroup = await api(`/api/groups/${id}/add-member`, "PATCH", {
        email: newMemberEmail,
      });
      setGroup(updatedGroup);
      setMembers(updatedGroup.members || []);
      setNewMemberEmail("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function loadSettlements() {
    try {
      const res = await api(`/api/expenses/settlements/${id}`);
      setSettlements(res.transfers || []);
      if (res.transfers?.length) {
        const usersMap = {};
        for (const m of members) usersMap[m._id] = m.name;
        const exp = await api("/api/ai/explain-settlements", "POST", {
          transfers: res.transfers,
          users: usersMap,
        });
        setSettleExplanation(exp.explanation);
      } else {
        setSettleExplanation("No settlements needed.");
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function parseNL() {
    setLoadingAI(true);
    try {
      const resp = await api("/api/ai/parse-expenses-text", "POST", {
        text: nlText,
      });
      const parsed = resp.expenses || [];

      if (!parsed.length) {
        alert("AI could not parse any expenses.");
        return;
      }

      const nameToId = {};
      members.forEach((m) => {
        nameToId[m.name.toLowerCase()] = m._id;
      });

      let createdCount = 0;

      for (const exp of parsed) {
        const payerId = nameToId[exp.payerName.toLowerCase()];
        if (!payerId) continue;

        const amt = Number(exp.amount);
        if (!amt || isNaN(amt)) continue;

        const share = amt / members.length;
        const splits = members.map((m) => ({ user: m._id, share }));

        await api("/api/expenses", "POST", {
          groupId: id,
          payer: payerId,
          amount: amt,
          splits,
          description: exp.description || "AI parsed expense",
        });

        createdCount++;
      }

      if (createdCount === 0) {
        alert(
          "AI parsed text but could not match any payers to group members. Check names."
        );
      } else {
        const ex = await api(`/api/expenses/group/${id}`);
        setExpenses(ex);
        setNlText("");
        alert(`AI created ${createdCount} expenses.`);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingAI(false);
    }
  }

  async function deleteExpense(expenseId) {
    try {
      await api(`/api/expenses/${expenseId}`, "DELETE");
      setExpenses((prev) => prev.filter((e) => e._id !== expenseId));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
          {group?.name || "Group"}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {members.length} member{members.length !== 1 && "s"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-3">
              Add member
            </h3>
            <form onSubmit={addMember} className="space-y-3">
              <input
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                placeholder="Friend's email (registered user)"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
              <button className="w-full rounded-md bg-slate-900 text-slate-50 py-2 text-sm font-medium hover:bg-slate-800 transition-colors">
                Add member
              </button>
            </form>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-3">
              Add expense
            </h3>
            <form onSubmit={addExpense} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Payer
                </label>
                <select
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                >
                  <option value="">Select</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Amount
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  placeholder="Amount (₹)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Description
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  placeholder="e.g. Dinner at Pizza Hut"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <button className="w-full rounded-md bg-slate-900 text-slate-50 py-2 text-sm font-medium hover:bg-slate-800 transition-colors">
                Add expense
              </button>
            </form>
          </div>
        </div>

        {/* Middle column */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-2">
              Quick add from text
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Example: &quot;I paid 1200 for hotel, Rohit paid 600 for dinner,
              Aman paid 300 for snacks&quot;
            </p>
            <textarea
              rows={4}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              placeholder="Describe the shared expenses in one sentence..."
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
            />
            <button
              onClick={parseNL}
              disabled={loadingAI}
              className="mt-2 w-full rounded-md bg-slate-900 text-slate-50 py-2 text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {loadingAI ? "Processing..." : "Parse & create expenses"}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-3">
              Expenses
            </h3>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No expenses yet. Add one to get started.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {expenses.map((ex) => (
                  <li
                    key={ex._id}
                    className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {ex.description || "Expense"}{" "}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({ex.category})
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        ₹{ex.amount} by {ex.payer?.name || "Unknown"}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteExpense(ex._id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Settlements
              </h3>
              <button
                onClick={loadSettlements}
                className="text-xs px-3 py-1 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Compute
              </button>
            </div>

            {settlements.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No settlements computed yet.
              </p>
            ) : (
              <ul className="space-y-1 text-sm mb-3 text-slate-800 dark:text-slate-100">
                {settlements.map((t, idx) => {
                  const from = members.find((m) => m._id === t.from);
                  const to = members.find((m) => m._id === t.to);
                  return (
                    <li key={idx}>
                      {from?.name} pays {to?.name} ₹{t.amount}
                    </li>
                  );
                })}
              </ul>
            )}

            {settleExplanation && (
              <div className="mt-2 rounded-md bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                {settleExplanation}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
