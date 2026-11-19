// Responsibility: Prevent blocked users from accessing protected features

const checkIsBlocked = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Please sign in",
    });
  }
  if (req.user.isBlocked) {
    return res.status(403).json({
      success: false,
      message: "Your account has been blocked",
    });
  }
  next();
};

export default checkIsBlocked;
