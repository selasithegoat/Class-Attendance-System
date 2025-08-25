const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Lecturer = require('../models/Lecturer');
const Admin = require('../models/Admin');
const Attendance = require('../models/Attendance');
const router = express.Router();

// ===================== Middleware =====================
const verifyAdmin = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(403).json({ message: 'Admin access required' });
    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const verifyLecturer = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const lecturer = await Lecturer.findById(decoded.id);
    if (!lecturer) return res.status(403).json({ message: 'Lecturer access required' });
    req.lecturer = lecturer;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ===================== ADMIN ROUTES =====================

// ===================== ADMIN REGISTER =====================
router.post('/admin/register', async (req, res) => {
  try {
    const { username, password, secretKey } = req.body;

    if (secretKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: 'Invalid secret key' });
    }

    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // ❌ Don't hash here — schema will hash automatically
    const admin = new Admin({ username, password });
    await admin.save();

    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (err) {
    console.error('Error registering admin:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

  

// ===================== ADMIN LOGIN =====================
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("🟢 Login body received:", req.body);


    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log("🟢 Login attempt:", username, password);
    console.log("👉 Stored hash:", admin.password);

    const isMatch = await bcrypt.compare(password, admin.password);
    console.log("🔍 Password match result:", isMatch);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error logging in admin:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== ADMIN VERIFY =====================
router.get('/admin/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    res.json({ ...admin.toObject(), isAdmin: true });
  } catch (err) {
    console.error('Error in /admin/me route:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ===================== LECTURER REGISTER =====================
router.post('/register', async (req, res) => {
  try {
    const { lecturerId, name, password } = req.body;

    if (!lecturerId || !name || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingLecturer = await Lecturer.findOne({ lecturerId });
    if (existingLecturer) {
      return res.status(400).json({ message: 'Lecturer ID already exists' });
    }

    // ❌ Don’t hash here, schema will hash automatically
    const newLecturer = new Lecturer({ lecturerId, name, password });
    await newLecturer.save();

    res.status(201).json({ message: 'Lecturer registered successfully' });
  } catch (err) {
    console.error('❌ Error registering lecturer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// ===================== LECTURER LOGIN =====================
router.post('/login', async (req, res) => {
  try {
    const { lecturerId, password } = req.body;

    const lecturer = await Lecturer.findOne({ lecturerId });
    if (!lecturer) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, lecturer.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: lecturer._id, isLecturer: true },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error logging in lecturer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== LECTURER VERIFY =====================
router.get('/lecturer/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const lecturer = await Lecturer.findById(decoded.id).select('-password');
    if (!lecturer) return res.status(404).json({ message: 'Lecturer not found' });

    res.json({ ...lecturer.toObject(), isLecturer: true });
  } catch (err) {
    console.error('Error in /lecturer/me route:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ===================== GET ALL LECTURERS (Admin only) =====================
router.get('/admin/lecturers', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin) return res.status(403).json({ message: 'Not authorized' });

    const lecturers = await Lecturer.find().select('-password');
    res.json(lecturers);
  } catch (err) {
    console.error('Error fetching lecturers:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== Update Lecturer =====================
router.put('/lecturers/:id', verifyAdmin, async (req, res) => {
  const { lecturerId, name, password } = req.body;
  try {
    const lecturer = await Lecturer.findById(req.params.id);
    if (!lecturer) return res.status(404).json({ message: 'Lecturer not found' });
    if (lecturer.isAdmin) return res.status(403).json({ message: 'Cannot modify admin accounts' });

    if (lecturerId) lecturer.lecturerId = lecturerId;
    if (name) lecturer.name = name;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      lecturer.password = await bcrypt.hash(password, salt);
    }

    lecturer.lastUpdated = new Date();
    await lecturer.save();
    res.json({ message: 'Lecturer updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE attendance by ID
router.delete('/:id', async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance not found' });
    }
    res.json({ message: 'Attendance deleted successfully' });
  } catch (err) {
    console.error('Error deleting attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
