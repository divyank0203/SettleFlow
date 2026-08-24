import express from "express";
import Expense from "../models/Expense.js";
import Group from "../models/Group.js";
import auth from "../middleware/auth.js";
import { categorizeExpense } from "../services/aiClient.js";

const router = express.Router();

// Add expense (with AI category)
router.post("/", auth, async (req, res) => {
  try {
    const { groupId, payer, amount, splits, description, category } = req.body;
    if (!groupId || !payer || !amount || !splits)
      return res.status(400).json({ message: "Missing fields" });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const members = group.members.map((m) => m.toString());
    if (!members.includes(payer))
      return res.status(400).json({ message: "Payer not in group" });
    for (const s of splits) {
      if (!members.includes(s.user))
        return res.status(400).json({ message: "Split user not in group" });
    }

let finalCategory = category || "other";

if (!category && description) {
  try {
    finalCategory = await categorizeExpense(description);
  } catch (error) {
    console.warn(
      "AI categorization failed, using other:",
      error.message
    );

    finalCategory = "other";
  }
}

    const expense = await Expense.create({
      groupId,
      payer,
      amount,
      splits,
      description,
      category: finalCategory
    });
    res.json(expense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get expenses for group
router.get("/group/:groupId", auth, async (req, res) => {
  try {
    const expenses = await Expense.find({
      groupId: req.params.groupId
    }).populate("payer splits.user", "name email");
    res.json(expenses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Settlements
router.get("/settlements/:groupId", auth, async (req, res) => {
  try {
    const expenses = await Expense.find({ groupId: req.params.groupId }).lean();
    if (!expenses.length) return res.json({ transfers: [] });

    const balance = {};
    for (const ex of expenses) {
      const payerId = ex.payer.toString();
      balance[payerId] = (balance[payerId] || 0) + ex.amount;
      for (const s of ex.splits) {
        const uid = s.user.toString();
        balance[uid] = (balance[uid] || 0) - s.share;
      }
    }

    const creditors = [];
    const debtors = [];
    for (const [uid, bal] of Object.entries(balance)) {
      if (bal > 1e-9) creditors.push([uid, bal]);
      else if (bal < -1e-9) debtors.push([uid, -bal]);
    }

    creditors.sort((a, b) => b[1] - a[1]);
    debtors.sort((a, b) => b[1] - a[1]);

    const transfers = [];
    let i = 0,
      j = 0;
    while (i < creditors.length && j < debtors.length) {
      const amount = Math.min(creditors[i][1], debtors[j][1]);
      transfers.push({
        from: debtors[j][0],
        to: creditors[i][0],
        amount: Number(amount.toFixed(2))
      });
      creditors[i][1] -= amount;
      debtors[j][1] -= amount;
      if (creditors[i][1] <= 1e-9) i++;
      if (debtors[j][1] <= 1e-9) j++;
    }

    res.json({ transfers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/expenses/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate("groupId");
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    const group = expense.groupId;
    // allow delete only if current user is in the group
    if (!group.members.map(String).includes(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await Expense.deleteOne({ _id: expense._id });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;
