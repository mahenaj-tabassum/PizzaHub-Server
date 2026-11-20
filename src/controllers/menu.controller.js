/**
 * Responsibility:
 * - Handle HTTP requests related to retrieving menu items.
 * - Fetch all approved and available menu items with search, filtering, sorting, and pagination.
 * - Retrieve featured menu items for the featured section.
 * - Retrieve a single menu item by its MongoDB ObjectId.
 */

import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

import {
  buildMenuQuery,
  getMenuSort,
  getPagination,
} from "../services/menuQuery.service.js";

// GET: /api/menu
const GetAllMenuItems = async (req, res, next) => {
  try {
    const { q, category, location, sort, page, limit } = req.query;

    const query = buildMenuQuery({ q, category, location });

    const sortOption = getMenuSort(sort);
    const pagination = getPagination(page, limit);

    const menuCollection = await getCollection("menuItems");

    const [items, totalItems] = await Promise.all([
      menuCollection
        .find(query)
        .sort(sortOption)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .toArray(),

      menuCollection.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: "Menu items retrieved successfully",
      data: items,
      pagination: {
        currentPage: pagination.page,
        limit: pagination.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / pagination.limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET: /api/menu/featured

const GetFeaturedMenuItems = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const items = await menuCollection
      .find({
        status: "approved",
        isAvailable: true,
        isFeatured: true,
      })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.status(200).json({
      success: true,
      message: "Featured menu items retrieved successfully",
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

// GET: /api/menu/:id
const GetSingleMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }
    const menuCollection = await getCollection("menuItems");
    const item = await menuCollection.findOne({
      _id: new ObjectId(id),
      status: "approved",
      isAvailable: true,
    });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Menu item retrieved successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export { GetAllMenuItems, GetFeaturedMenuItems, GetSingleMenuItem };
