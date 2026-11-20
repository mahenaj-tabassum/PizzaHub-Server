import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

const findItemById = async (id) => {
  if (!isValidId(id)) return null;
  const collection = await getCollection("menuItems");
  return collection.findOne({ _id: new ObjectId(id) });
};

// GET: /api/admin/items
// Get all menu items with search, status filter and pagination
export const GetAllMenuItems = async (req, res, next) => {
  try {
    const { q = "", status, page = "1", limit = "10" } = req.query;
    const currentPage = Number(page);
    const perPage = Number(limit);
    const safeLimit = Math.min(perPage, 50);
    const skip = (currentPage - 1) * safeLimit;
    const filters = [];
    const menuCollection = await getCollection("menuItems");

    if (typeof q !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query must be a string",
      });
    }

    const allowedStatuses = ["pending", "approved", "rejected", "inactive"];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item status",
      });
    }

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

    if (status) {
      filters.push({ status });
    }

    if (q.trim()) {
      const searchRegex = {
        $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };

      filters.push({
        $or: [
          { itemName: searchRegex },
          { category: searchRegex },
          { location: searchRegex },
        ],
      });
    }

    const query = filters.length ? { $and: filters } : {};

    const [items, totalItems] = await Promise.all([
      menuCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .toArray(),
      menuCollection.countDocuments(query),
    ]);
    res.status(200).json({
      success: true,
      message: "Menu items retrieved successfully",
      data: items,
      pagination: {
        currentPage,
        limit: safeLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / safeLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/admin/items/:id/approve
// Only pending items can be approved.
export const ApproveMenuItem = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const id = req.params.id;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }
    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        status: "pending",
      },
      {
        $set: {
          status: "approved",
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      const item = await findItemById(id);
      return res.status(item ? 409 : 404).json({
        message: item
          ? "Only pending items can be approved"
          : "Menu item not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Menu item approved successfully",
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/admin/items/:id/reject
// Only pending items can be rejected
export const RejectMenuItem = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const id = req.params.id;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
          updatedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      const item = await findItemById(id);

      return res.status(item ? 409 : 404).json({
        success: false,
        message: item
          ? "Only pending items can be rejected"
          : "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Menu item rejected successfully",
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/admin/items/:id/status
// Admin can change an item's publication status.
export const UpdateMenuItemStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const menuCollection = await getCollection("menuItems");

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    // Generic status update is for approved/inactive items.
    // Pending items should go through approve/reject endpoints.
    const allowedStatuses = ["approved", "inactive"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or inactive",
      });
    }

    const result = await menuCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `Menu item status updated to ${status}`,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE: /api/admin/items/:id

export const DeleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const menuCollection = await getCollection("menuItems");

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const result = await menuCollection.deleteOne({
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
