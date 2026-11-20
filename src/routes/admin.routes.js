import { Router } from "express";

import verifyToken from "../middleware/verifyToken.js";
import checkBlocked from "../middleware/checkBlocked.js";
import requireRole from "../middleware/requireRole.js";
import GetAllTransactions from "../controllers/adminTransaction.controller.js";
import GetAdminStats from "../controllers/adminStats.controller.js";

import {
  GetAllUsers,
  BlockUser,
  UnblockUser,
} from "../controllers/adminUser.controller.js";

import {
  GetAllMenuItems,
  ApproveMenuItem,
  RejectMenuItem,
  UpdateMenuItemStatus,
  DeleteMenuItem,
} from "../controllers/adminItem.controller.js";

const router = Router();

// Every admin endpoints must pass all three middlewares
router.use(verifyToken, checkBlocked, requireRole("admin"));

// Admin Statistics
router.get("/stats", GetAdminStats);

// User Management
router.get("/users", GetAllUsers);
router.patch("/users/:id/block", BlockUser);
router.patch("/users/:id/unblock", UnblockUser);

// Menu item management
router.get("/items", GetAllMenuItems);
router.patch("/items/:id/approve", ApproveMenuItem);
router.patch("/items/:id/reject", RejectMenuItem);
router.patch("/items/:id/status", UpdateMenuItemStatus);
router.delete("/items/:id", DeleteMenuItem);

// Transaction management
router.get("/transactions", GetAllTransactions);
export default router;
