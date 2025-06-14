const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startScannerBtn = document.getElementById("start-scanner");
const scanStatus = document.getElementById("scan-status");
const attendanceContainer = document.getElementById("attendance-container");
const attendanceForm = document.getElementById("attendance-form");
const attendanceStatus = document.getElementById("attendance-status");
const classInfo = document.getElementById("class-info");
const cancelBtn = document.getElementById("cancel-btn");

// Mock school location (latitude, longitude, and radius in meters)
const SCHOOL_LOCATION = {
    latitude: 5.6037, // Example: San Francisco coordinates
    longitude: -0.1870,
    radius: 10000 // 100 meters radius
};

let stream = null;

// Check for URL query parameters on page load
window.addEventListener("load", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const qrData = {
        class: urlParams.get("class"),
        course: urlParams.get("course"),
        date: urlParams.get("date"),
        start: urlParams.get("start"),
        end: urlParams.get("end")
    };

    // Validate that all required parameters are present
    if (qrData.class && qrData.course && qrData.date && qrData.start && qrData.end) {
        attendanceContainer.style.display = "block";
        startScannerBtn.style.display = "none";
        scanStatus.textContent = "Attendance details loaded.";
        attendanceForm.dataset.qrData = JSON.stringify(qrData);
        displayClassInfo(qrData);
    }
});

startScannerBtn.addEventListener("click", async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        video.style.display = "block";
        canvas.style.display = "block";
        startScannerBtn.style.display = "none";
        scanStatus.textContent = "Scanning QR code...";
        video.play();
        requestAnimationFrame(tick);
    } catch (err) {
        scanStatus.textContent = "Error accessing camera: " + err.message;
    }
});

function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            try {
                // Parse QR code data as a URL
                const url = new URL(code.data);
                const qrData = {
                    class: url.searchParams.get("class"),
                    course: url.searchParams.get("course"),
                    date: url.searchParams.get("date"),
                    start: url.searchParams.get("start"),
                    end: url.searchParams.get("end")
                };
                if (qrData.class && qrData.course && qrData.date && qrData.start && qrData.end) {
                    scanStatus.textContent = "QR code scanned successfully!";
                    video.style.display = "none";
                    canvas.style.display = "none";
                    attendanceContainer.style.display = "block";
                    stopCamera();
                    attendanceForm.dataset.qrData = JSON.stringify(qrData);
                    displayClassInfo(qrData);
                } else {
                    scanStatus.textContent = "Invalid QR code data.";
                }
            } catch (err) {
                scanStatus.textContent = "Invalid QR code data.";
            }
        } else {
            requestAnimationFrame(tick);
        }
    } else {
        requestAnimationFrame(tick);
    }
}

function displayClassInfo(qrData) {
    classInfo.innerHTML = `
        <p><strong>Class:</strong> ${qrData.class}</p>
        <p><strong>Course:</strong> ${qrData.course}</p>
        <p><strong>Date:</strong> ${qrData.date}</p>
        <p><strong>Time:</strong> ${qrData.start} - ${qrData.end}</p>
    `;
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

cancelBtn.addEventListener("click", () => {
    attendanceContainer.style.display = "none";
    startScannerBtn.style.display = "block";
    scanStatus.textContent = "Tap to start scanning";
    attendanceForm.reset();
    stopCamera();
    // Clear any stored attendance flag on cancel
    const qrData = JSON.parse(attendanceForm.dataset.qrData || '{}');
    if (qrData.class && qrData.date && qrData.end) {
        const attendanceKey = `attendance_${qrData.class}_${qrData.date}_${qrData.end}`;
        localStorage.removeItem(attendanceKey);
    }
});

attendanceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    attendanceStatus.textContent = "Verifying location...";

    try {
        const qrData = JSON.parse(attendanceForm.dataset.qrData);
        const classStartTime = new Date(`${qrData.date}T${qrData.start}`);
        const classEndTime = new Date(`${qrData.date}T${qrData.end}`);
        const currentTime = new Date();

        // Check if device has already taken attendance for this class
        const attendanceKey = `attendance_${qrData.class}_${qrData.date}_${qrData.end}`;
        const attendedData = localStorage.getItem(attendanceKey);

        if (attendedData) {
            const attendedEndTime = new Date(JSON.parse(attendedData).endTime);
            if (currentTime < attendedEndTime) {
                attendanceStatus.textContent = "This device has already marked attendance for this class. Please wait until the class ends.";
                return;
            } else {
                // Class has ended, clear the flag
                localStorage.removeItem(attendanceKey);
            }
        }

        if (currentTime > classEndTime) {
            attendanceStatus.textContent = "Cannot mark attendance: Class has already ended.";
            return;
        }

        if (currentTime < classStartTime) {
            attendanceStatus.textContent = "Cannot mark attendance: Class has not yet started.";
            return;
        }

        const position = await getCurrentPosition();
        const { latitude, longitude } = position.coords;
        const isWithinSchool = checkSchoolLocation(latitude, longitude);

        if (!isWithinSchool) {
            attendanceStatus.textContent = "Cannot mark attendance: You are not within the school premises.";
            return;
        }

        const studentName = document.getElementById("student-name").value.trim();
        const indexNumber = document.getElementById("index-number").value.trim();

        if (!studentName || !indexNumber) {
            attendanceStatus.textContent = "Please fill in all fields.";
            return;
        }

        // Mark attendance and store in localStorage
        const attendanceData = {
            studentName,
            indexNumber,
            ...qrData,
            timestamp: new Date().toISOString(),
            location: { latitude, longitude },
            endTime: classEndTime // Store end time to check later
        };
        localStorage.setItem(attendanceKey, JSON.stringify(attendanceData));

        console.log("Attendance submitted:", attendanceData);
        attendanceStatus.textContent = "Attendance confirmed successfully!";
        attendanceForm.reset();
        attendanceContainer.style.display = "none";
        startScannerBtn.style.display = "block";
        scanStatus.textContent = "Tap to start scanning";
    } catch (err) {
        attendanceStatus.textContent = "Error: " + err.message;
    }
});

function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
        });
    });
}

function checkSchoolLocation(lat, lon) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = SCHOOL_LOCATION.latitude * Math.PI / 180;
    const φ2 = lat * Math.PI / 180;
    const Δφ = (lat - SCHOOL_LOCATION.latitude) * Math.PI / 180;
    const Δλ = (lon - SCHOOL_LOCATION.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= SCHOOL_LOCATION.radius;
}