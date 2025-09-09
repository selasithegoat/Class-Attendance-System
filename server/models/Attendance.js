const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true
  },
  courseName: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: String, // ISO date string (YYYY-MM-DD)
    required: true
  },
  startTime: {
    type: String, // HH:mm
    required: true
  },
  endTime: {
    type: String, // HH:mm
    required: true
  },

  // Link to lecturer
  lecturerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecturer',
    required: true
  },

  // ✅ Lecturer location at session creation
  lecturerLat: {
    type: Number,
    required: true
  },
  lecturerLng: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ['Active', 'Completed', 'Cancelled'],
    default: 'Active'
  },

  // Students who marked attendance
  students: [
    {
      studentName: { type: String },
      indexNumber: { type: String },
      timestamp: { type: String }, // ISO timestamp
      location: {
        latitude: { type: Number },
        longitude: { type: Number }
      }
    }
  ]
}, {
  timestamps: true // adds createdAt, updatedAt automatically
});

module.exports = mongoose.model('Attendance', attendanceSchema);
