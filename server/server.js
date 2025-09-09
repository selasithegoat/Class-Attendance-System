const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance'); // your routes/attendance.js file
const cron = require('node-cron');
const Attendance = require('./models/Attendance');
const fs = require('fs'); // For file existence check

dotenv.config();
console.log('Loaded MONGO_URI:', process.env.MONGO_URI);
console.log('Loaded JWT_SECRET:', process.env.JWT_SECRET);
console.log('Loaded PORT:', process.env.PORT);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve login.html for direct requests with debugging
app.get('/login.html', (req, res) => {
    const filePath = path.join(__dirname, '../client/login.html');
    console.log('Attempting to serve login.html from:', filePath);
    if (fs.existsSync(filePath)) {
        console.log('File exists, serving...');
        res.sendFile(filePath);
    } else {
        console.log('File not found at:', filePath);
        res.status(404).send('File not found');
    }
});

// Serve login page as default route
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, '../client/login.html');
    console.log('Serving default route from:', filePath);
    res.sendFile(filePath);
});

// API routes
app.use('/api/auth', (req, res, next) => {
    if (req.path === '/me') {
        console.log('🔑 /api/auth/me endpoint hit!');
    }
    next();
}, authRoutes);

// ✅ Changed from singular to plural
app.use('/api/attendance', attendanceRoutes);

app.use('/api/auth', authRoutes);

// Debug route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running' });
});

// Catch-all route for client-side routing (exclude API routes)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        const filePath = path.join(__dirname, '../client/index.html');
        console.log('Serving catch-all route from:', filePath);
        res.sendFile(filePath);
    } else {
        res.status(404).send('API route not found');
    }
});

// Connect to MongoDB
const connectDB = require('./config/db');
connectDB();

// Cron job to update expired sessions every minute
cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
        const expiredSessions = await Attendance.find({
            status: 'Active',
            $expr: { $lt: [{ $concat: ['$date', 'T', '$endTime', ':00Z'] }, now.toISOString()] }
        });
        for (const session of expiredSessions) {
            session.status = 'Completed';
            await session.save();
            console.log(`Updated session ${session._id} to Completed at ${now}`);
        }
    } catch (err) {
        console.error('Cron job error:', err);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
