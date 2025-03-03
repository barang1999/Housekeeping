const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Allow requests from multiple frontends
const corsOptions = {
  origin: ["https://housekeepingmanagement.netlify.app", "http://localhost:3000"], // Add both production and local URLs
  methods: "GET,POST",
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Simulated user database (for testing)
const users = [];

// ✅ Signup endpoint
app.post("/auth/signup", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Missing username or password" });
    }

    // Check if user already exists
    const userExists = users.find(user => user.username === username);
    if (userExists) {
        return res.status(409).json({ message: "User already exists" });
    }

    // Store user (not secure for real apps, use a database)
    users.push({ username, password });
    res.status(201).json({ message: "User registered successfully" });
});

// ✅ Login endpoint
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Missing username or password" });
    }

    // Check if user exists
    const user = users.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({ message: "Login successful" });
});

// ✅ Test route
app.get("/", (req, res) => {
  res.send("Backend is working!");
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
