// Admin User Management
// 1. User List
// 2. Name/Email search
// 3. Role Filter
// 4. Pagination
// 5. Block User
// 6. Unblock User
// 7. Admin can't block himself or other admins

import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

// Escape special characters before using user input in regex
const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Get the authenticated user's ID
const getUserId = (user) => String(user._id || user.id);

// Build a query that supports Better Auth string IDs and MongoDB Object-based IDs
const buildUserIdQuery = (id) => {
  const conditions = [{ _id: id }, { id }];
  if (ObjectId.isValid(id)) {
    conditions.push({ _id: new ObjectId(id) });
  }
  return { $or: conditions };
};

// GET: /api/admin/users
export const GetAllUsers = async (req, res, next) => {
  try {
    const { q = "", role, page = "1", limit = "10" } = req.query;
    if (typeof q !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query must be a string",
      });
    }

    // Validate role filter
    const allowedRoles = ["admin", "vendor", "customer"];

    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role filter",
      });
    }

    // Validate Pagination
    const currentPage = Number(page);
    const perPage = Number(limit);
    if (
      !Number.isInteger(currentPage) ||
      currentPage < 1 ||
      !Number.isInteger(perPage) ||
      perPage < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values",
      });
    }

    const safeLimit = Math.min(perPage, 50);
    const skip = (currentPage - 1) * safeLimit;

    // Build MongoDB query
    const filters = [];
    if (role) {
      filters.push({ role });
    }
    if (q.trim()) {
      const searchRegex = {
        $regex: escapeRegex(q.trim()),
        $options: "i",
      };

      filters.push({
        $or: [{ name: searchRegex }, { email: searchRegex }],
      });
    }

    const query = filters.length ? { $and: filters } : {};

    const userCollection = await getCollection("users");

    // Do not expose authentication secrets or unnecessary fields.
    const projection = {
      name: 1,
      email: 1,
      image: 1,
      role: 1,
      isBlocked: 1,
      businessName: 1,
      subscriptionPlan: 1,
      subscriptionExpiresAt: 1,
      createdAt: 1,
    };

    const [users, totalUsers] = await Promise.all([
      userCollection
        .find(query, { projection })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .toArray(),

      userCollection.countDocuments(query),
    ]);
    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users,
      pagination: {
        currentPage,
        limit: safeLimit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / safeLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};
// PATCH: /api/admin/users/:id/block
export const BlockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userCollection = await getCollection("users");

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Find the target user.
    const targetUser = await userCollection.findOne(buildUserIdQuery(id), {
      projection: {
        id: 1,
        role: 1,
        isBlocked: 1,
      },
    });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent an admin from blocking their own account
    if (getUserId(targetUser) === getUserId(req.user)) {
      return res.status(403).json({
        success: false,
        message: "You cannot block your own account",
      });
    }

    // Admin accounts cannot be blocked through this endpoint.
    if (targetUser.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot be blocked",
      });
    }

    // Update only the target user's blocked status.
    const result = await userCollection.updateOne(
      {
        _id: targetUser._id,
        role: { $ne: "admin" },
      },
      {
        $set: {
          isBlocked: true,
          updatedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "User could not be blocked",
      });
    }
    res.status(200).json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    next(error);
  }
};
// PATCH: /api/admin/users/:id/unblock
export const UnblockUser = async (req, res, next) => {
  try {
    const usersCollection = await getCollection("users");
    const id = req.params.id;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const targetUser = await usersCollection.findOne(buildUserIdQuery(id), {
      projection: {
        id: 1,
        role: 1,
        isBlocked: 1,
      },
    });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (targetUser.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot be modified here",
      });
    }
    const result = await usersCollection.updateOne(
      {
        _id: targetUser._id,
        role: { $ne: "admin" },
      },
      {
        $set: {
          isBlocked: false,
          updatedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "User could not be unblocked",
      });
    }

    res.status(200).json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    next(error);
  }
};
