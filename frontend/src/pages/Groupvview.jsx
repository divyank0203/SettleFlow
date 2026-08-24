import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function Groupvview() {
  const { id } = useParams();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const [settlements, setSettlements] = useState([]);
  const [settleExplanation, setSettleExplanation] =
    useState("");

  const [nlText, setNlText] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);

  const [newMemberEmail, setNewMemberEmail] =
    useState("");

  useEffect(() => {
    async function load() {
      try {
        const groups = await api("/api/groups");

        const currentGroup = groups.find(
          (g) => g._id === id
        );

        if (!currentGroup) {
          throw new Error("Group not found");
        }

        setGroup(currentGroup);
        setMembers(currentGroup.members || []);

        const ex = await api(
          `/api/expenses/group/${id}`
        );

        setExpenses(ex);
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    }

    load();
  }, [id]);

  async function addExpense(e) {
    e.preventDefault();

    if (members.length === 0) {
      alert("Add members before creating an expense.");
      return;
    }

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      alert("Enter a valid amount.");
      return;
    }

    try {
      /*
       * Equal split.
       * The last member receives the rounding remainder
       * so that the split sum is exactly equal to the expense.
       */
      const baseShare = Number(
        (numericAmount / members.length).toFixed(2)
      );

      const splits = [];
      let allocated = 0;

      for (let i = 0; i < members.length; i++) {
        let share = baseShare;

        if (i === members.length - 1) {
          share = Number(
            (numericAmount - allocated).toFixed(2)
          );
        }

        splits.push({
          user: members[i]._id,
          share,
        });

        allocated += share;
      }

      await api("/api/expenses", "POST", {
        groupId: id,
        payer,
        amount: numericAmount,
        splits,
        description,
      });

      const refreshedExpenses = await api(
        `/api/expenses/group/${id}`
      );

      setExpenses(refreshedExpenses);

      setPayer("");
      setAmount("");
      setDescription("");

      // Expenses changed, so old settlement results are stale.
      setSettlements([]);
      setSettleExplanation("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function addMember(e) {
    e.preventDefault();

    if (!newMemberEmail.trim()) {
      return;
    }

    try {
      const updatedGroup = await api(
        `/api/groups/${id}/add-member`,
        "PATCH",
        {
          email: newMemberEmail.trim(),
        }
      );

      setGroup(updatedGroup);
      setMembers(updatedGroup.members || []);

      setNewMemberEmail("");
      setPayer("");

      // Existing settlement output is now stale.
      setSettlements([]);
      setSettleExplanation("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function parseNL() {
    if (!nlText.trim()) {
      alert("Enter some expense text first.");
      return;
    }

    if (members.length === 0) {
      alert("Add group members before using AI parsing.");
      return;
    }

    setLoadingAI(true);

    try {
      /*
       * Send the natural-language text and group ID.
       * The backend now sends this to Groq.
       */
      const response = await api(
        "/api/ai/parse-expenses-text",
        "POST",
        {
          text: nlText,
          groupId: id,
        }
      );

      const parsed = response.expenses || [];

      if (parsed.length === 0) {
        alert(
          "I couldn't identify any valid expenses from that text."
        );
        return;
      }

      /*
       * Convert payer names returned by Groq
       * into actual MongoDB user IDs.
       */
      const nameToId = {};

      members.forEach((member) => {
        nameToId[
          member.name.trim().toLowerCase()
        ] = member._id;
      });

      let createdCount = 0;

      for (const expense of parsed) {
        const normalizedPayer =
          expense.payerName
            ?.trim()
            .toLowerCase();

        const payerId =
          nameToId[normalizedPayer];

        if (!payerId) {
          console.warn(
            "Skipping unknown payer:",
            expense.payerName
          );
          continue;
        }

        const expenseAmount = Number(
          expense.amount
        );

        if (
          !Number.isFinite(expenseAmount) ||
          expenseAmount <= 0
        ) {
          continue;
        }

        /*
         * Equal split with rounding correction.
         */
        const baseShare = Number(
          (
            expenseAmount / members.length
          ).toFixed(2)
        );

        const splits = [];
        let allocated = 0;

        for (let i = 0; i < members.length; i++) {
          let share = baseShare;

          if (i === members.length - 1) {
            share = Number(
              (
                expenseAmount - allocated
              ).toFixed(2)
            );
          }

          splits.push({
            user: members[i]._id,
            share,
          });

          allocated += share;
        }

        /*
         * Category now comes directly from Groq.
         */
        await api("/api/expenses", "POST", {
          groupId: id,
          payer: payerId,
          amount: expenseAmount,
          splits,
          description:
            expense.description || "Expense",
          category: expense.category || "other",
        });

        createdCount++;
      }

      if (createdCount === 0) {
        alert(
          "The AI found expenses, but none of the payers matched your group members."
        );
        return;
      }

      const refreshedExpenses = await api(
        `/api/expenses/group/${id}`
      );

      setExpenses(refreshedExpenses);
      setNlText("");

      setSettlements([]);
      setSettleExplanation("");

      alert(
        `Successfully created ${createdCount} expense${
          createdCount === 1 ? "" : "s"
        }.`
      );
    } catch (err) {
      console.error("AI parsing error:", err);

      alert(
        err.message ||
          "AI parsing failed."
      );
    } finally {
      setLoadingAI(false);
    }
  }

  async function loadSettlements() {
    try {
      const response = await api(
        `/api/expenses/settlements/${id}`
      );

      const transfers =
        response.transfers || [];

      setSettlements(transfers);

      if (transfers.length === 0) {
        setSettleExplanation(
          "No settlements needed. Everyone is already balanced."
        );
        return;
      }

      const usersMap = {};

      members.forEach((member) => {
        usersMap[member._id] =
          member.name;
      });

      const explanation = await api(
        "/api/ai/explain-settlements",
        "POST",
        {
          transfers,
          users: usersMap,
        }
      );

      setSettleExplanation(
        explanation.explanation
      );
    } catch (err) {
      console.error(err);

      alert(
        err.message ||
          "Could not compute settlements."
      );
    }
  }

  async function deleteExpense(expenseId) {
    const confirmed = window.confirm(
      "Delete this expense?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await api(
        `/api/expenses/${expenseId}`,
        "DELETE"
      );

      setExpenses((prev) =>
        prev.filter(
          (expense) =>
            expense._id !== expenseId
        )
      );

      setSettlements([]);
      setSettleExplanation("");
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
          {group?.name || "Group"}
        </h2>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {members.length} member
          {members.length !== 1 && "s"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN */}
        <div className="space-y-4 lg:col-span-1">
          {/* Add member */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
              Add member
            </h3>

            <form
              onSubmit={addMember}
              className="space-y-3"
            >
              <input
                type="email"
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Friend's email (registered user)"
                value={newMemberEmail}
                onChange={(e) =>
                  setNewMemberEmail(
                    e.target.value
                  )
                }
              />

              <button
                type="submit"
                className="w-full rounded-md bg-indigo-500 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
              >
                Add member
              </button>
            </form>
          </div>

          {/* Add expense */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
              Add expense
            </h3>

            <form
              onSubmit={addExpense}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  Payer
                </label>

                <select
                  value={payer}
                  onChange={(e) =>
                    setPayer(
                      e.target.value
                    )
                  }
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">
                    Select
                  </option>

                  {members.map(
                    (member) => (
                      <option
                        key={member._id}
                        value={member._id}
                      >
                        {member.name}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  Amount
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Amount (₹)"
                  value={amount}
                  onChange={(e) =>
                    setAmount(
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  Description
                </label>

                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="e.g. Dinner at Pizza Hut"
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      e.target.value
                    )
                  }
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-indigo-500 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
              >
                Add expense
              </button>
            </form>
          </div>
        </div>

        {/* MIDDLE COLUMN */}
        <div className="space-y-4 lg:col-span-1">
          {/* AI parser */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
              Quick add from text
            </h3>

            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Describe expenses naturally and SettleFlow will extract them automatically.
            </p>

            <textarea
              rows={5}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder="Example: I paid 1200 for the hotel, Rahul paid 600 for dinner, and Aman paid 300 for snacks."
              value={nlText}
              onChange={(e) =>
                setNlText(
                  e.target.value
                )
              }
            />

            <button
              type="button"
              onClick={parseNL}
              disabled={loadingAI}
              className="mt-3 w-full rounded-md bg-indigo-500 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAI
                ? "Processing..."
                : "Parse & create expenses"}
            </button>
          </div>

          {/* Expenses */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-medium text-slate-800 dark:text-slate-100">
              Expenses
            </h3>

            {expenses.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No expenses yet. Add one to get started.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {expenses.map(
                  (expense) => (
                    <li
                      key={expense._id}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700"
                    >
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {expense.description ||
                            "Expense"}

                          <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                            (
                            {expense.category ||
                              "other"}
                            )
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          ₹{expense.amount} by{" "}
                          {expense.payer?.name ||
                            "Unknown"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          deleteExpense(
                            expense._id
                          )
                        }
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Settlements
              </h3>

              <button
                type="button"
                onClick={loadSettlements}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Compute
              </button>
            </div>

            {settlements.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No settlements computed yet.
              </p>
            ) : (
              <ul className="mb-3 space-y-2 text-sm text-slate-800 dark:text-slate-100">
                {settlements.map(
                  (transfer, index) => {
                    const from =
                      members.find(
                        (member) =>
                          member._id ===
                          transfer.from
                      );

                    const to =
                      members.find(
                        (member) =>
                          member._id ===
                          transfer.to
                      );

                    return (
                      <li
                        key={index}
                        className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
                      >
                        {from?.name ||
                          "Unknown"}{" "}
                        pays{" "}
                        {to?.name ||
                          "Unknown"}{" "}
                        ₹{transfer.amount}
                      </li>
                    );
                  }
                )}
              </ul>
            )}

            {settleExplanation && (
              <div className="mt-2 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {settleExplanation}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}