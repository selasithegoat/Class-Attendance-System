const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Attendance = require('../models/Attendance');
const Lecturer = require('../models/Lecturer'); // Make sure this path is correct
const ExcelJS = require('exceljs');
const router = express.Router();

const algorithm = 'aes-256-ctr';
const encryptionKeyHex = process.env.ENCRYPTION_KEY || null;

// Try to build a Buffer from ENCRYPTION_KEY if provided and valid hex
let encryptionKeyBuffer = null;
if (encryptionKeyHex) {
  try {
    encryptionKeyBuffer = Buffer.from(encryptionKeyHex, 'hex');
    if (encryptionKeyBuffer.length !== 32) {
      console.warn('ENCRYPTION_KEY should be 32 bytes (64 hex chars). Current key length:', encryptionKeyBuffer.length);
      encryptionKeyBuffer = null;
    }
  } catch (err) {
    console.warn('Invalid ENCRYPTION_KEY provided (not valid hex). Falling back to non-AES mode.', err.message);
    encryptionKeyBuffer = null;
  }
} else {
  console.warn('ENCRYPTION_KEY not set. Falling back to base64 encoding (not secure). Set ENCRYPTION_KEY to enable AES encryption.');
}

function encrypt(text) {
  if (text == null) return null;
  text = String(text);
  if (!encryptionKeyBuffer) {
    return `b64:${Buffer.from(text, 'utf8').toString('base64')}`;
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, encryptionKeyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (text == null) return null;
  if (typeof text !== 'string') return text;
  if (text.startsWith('b64:')) {
    try {
      return Buffer.from(text.slice(4), 'base64').toString('utf8');
    } catch (err) {
      console.warn('Failed to base64-decode value:', err.message);
      return null;
    }
  }
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  const [ivString, encryptedString] = parts;
  if (!/^[0-9a-fA-F]+$/.test(ivString) || !/^[0-9a-fA-F]+$/.test(encryptedString)) return text;
  if (!encryptionKeyBuffer) {
    console.warn('ENCRYPTION_KEY missing — cannot decrypt AES value. Returning null.');
    return null;
  }
  try {
    const iv = Buffer.from(ivString, 'hex');
    const encryptedText = Buffer.from(encryptedString, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, encryptionKeyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Error during decrypt:', err.message);
    return null;
  }
}

// ===================== CREATE ATTENDANCE SESSION =====================
router.post('/', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { className, courseName, date, startTime, endTime } = req.body;
    if (!className || !courseName || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const attendance = new Attendance({
      lecturerId: decoded.id,
      className,
      courseName,
      date,
      startTime,
      endTime,
      status: 'Active',
      students: []
    });
    await attendance.save();
    res.status(201).json({ message: 'Attendance created successfully', attendance });
  } catch (err) {
    console.error('Error creating attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== MARK ATTENDANCE =====================
router.post('/mark', async (req, res) => {
  const { className, date, endTime, studentName, indexNumber, latitude, longitude } = req.body;
  if (!studentName || !indexNumber) {
    return res.status(400).json({ message: 'Student name and index number are required' });
  }
  try {
    const attendance = await Attendance.findOne({
      className,
      date,
      endTime,
      status: 'Active'
    });
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance session not found or not active' });
    }
    const alreadyMarked = attendance.students.some(stu => {
      try {
        return decrypt(stu.indexNumber) === indexNumber;
      } catch {
        return false;
      }
    });
    if (alreadyMarked) {
      return res.status(400).json({ message: 'Student has already marked attendance' });
    }
    attendance.students.push({
      studentName: encrypt(studentName),
      indexNumber: encrypt(indexNumber),
      timestamp: new Date().toISOString(),
      location: { latitude, longitude }
    });
    await attendance.save();
    res.json({ message: 'Attendance marked successfully' });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== HISTORY =====================
router.get('/history', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let attendances = await Attendance.find({
      lecturerId: decoded.id,
      status: { $in: ['Completed', 'Cancelled'] }
    }).populate('lecturerId', 'name');
    attendances = attendances.map(att => {
      att.students = att.students
        .filter(stu => stu.studentName && stu.indexNumber)
        .map(stu => ({
          ...stu._doc,
          studentName: decrypt(stu.studentName),
          indexNumber: decrypt(stu.indexNumber)
        }));
      return att;
    });
    res.json(attendances);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== ACTIVE =====================
router.get('/active', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const now = new Date();
    let attendances = await Attendance.find({
      lecturerId: decoded.id,
      status: 'Active',
      $expr: {
        $gt: [{ $concat: ['$date', 'T', '$endTime', ':00Z'] }, now.toISOString()]
      }
    });
    attendances = attendances.map(att => {
      att.students = att.students
        .filter(stu => stu.studentName && stu.indexNumber)
        .map(stu => ({
          ...stu._doc,
          studentName: decrypt(stu.studentName),
          indexNumber: decrypt(stu.indexNumber)
        }));
      return att;
    });
    res.json(attendances);
  } catch (err) {
    console.error('Error fetching active attendances:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== CANCEL ATTENDANCE =====================
router.put('/cancel/:id', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const attendance = await Attendance.findOne({
      _id: req.params.id,
      lecturerId: decoded.id,
      status: 'Active'
    });
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance not found or not active' });
    }
    attendance.status = 'Cancelled';
    await attendance.save();
    res.json({ message: 'Attendance cancelled successfully' });
  } catch (err) {
    console.error('Error cancelling attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// CLEAR ALL ATTENDANCE HISTORY - must come BEFORE /:id
router.delete('/clear-history', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Delete all attendances for this lecturer
    await Attendance.deleteMany({ lecturerId: decoded.id });

    res.json({ message: 'All attendance history cleared successfully' });
  } catch (err) {
    console.error('Error clearing history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== DOWNLOAD ATTENDANCE =====================
router.get('/download/:id', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const attendance = await Attendance.findOne({
      _id: req.params.id,
      lecturerId: decoded.id
    }).populate('lecturerId', 'name');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance not found' });
    }

    // Decrypt student details
    const students = attendance.students.map(stu => ({
      name: decrypt(stu.studentName),
      indexNumber: decrypt(stu.indexNumber),
      timestamp: stu.timestamp
    }));

    // Create Excel file
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');

    // Heading
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = `Lecturer: ${attendance.lecturerId?.name || 'Unknown'}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:D2');
    ws.getCell('A2').value = `Class: ${attendance.className}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.mergeCells('A3:D3');
    ws.getCell('A3').value = `Course: ${attendance.courseName}`;
    ws.getCell('A3').alignment = { horizontal: 'center' };


    // Table headers
    ws.addRow(['Student Name', 'Index Number', 'Time Taken', 'Date']);
    ws.getRow(5).font = { bold: true };

    // Add student data
    students.forEach(s => {
      const dateObj = s.timestamp ? new Date(s.timestamp) : null;
      const timeTaken = dateObj ? dateObj.toLocaleTimeString() : '';
      const dateTaken = dateObj ? dateObj.toLocaleDateString() : '';
      ws.addRow([s.name, s.indexNumber, timeTaken, dateTaken]);
    });

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Attendance_${attendance.className}_${attendance.courseName}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error downloading attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// DELETE SINGLE ATTENDANCE
router.delete('/:id', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔑 Remove status restriction — delete if lecturer owns it
    const deleted = await Attendance.findOneAndDelete({
      _id: req.params.id,
      lecturerId: decoded.id
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Attendance not found' });
    }

    res.json({ message: 'Attendance deleted successfully' });
  } catch (err) {
    console.error('Error deleting attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



``
module.exports = router;
