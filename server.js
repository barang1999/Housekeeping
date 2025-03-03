const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Allow requests from your Netlify frontend
const corsOptions = {
  origin: "*", // Allows requests from anywhere
  methods: "GET,POST",
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Simulating a database with an array
const users = [];

// ✅ Signup endpoint (stores users)
app.post("/auth/signup", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }

    // Check if user already exists
    const existingUser = users.find(user => user.username === username);
    if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
    }

    // Store the user
    users.push({ username, password });
console.log("Current users:", users); // ✅ Debugging step
    res.status(201).json({ message: "User registered successfully" });
});

// ✅ Login endpoint (validates credentials)
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Missing fields" });
    }

    // Check if user exists
    const user = users.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials. Please try again." });
    }

    res.status(200).json({ message: "Login successful" });
});

// ✅ Keep your existing GET endpoint
app.get("/", (req, res) => {
  res.send("Backend is working!");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
