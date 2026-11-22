/**
 * Responsibility:
 * - Return public approved and available menu items with vendor info.
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

import {
  vendorLookupStages,
  vendorShapeStages,
} from "../services/menuVendor.service.js";
import { GetMenuLocationsService } from "../services/menuService.service.js";

// GET: /api/menu
const GetAllMenuItems = async (req, res, next) => {
  try {
    const { q, category, location, sort, page, limit } = req.query;

    const query = buildMenuQuery({ q, category, location });
    const sortOption = getMenuSort(sort);
    const pagination = getPagination(page, limit);

    const menuCollection = await getCollection("menuItems");

    // Vendor eligibility must be applied before skip/limit. The count uses
    // the same eligibility pipeline so pagination metadata matches results.
    const eligibleVendorStages = vendorLookupStages();

    const [items, countRows] = await Promise.all([
      menuCollection
        .aggregate([
          { $match: query },
          ...eligibleVendorStages,
          { $sort: sortOption },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
          ...vendorShapeStages,
        ])
        .toArray(),

      menuCollection
        .aggregate([
          { $match: query },
          ...vendorLookupStages(),
          { $count: "totalItems" },
        ])
        .toArray(),
    ]);

    const totalItems = countRows[0]?.totalItems || 0;

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

    const items = await menuCollection
      .aggregate([
        { $match: { status: "approved", isAvailable: true } },

        // Lookup first, because Premium vendors must be sorted first.
        ...vendorLookupStages(),

        { $sort: { isPremiumVendor: -1, createdAt: -1, _id: -1 } },
        { $limit: 6 },

        ...vendorShapeStages,
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

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const menuCollection = await getCollection("menuItems");

    const [item] = await menuCollection
      .aggregate([
        {
          $match: {
            _id: new ObjectId(id),
            status: "approved",
            isAvailable: true,
          },
        },
        ...vendorLookupStages(),
        ...vendorShapeStages,
      ])
      .toArray();

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
const GetMenuLocations = async (req, res, next) => {
  try {
    // Get MongoDB menuItems collection
    const menuCollection = await getCollection("menuItems");

    // Retrieve unique locations
    const locations = await GetMenuLocationsService(menuCollection);

    return res.status(200).json({
      success: true,
      message: "Locations retrieved successfully",
      data: locations,
    });
  } catch (error) {
    next(error);
  }
};

export {
  GetAllMenuItems,
  GetFeaturedMenuItems,
  GetSingleMenuItem,
  GetMenuLocations,
};
w