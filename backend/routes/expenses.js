import express from "express";

import Expense from "../models/Expense.js";
import Group from "../models/Group.js";
import auth from "../middleware/auth.js";

import { categorizeExpense } from "../services/aiClient.js";

const router = express.Router();

/*
 * POST /api/expenses
 * Create an expense
 */
router.post("/", auth, async (req, res) => {
  try {
    const {
      groupId,
      payer,
      amount,
      splits,
      description,
      category,
    } = req.body;

    if (
      !groupId ||
      !payer ||
      !amount ||
      !splits ||
      !Array.isArray(splits) ||
      splits.length === 0
    ) {
      return res.status(400).json({
        message: "Missing or invalid fields",
      });
    }

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        message: "Amount must be a positive number",
      });
    }

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    const memberIds = group.members.map((member) =>
      member.toString()
    );

    /*
     * Payer must belong to the group.
     */
    if (!memberIds.includes(payer.toString())) {
      return res.status(400).json({
        message: "Payer is not in the group",
      });
    }

    /*
     * Every split user must belong to the group.
     */
    for (const split of splits) {
      if (
        !split.user ||
        !memberIds.includes(
          split.user.toString()
        )
      ) {
        return res.status(400).json({
          message:
            "One or more split users are not in the group",
        });
      }

      if (
        !Number.isFinite(Number(split.share)) ||
        Number(split.share) < 0
      ) {
        return res.status(400).json({
          message: "Invalid split amount",
        });
      }
    }

    /*
     * Validate that the splits add up to the expense.
     */
    const splitTotal = splits.reduce(
      (sum, split) =>
        sum + Number(split.share),
      0
    );

    if (
      Math.abs(
        splitTotal - numericAmount
      ) > 0.01
    ) {
      return res.status(400).json({
        message:
          "Split amounts must equal the expense amount",
      });
    }

    /*
     * If the AI parser already provided a category,
     * use it. Otherwise ask Groq to categorize a
     * manually entered description.
     */
    let finalCategory = category || "other";

    if (!category && description?.trim()) {
      try {
        finalCategory =
          await categorizeExpense(
            description
          );
      } catch (error) {
        console.warn(
          "Groq categorization failed:",
          error.message
        );

        finalCategory = "other";
      }
    }

    const expense = await Expense.create({
      groupId,
      payer,
      amount: numericAmount,
      splits,
      description:
        description?.trim() || "Expense",
      category: finalCategory,
    });

    return res.status(201).json(expense);
  } catch (error) {
    console.error(
      "Create expense error:",
      error
    );

    return res.status(500).json({
      message: "Server error",
    });
  }
});

/*
 * GET /api/expenses/group/:groupId
 */
router.get(
  "/group/:groupId",
  auth,
  async (req, res) => {
    try {
      const group = await Group.findById(
        req.params.groupId
      );

      if (!group) {
        return res.status(404).json({
          message: "Group not found",
        });
      }

      const isMember = group.members
        .map((member) => member.toString())
        .includes(req.user.id);

      if (!isMember) {
        return res.status(403).json({
          message: "Not allowed",
        });
      }

      const expenses = await Expense.find({
        groupId: req.params.groupId,
      })
        .populate(
          "payer splits.user",
          "name email"
        )
        .sort({ createdAt: -1 });

      return res.json(expenses);
    } catch (error) {
      console.error(
        "Get group expenses error:",
        error
      );

      return res.status(500).json({
        message: "Server error",
      });
    }
  }
);

/*
 * GET /api/expenses/settlements/:groupId
 */
router.get(
  "/settlements/:groupId",
  auth,
  async (req, res) => {
    try {
      const group = await Group.findById(
        req.params.groupId
      );

      if (!group) {
        return res.status(404).json({
          message: "Group not found",
        });
      }

      const isMember = group.members
        .map((member) => member.toString())
        .includes(req.user.id);

      if (!isMember) {
        return res.status(403).json({
          message: "Not allowed",
        });
      }

      const expenses =
        await Expense.find({
          groupId: req.params.groupId,
        }).lean();

      if (!expenses.length) {
        return res.json({
          transfers: [],
        });
      }

      /*
       * Positive balance = should receive money.
       * Negative balance = owes money.
       */
      const balance = {};

      for (const expense of expenses) {
        const payerId =
          expense.payer.toString();

        balance[payerId] =
          (balance[payerId] || 0) +
          Number(expense.amount);

        for (const split of expense.splits) {
          const userId =
            split.user.toString();

          balance[userId] =
            (balance[userId] || 0) -
            Number(split.share);
        }
      }

      const creditors = [];
      const debtors = [];

      for (const [userId, amount] of Object.entries(
        balance
      )) {
        if (amount > 0.01) {
          creditors.push([
            userId,
            amount,
          ]);
        } else if (amount < -0.01) {
          debtors.push([
            userId,
            -amount,
          ]);
        }
      }

      /*
       * Largest balances first.
       */
      creditors.sort(
        (a, b) => b[1] - a[1]
      );

      debtors.sort(
        (a, b) => b[1] - a[1]
      );

      const transfers = [];

      let i = 0;
      let j = 0;

      while (
        i < creditors.length &&
        j < debtors.length
      ) {
        const amount = Math.min(
          creditors[i][1],
          debtors[j][1]
        );

        transfers.push({
          from: debtors[j][0],
          to: creditors[i][0],
          amount: Number(
            amount.toFixed(2)
          ),
        });

        creditors[i][1] -= amount;
        debtors[j][1] -= amount;

        if (
          Math.abs(creditors[i][1]) <=
          0.01
        ) {
          i++;
        }

        if (
          Math.abs(debtors[j][1]) <=
          0.01
        ) {
          j++;
        }
      }

      return res.json({
        transfers,
      });
    } catch (error) {
      console.error(
        "Settlement calculation error:",
        error
      );

      return res.status(500).json({
        message: "Server error",
      });
    }
  }
);

/*
 * DELETE /api/expenses/:id
 */
router.delete(
  "/:id",
  auth,
  async (req, res) => {
    try {
      const expense =
        await Expense.findById(
          req.params.id
        );

      if (!expense) {
        return res.status(404).json({
          message: "Expense not found",
        });
      }

      const group =
        await Group.findById(
          expense.groupId
        );

      if (!group) {
        return res.status(404).json({
          message: "Group not found",
        });
      }

      const isMember = group.members
        .map((member) => member.toString())
        .includes(req.user.id);

      if (!isMember) {
        return res.status(403).json({
          message: "Not allowed",
        });
      }

      await Expense.deleteOne({
        _id: expense._id,
      });

      return res.json({
        message: "Expense deleted",
      });
    } catch (error) {
      console.error(
        "Delete expense error:",
        error
      );

      return res.status(500).json({
        message: "Server error",
      });
    }
  }
);

export default router;