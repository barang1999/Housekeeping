const mongoose = require("mongoose");

// ✅ Define the DND schema only once
const dndSchema = new mongoose.Schema({
    roomNumber: { type: Number, required: true, unique: true },
    dndStatus: { type: Boolean, default: false }
});

// ✅ Prevent duplicate model declaration
const RoomDND = mongoose.models.RoomDND || mongoose.model("RoomDND", dndSchema);

module.exports = RoomDND; // ✅ Export the model correctly
