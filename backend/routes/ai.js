import express from "express";

import auth from "../middleware/auth.js";
import User from "../models/User.js";
import Group from "../models/Group.js";
import Expense from "../models/Expense.js";

import {
  parseNaturalLanguageExpenses,
  generateInsightsSummary,
  explainSettlements,
} from "../services/aiClient.js";

const router = express.Router();

/*
 * POST /api/ai/parse-expenses-text
 */
router.post(
  "/parse-expenses-text",
  auth,
  async (req, res) => {
    try {
      const { text, groupId } = req.body;

      if (!text?.trim()) {
        return res.status(400).json({
          message: "Expense text is required",
        });
      }

      if (!groupId) {
        return res.status(400).json({
          message: "Group ID is required",
        });
      }

      const group = await Group.findById(
        groupId
      ).populate("members", "name email");

      if (!group) {
        return res.status(404).json({
          message: "Group not found",
        });
      }

      // Make sure the current user belongs to the group.
      const isMember = group.members.some(
        (member) =>
          member._id.toString() === req.user.id
      );

      if (!isMember) {
        return res.status(403).json({
          message: "You are not a member of this group",
        });
      }

      const currentUser = await User.findById(
        req.user.id
      ).select("name email");

      if (!currentUser) {
        return res.status(404).json({
          message: "Current user not found",
        });
      }

      const expenses =
        await parseNaturalLanguageExpenses({
          text,
          members: group.members,
          currentUserName: currentUser.name,
        });

      return res.json({
        expenses,
      });
} catch (error) {
  console.error("========== GROQ ERROR ==========");
  console.error(error);
  console.error("================================");

  return res.status(500).json({
    message:
      error?.message ||
      error?.error?.message ||
      "AI parsing failed",
  });
}
  }
);

/*
 * GET /api/ai/monthly-insights/:groupId
 */
router.get(
  "/monthly-insights/:groupId",
  auth,
  async (req, res) => {
    try {
      const { groupId } = req.params;

      const group = await Group.findById(
        groupId
      ).select("members name");

      if (!group) {
        return res.status(404).json({
          message: "Group not found",
        });
      }

      const isMember = group.members.some(
        (memberId) =>
          memberId.toString() === req.user.id
      );

      if (!isMember) {
        return res.status(403).json({
          message: "Not allowed",
        });
      }

      const now = new Date();

      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

      const expenses = await Expense.find({
        groupId,
        createdAt: {
          $gte: startOfMonth,
          $lte: now,
        },
      }).lean();

      const stats = {
        total: 0,
        count: expenses.length,
        byCategory: {},
      };

      for (const expense of expenses) {
        stats.total += expense.amount;

        const category =
          expense.category || "other";

        stats.byCategory[category] =
          (stats.byCategory[category] || 0) +
          expense.amount;
      }

      stats.total = Number(
        stats.total.toFixed(2)
      );

      const summary =
        await generateInsightsSummary(stats);

      return res.json({
        stats,
        summary,
      });
    } catch (error) {
      console.error("Groq insights error:", error);

      return res.status(500).json({
        message: "AI insights failed",
      });
    }
  }
);

/*
 * POST /api/ai/explain-settlements
 */
router.post(
  "/explain-settlements",
  auth,
  async (req, res) => {
    try {
      const { transfers, users } = req.body;

      if (!transfers || !users) {
        return res.status(400).json({
          message: "Missing transfers or users",
        });
      }

      const explanation =
        await explainSettlements(
          transfers,
          users
        );

      return res.json({
        explanation,
      });
    } catch (error) {
      console.error(
        "Groq settlement explanation error:",
        error
      );

      return res.status(500).json({
        message: "AI explanation failed",
      });
    }
  }
);

export default router;