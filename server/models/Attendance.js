const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  className: { type: String, required: true },
  courseName: { type: String, required: true },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer', required: true },
  status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active' },
  students: [{
    studentName: String,
    indexNumber: String,
    timestamp: String,
    location: {
      latitude: Number,
      longitude: Number,
    },
  }],
});

module.exports = mongoose.model('Attendance', attendanceSchema);