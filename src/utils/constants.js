export const ROLES = Object.freeze({
  ADMIN: "admin",
  VENDOR: "vendor",
  CUSTOMER: "customer",
});

export const USER_STATUS = Object.freeze({
  BLOCKED: true,
  ACTIVE: false,
});

export const SUBSCRIPTION_PLANS = Object.freeze({
  FREE: "free",
  PREMIUM: "premium",
});

export const MENU_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  INACTIVE: "inactive",
});

export const ORDER_STATUS = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

export const TRANSACTION_STATUS = Object.freeze({
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export const ALLOWED_PUBLIC_ROLES = Object.freeze([
  ROLES.VENDOR,
  ROLES.CUSTOMER,
]);

export const MENU_ITEM_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  INACTIVE: "inactive",
});

export const ACTIVE_MENU_ITEM_STATUSES = Object.freeze([
  MENU_ITEM_STATUS.PENDING,
  MENU_ITEM_STATUS.APPROVED,
]);

export const FREE_VENDOR_ACTIVE_ITEM_LIMIT = 3;
