import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

// Get authenticated customer's ID
const getCustomerId = (user) => {
  return String(user.id || user._id);
};

// Generate a unique key for an active order
const createActiveOrderKey = (customerId, itemId, deliveryDate) => {
  return JSON.stringify([customerId, itemId, deliveryDate]);
};

// 1. Create Order
// POST: /api/orders

export const CreateOrder = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const orderCollection = await getCollection("orders");

    const customerId = getCustomerId(req.user);

    const { itemId, deliveryDate, deliveryAddress, message = "" } = req.body;

    // 1. Find approved and available menu item
    const item = await menuCollection.findOne({
      _id: new ObjectId(itemId),
      status: "approved",
      isAvailable: true,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or unavailable",
      });
    }

    // 2. Prevent ordering own menu item
    if (String(item.vendorId) === customerId) {
      return res.status(403).json({
        success: false,
        message: "You cannot order your own menu item",
      });
    }

    // 3. Generate unique active order key
    const activeOrderKey = createActiveOrderKey(
      customerId,
      itemId,
      deliveryDate,
    );

    // 4. Create order document
    const newOrder = {
      itemId,

      // Vendor ID comes from database
      vendorId: String(item.vendorId),

      // Customer ID comes from authenticated user
      customerId,

      // Save item information at order time
      itemSnapshot: {
        itemName: item.itemName,
        price: item.price,
        images: Array.isArray(item.images) ? item.images : [],
      },

      deliveryDate,
      deliveryAddress: deliveryAddress.trim(),
      message: message.trim(),

      // Pending by default
      status: "pending",

      // Used for duplicate active order protection
      activeOrderKey,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 5. Insert order
    try {
      const result = await orderCollection.insertOne(newOrder);

      return res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: {
          _id: result.insertedId,
          ...newOrder,
        },
      });
    } catch (error) {
      // Unique index conflict
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "You already have an active order for this item and delivery date",
        });
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// 2. Get My Orders
// GET: /api/orders/my-orders

export const GetMyOrders = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req.user);

    const orderCollection = await getCollection("orders");

    const orders = await orderCollection
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Your orders retrieved successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Get Single Order Details
// GET: /api/orders/:id

export const GetOrderDetails = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req.user);

    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const orderCollection = await getCollection("orders");

    // Only find an order belonging to this customer
    const order = await orderCollection.findOne({
      _id: new ObjectId(id),
      customerId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order details retrieved successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Cancel Pending Order
// PATCH: /api/orders/:id/cancel

export const CancelOrder = async (req, res, next) => {
  try {
    const orderCollection = await getCollection("orders");

    const customerId = getCustomerId(req.user);

    const { id } = req.params;

    // Validate order ID
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    // Only pending orders belonging to this customer can be cancelled
    const result = await orderCollection.updateOne(
      {
        _id: new ObjectId(id),
        customerId,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
        $unset: {
          activeOrderKey: "",
        },
      },
    );

    if (result.matchedCount === 0) {
      // Check whether the order belongs to this customer
      const order = await orderCollection.findOne({
        _id: new ObjectId(id),
        customerId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(409).json({
        success: false,
        message: `This order cannot be cancelled because its status is ${order.status}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};
