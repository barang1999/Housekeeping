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

app.get("/", (req, res) => {
  res.send("Backend is working!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
