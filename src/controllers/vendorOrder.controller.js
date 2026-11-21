import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { isValidObjectId } from "../utils/objectId.js";

const getVendorId = (user) => String(user.id || user._id);

const ALLOWED_ORDER_STATUSES = ["pending", "accepted", "rejected", "cancelled"];

const getPagination = (query) => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    return null;
  }

  const safeLimit = Math.min(limit, 100);

  return {
    page,
    limit: safeLimit,
    skip: (page - 1) * safeLimit,
  };
};

// GET /api/vendor/orders
export const GetVendorOrders = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const pagination = getPagination(req.query);

    if (!pagination) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values",
      });
    }

    const { status } = req.query;

    if (
      status !== undefined &&
      (typeof status !== "string" || !ALLOWED_ORDER_STATUSES.includes(status))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status filter",
      });
    }

    const orderCollection = await getCollection("orders");
    const usersCollection = await getCollection("users");

    // Vendor ID is always taken from the authenticated session.
    const filter = { vendorId };

    if (status) {
      filter.status = status;
    }

    const [orders, totalOrders] = await Promise.all([
      orderCollection
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .toArray(),

      orderCollection.countDocuments(filter),
    ]);

    // Fetch customer details in one query instead of querying per order.
    const customerIds = [
      ...new Set(orders.map((order) => String(order.customerId))),
    ];

    const customerConditions = [];

    if (customerIds.length) {
      customerConditions.push({ id: { $in: customerIds } });
      customerConditions.push({ _id: { $in: customerIds } });

      const objectIds = customerIds
        .filter((id) => isValidObjectId(id))
        .map((id) => new ObjectId(id));

      if (objectIds.length) {
        customerConditions.push({ _id: { $in: objectIds } });
      }
    }

    const customers = customerConditions.length
      ? await usersCollection
          .find(
            { $or: customerConditions },
            {
              projection: {
                name: 1,
                email: 1,
                image: 1,
              },
            },
          )
          .toArray()
      : [];

    const customerMap = new Map();

    for (const customer of customers) {
      if (customer.id) {
        customerMap.set(String(customer.id), customer);
      }

      if (customer._id) {
        customerMap.set(String(customer._id), customer);
      }
    }

    const ordersWithCustomerInfo = orders.map((order) => ({
      ...order,
      customerInfo: customerMap.get(String(order.customerId)) || null,
    }));

    return res.status(200).json({
      success: true,
      message: "Vendor orders retrieved successfully",
      data: ordersWithCustomerInfo,
      pagination: {
        currentPage: pagination.page,
        limit: pagination.limit,
        totalOrders,
        totalPages: Math.ceil(totalOrders / pagination.limit),
        hasNextPage:
          pagination.page < Math.ceil(totalOrders / pagination.limit),
        hasPrevPage: pagination.page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/vendor/orders/:id/status
export const UpdateVendorOrderStatus = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be accepted or rejected",
      });
    }

    const orderCollection = await getCollection("orders");

    // Atomic update:
    // - order must belong to this vendor
    // - order must still be pending
    const update = {
      $set: {
        status,
        updatedAt: new Date(),
      },
    };

    // A rejected order is no longer an active duplicate order.
    // Releasing this key allows the customer to order again.
    if (status === "rejected") {
      update.$unset = {
        activeOrderKey: "",
      };
    }

    const result = await orderCollection.updateOne(
      {
        _id: new ObjectId(id),
        vendorId,
        status: "pending",
      },
      update,
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
        currentStatus: existingOrder.status,
      });
    }

    const updatedOrder = await orderCollection.findOne({
      _id: new ObjectId(id),
      vendorId,
    });

    return res.status(200).json({
      success: true,
      message: `Order ${status} successfully`,
      data: updatedOrder,
    });
  } catch (error) {
    next(error);
  }
};
