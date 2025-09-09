const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Attendance = require('../models/Attendance');
const ExcelJS = require('exceljs');
const router = express.Router();

// ===================== UTILITY =====================
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // meters
  const toRad = (x) => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng/2) * Math.sin(dLng/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ===================== ENCRYPTION HELPERS =====================
const algorithm = 'aes-256-ctr';
const encryptionKeyHex = process.env.ENCRYPTION_KEY || null;

let encryptionKeyBuffer = null;
if (encryptionKeyHex) {
  try {
    encryptionKeyBuffer = Buffer.from(encryptionKeyHex, 'hex');
    if (encryptionKeyBuffer.length !== 32) {
      console.warn('ENCRYPTION_KEY should be 32 bytes. Current:', encryptionKeyBuffer.length);
      encryptionKeyBuffer = null;
    }
  } catch {
    console.warn('Invalid ENCRYPTION_KEY provided.');
    encryptionKeyBuffer = null;
  }
} else {
  console.warn('ENCRYPTION_KEY not set. Falling back to base64.');
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
    } catch {
      return null;
    }
  }
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  if (!encryptionKeyBuffer) return null;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, encryptionKeyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}



// ===================== CREATE ATTENDANCE =====================
router.post('/', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { className, courseName, date, startTime, endTime, lecturerLat, lecturerLng } = req.body;

    if (!className || !courseName || !date || !startTime || !endTime || !lecturerLat || !lecturerLng) {
      return res.status(400).json({ message: 'All fields including lecturer location are required' });
    }

    const attendance = new Attendance({
      lecturerId: decoded.id,
      className,
      courseName,
      date,
      startTime,
      endTime,
      lecturerLat,
      lecturerLng,
      status: 'Active',
      students: []
    });

    await attendance.save();
    res.status(201).json(attendance);
  } catch (err) {
    console.error('Error creating attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== MARK ATTENDANCE =====================
// ===================== MARK ATTENDANCE =====================
router.post('/mark', async (req, res) => {
  console.log("🟢 /api/attendance/mark endpoint hit!");
  console.log("📩 Request body:", req.body);

  const { className, date, endTime, studentName, indexNumber, latitude, longitude, deviceId } = req.body;

  try {
    const attendance = await Attendance.findOne({ className, date, endTime, status: 'Active' });
    if (!attendance) {
      console.warn("⚠️ No active attendance found for:", { className, date, endTime });
      return res.status(404).json({ message: 'Attendance session not found or not active' });
    }

    // 🔎 Debug logging
    console.log("---- ATTENDANCE DEBUG ----");
    console.log("📄 Attendance document from DB:", JSON.stringify(attendance, null, 2));
    console.log("📍 Student Location (from request):", latitude, longitude);
    console.log("📍 Lecturer Location (from DB):", attendance.lecturerLat, attendance.lecturerLng);

    const distance = calculateDistance(
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(attendance.lecturerLat),
      parseFloat(attendance.lecturerLng)
    );
    
    console.log("📏 Distance (student → lecturer):", distance, "meters");
    console.log("---------------------------");

    if (isNaN(distance)) {
      console.error("❌ Invalid coordinates detected.");
      return res.status(500).json({ message: 'Error: Invalid coordinates detected' });
    }

    if (distance > 10000) {  // ✅ threshold = 10 km
      console.warn(`❌ Student too far away: ${distance.toFixed(2)}m`);
      return res.status(403).json({ message: `You are not within the class vicinity. Distance: ${distance.toFixed(2)}m` });
    }

    // ✅ Prevent duplicate attendance (same index number OR same device)
    const alreadyMarked = attendance.students.some(stu => {
      try {
        return decrypt(stu.indexNumber) === indexNumber || stu.deviceId === deviceId;
      } catch {
        return false;
      }
    });
    if (alreadyMarked) {
      console.warn(`⚠️ Duplicate attempt detected (student: ${indexNumber}, device: ${deviceId}).`);
      return res.status(400).json({ message: 'This device or student has already marked attendance for this session' });
    }

    attendance.students.push({
      studentName: encrypt(studentName),
      indexNumber: encrypt(indexNumber),
      timestamp: new Date().toISOString(),
      location: { latitude, longitude },
      deviceId   // ✅ save deviceId for duplicate protection
    });
    await attendance.save();

    console.log(`✅ Attendance marked for student ${studentName} (${indexNumber}) on device ${deviceId}`);

    res.json({ message: 'Attendance marked successfully' });
  } catch (err) {
    console.error('🔥 Error marking attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});




// ===================== ACTIVE =====================
router.get('/active', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let attendances = await Attendance.find({
      lecturerId: decoded.id,
      status: 'Active'
    });

    attendances = attendances.map(att => ({
      ...att._doc,
      students: att.students.map(stu => ({
        ...stu._doc,
        studentName: decrypt(stu.studentName),
        indexNumber: decrypt(stu.indexNumber)
      }))
    }));

    res.json(attendances);
  } catch (err) {
    console.error('Error fetching active attendances:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== HISTORY =====================
router.get('/history', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let attendances = await Attendance.find({ lecturerId: decoded.id });

    attendances = attendances.map(att => ({
      ...att._doc,
      students: att.students.map(stu => ({
        ...stu._doc,
        studentName: decrypt(stu.studentName),
        indexNumber: decrypt(stu.indexNumber)
      }))
    }));

    res.json(attendances);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== CANCEL =====================
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
    if (!attendance) return res.status(404).json({ message: 'Not found or inactive' });

    attendance.status = 'Cancelled';
    await attendance.save();
    res.json({ message: 'Cancelled' });
  } catch (err) {
    console.error('Error cancelling attendance:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== CLEAR HISTORY =====================
router.delete('/clear-history', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await Attendance.deleteMany({ lecturerId: decoded.id });
    res.json({ message: 'History cleared' });
  } catch (err) {
    console.error('Error clearing history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== DOWNLOAD =====================
router.get('/download/:id', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const attendance = await Attendance.findOne({
      _id: req.params.id,
      lecturerId: decoded.id
    }).populate('lecturerId', 'name');

    if (!attendance) return res.status(404).json({ message: 'Not found' });

    const students = attendance.students.map(stu => ({
      name: decrypt(stu.studentName),
      indexNumber: decrypt(stu.indexNumber),
      timestamp: stu.timestamp
    }));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');

    // ✅ Heading rows
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = `Lecturer: ${attendance.lecturerId?.name || 'Unknown Lecturer'}`;
    ws.getCell('A1').font = { bold: true, size: 14 };

    ws.mergeCells('A2:D2');
    ws.getCell('A2').value = `Class: ${attendance.className}`;
    ws.getCell('A2').font = { bold: true, size: 12 };

    ws.mergeCells('A3:D3');
    ws.getCell('A3').value = `Course: ${attendance.courseName}`;
    ws.getCell('A3').font = { bold: true, size: 12 };

    ws.addRow([]); // empty row for spacing

    // ✅ Table header
    ws.addRow(['Student Name', 'Index Number', 'Time Taken', 'Date']).font = { bold: true };

    // ✅ Student rows
    students.forEach(s => {
      const dateObj = s.timestamp ? new Date(s.timestamp) : null;
      ws.addRow([
        s.name,
        s.indexNumber,
        dateObj ? dateObj.toLocaleTimeString() : '',
        dateObj ? dateObj.toLocaleDateString() : ''
      ]);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Attendance_${attendance.className}_${attendance.courseName}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error downloading:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ===================== DELETE =====================
router.delete('/:id', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const deleted = await Attendance.findOneAndDelete({
      _id: req.params.id,
      lecturerId: decoded.id
    });
    if (!deleted) return res.status(404).json({ message: 'Not found' });

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Error deleting:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ===================== ATTENDANCE HISTORY =====================
router.get('/history', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let attendances = await Attendance.find({
      lecturerId: decoded.id,
      status: { $in: ['Completed', 'Cancelled'] }
    }).sort({ date: -1 });

    // Decrypt student info
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
    console.error('Error fetching attendance history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
