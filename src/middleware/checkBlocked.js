const checkBlocked = (req, res, next) => {
  // User must be authenticated first
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Please sign in",
    });
  }

  // Reject blocked users
  if (req.user.isBlocked === true) {
    return res.status(403).json({
      success: false,
      message: "Your account has been blocked",
    });
  }

  next();
};

export default checkBlocked;
