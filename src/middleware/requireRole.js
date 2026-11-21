import { ROLES } from "../utils/constants.js";

const VALID_ROLES = Object.values(ROLES);

const requireRole = (...allowedRoles) => {
  // Validate middleware configuration
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !VALID_ROLES.includes(role))
  ) {
    throw new Error("Invalid role configuration in requireRole");
  }

  return (req, res, next) => {
    // Authentication check
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Please sign in",
      });
    }

    // Authorization check
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not have permission",
      });
    }

    next();
  };
};

export default requireRole;
