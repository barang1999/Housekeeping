const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Allow requests from your Netlify frontend
const corsOptions = {
  origin: "https://housekeepingmanagement.netlify.app", // Change this to match your frontend URL
  methods: "GET,POST",
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Example signup endpoint
app.post("/auth/signup", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }
    res.status(201).json({ message: "User registered successfully" });
});

app.get("/", (req, res) => {
  res.send("Backend is working!");
});

// ✅ Ensure correct Railway PORT usage
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {  // 🚀 Ensure it's accessible on Railway
  console.log(`Server is running on port ${PORT}`);
});
