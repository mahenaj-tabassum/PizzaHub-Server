/**
 * Responsibility:
 * - Return public approved and available menu items.
 * - Support search, category/location filters, sorting and pagination.
 * - Return featured menu items with active Premium vendors prioritized.
 * - Return public details of a single menu item.
 */

import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

import {
  buildMenuQuery,
  getMenuSort,
  getPagination,
  MenuQueryValidationError,
} from "../services/menuQuery.service.js";

// GET: /api/menu
const GetAllMenuItems = async (req, res, next) => {
  try {
    const { q, category, location, sort, page, limit } = req.query;

    // Build and validate query.
    const query = buildMenuQuery({
      q,
      category,
      location,
    });

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

    const totalPages = Math.ceil(totalItems / pagination.limit);

    return res.status(200).json({
      success: true,
      message: "Menu items retrieved successfully",
      data: items,
      pagination: {
        currentPage: pagination.page,
        limit: pagination.limit,
        totalItems,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPrevPage: pagination.page > 1,
      },
    });
  } catch (error) {
    if (error instanceof MenuQueryValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};

// GET: /api/menu/featured
const GetFeaturedMenuItems = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");

    const now = new Date();

    const items = await menuCollection
      .aggregate([
        {
          $match: {
            status: "approved",
            isAvailable: true,
            isFeatured: true,
          },
        },

        // Find the vendor's subscription information.
        {
          $lookup: {
            from: "users",
            let: {
              itemVendorId: "$vendorId",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      {
                        $eq: ["$id", "$$itemVendorId"],
                      },
                      {
                        $eq: [{ $toString: "$_id" }, "$$itemVendorId"],
                      },
                    ],
                  },
                },
              },
              {
                $project: {
                  subscriptionPlan: 1,
                  subscriptionExpiresAt: 1,
                },
              },
            ],
            as: "vendorInfo",
          },
        },

        {
          $addFields: {
            vendorInfo: {
              $arrayElemAt: ["$vendorInfo", 0],
            },
          },
        },

        // A Premium subscription must not be expired.
        {
          $addFields: {
            isPremiumVendor: {
              $and: [
                {
                  $eq: ["$vendorInfo.subscriptionPlan", "premium"],
                },
                {
                  $gt: ["$vendorInfo.subscriptionExpiresAt", now],
                },
              ],
            },
          },
        },

        // Premium vendor items appear first.
        {
          $sort: {
            isPremiumVendor: -1,
            createdAt: -1,
            _id: -1,
          },
        },

        {
          $limit: 6,
        },

        // Do not expose internal lookup fields.
        {
          $project: {
            vendorInfo: 0,
            isPremiumVendor: 0,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
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

    // Validate MongoDB ObjectId.
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

    return res.status(200).json({
      success: true,
      message: "Menu item retrieved successfully",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export { GetAllMenuItems, GetFeaturedMenuItems, GetSingleMenuItem };
