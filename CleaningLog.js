const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
    roomNumber: { type: Number, required: true },
    startTime: { type: String, default: null },
    startedBy: { type: String, default: null },
    finishTime: { type: String, default: null },
    finishedBy: { type: String, default: null },
    dndStatus: { type: Boolean, default: false }
});

const CleaningLog = mongoose.model("CleaningLog", logSchema);
module.exports = CleaningLog;
