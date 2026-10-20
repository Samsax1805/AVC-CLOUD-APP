const express = require("express");
const router = express.Router();
const UserauthController = require("../controllers/authController");
const passport = require("passport");
const protect = require("../middleware/authMiddleware");

router.post("/register", UserauthController.register);
router.post("/login", UserauthController.login);
// Accept ID tokens from Google Identity Services (client-side)
router.post("/google", UserauthController.google);
router.patch("/profile", protect, UserauthController.profile);
router.post("/section", protect, UserauthController.section);
router.get("/me", protect, UserauthController.me);

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"],session: false }));
router.get("/google/callback", passport.authenticate("google", { failureRedirect: "/login", session: false }), UserauthController.googleCallback);


router.get("/protected", protect, (req, res) => {
    res.json({ message: "You have accessed a protected route", user: req.user });
    console.log("Protected route accessed by user:", req.user);
});

module.exports = router;