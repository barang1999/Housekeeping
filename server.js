const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Allow requests from your Netlify frontend
const corsOptions = {
  origin: "https://housekeepingmanagement.netlify.app", // Make sure this matches your frontend URL
  methods: "GET,POST",
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Fix: Add the missing login endpoint
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }
    res.status(200).json({ message: "Login successful" });
});

// ✅ Keep your existing endpoints
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
