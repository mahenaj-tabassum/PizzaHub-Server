import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { isValidObjectId } from "../utils/objectId.js";

const getVendorId = (user) => String(user.id || user._id);

// GET: /api/vendor/orders
export const GetVendorOrders = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const orderCollection = await getCollection("orders");

    const orders = await orderCollection
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Vendor orders retrieved successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/vendor/orders/:id/status
export const UpdateVendorOrderStatus = async (req, res, next) => {
  try {
    const orderCollection = await getCollection("orders");
    const vendorId = getVendorId(req.user);
    const { status } = req.body;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    // Vendor can only accept or reject an order.
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be accepted or rejected",
      });
    }

    // Atomic condition: order must belong to this vendor and its current status must still be pending
    const result = await orderCollection.updateOne(
      {
        _id: new ObjectId(id),
        vendorId,
        status: "pending",
      },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      const existingOrder = await orderCollection.findOne({
        _id: new ObjectId(id),
        vendorId,
      });
      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }
      return res.status(409).json({
        success: false,
        message: "Only pending orders can be accepted or rejected",
      });
    }
    res.status(200).json({
      success: true,
      message: `Order ${status} successfully`,
    });
  } catch (error) {
    next(error);
  }
};
