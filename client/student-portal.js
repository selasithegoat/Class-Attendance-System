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
const successPopup = document.getElementById("success-popup"); // New reference to the pop-up

const SCHOOL_LOCATION = {
    latitude: 5.6037,
    longitude: -0.1870,
    radius: 10000
};

let stream = null;

window.addEventListener("load", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const qrData = {
        class: urlParams.get("class"),
        course: urlParams.get("course"),
        date: urlParams.get("date"),
        start: urlParams.get("start"),
        end: urlParams.get("end")
    };

    if (qrData.class && qrData.course && qrData.date && qrData.start && qrData.end) {
        attendanceContainer.style.display = "block";
        startScannerBtn.style.display = "none";
        scanStatus.textContent = "Attendance details loaded.";
        attendanceForm.dataset.qrData = JSON.stringify(qrData);
        displayClassInfo(qrData);
        checkAttendanceStatus(qrData); // Check if attendance was already marked
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
                    checkAttendanceStatus(qrData); // Check if attendance was already marked
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

function checkAttendanceStatus(qrData) {
    const sessionKey = `attendance_${qrData.class}_${qrData.date}_${qrData.end}`;
    const attendanceMarked = localStorage.getItem(sessionKey);
    const classEndTime = new Date(`${qrData.date}T${qrData.end}`);
    const currentTime = new Date();

    if (attendanceMarked && currentTime <= classEndTime) {
        attendanceStatus.textContent = "Attendance already marked for this session.";
        attendanceForm.style.display = "none"; // Hide the form to prevent resubmission
        cancelBtn.style.display = "block"; // Ensure cancel button is visible
    } else if (currentTime > classEndTime) {
        // Clear the attendance mark if the class has ended
        localStorage.removeItem(sessionKey);
        attendanceForm.style.display = "block";
        attendanceStatus.textContent = "";
    } else {
        attendanceForm.style.display = "block";
        attendanceStatus.textContent = "";
    }
}

cancelBtn.addEventListener("click", () => {
    attendanceContainer.style.display = "none";
    startScannerBtn.style.display = "block";
    scanStatus.textContent = "Tap to start scanning";
    attendanceForm.reset();
    stopCamera();
    attendanceForm.style.display = "block"; // Reset form visibility
    attendanceStatus.textContent = "";
});

attendanceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    attendanceStatus.textContent = "Verifying location...";

    try {
        const qrData = JSON.parse(attendanceForm.dataset.qrData);
        const sessionKey = `attendance_${qrData.class}_${qrData.date}_${qrData.end}`;
        const attendanceMarked = localStorage.getItem(sessionKey);
        const classStartTime = new Date(`${qrData.date}T${qrData.start}`);
        const classEndTime = new Date(`${qrData.date}T${qrData.end}`);
        const currentTime = new Date();

        if (attendanceMarked && currentTime <= classEndTime) {
            attendanceStatus.textContent = "Attendance already marked for this session.";
            return;
        }

        if (currentTime > classEndTime) {
            attendanceStatus.textContent = "Cannot mark attendance: Class has already ended.";
            localStorage.removeItem(sessionKey); // Clear any outdated attendance mark
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

        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                className: qrData.class,
                date: qrData.date,
                endTime: qrData.end,
                studentName,
                indexNumber,
                latitude,
                longitude
            })
        });

        const result = await response.json();
        if (response.ok) {
            localStorage.setItem(sessionKey, 'marked'); // Mark attendance in localStorage
            attendanceStatus.textContent = "Attendance taken successfully!";
            // Show the green pop-up
            successPopup.style.display = "block";
            setTimeout(() => {
                successPopup.style.display = "none";
            }, 3000); // Hide after 3 seconds
            attendanceForm.reset();
            attendanceContainer.style.display = "none";
            startScannerBtn.style.display = "block";
            scanStatus.textContent = "Tap to start scanning";
            attendanceForm.style.display = "block"; // Reset form visibility
        } else {
            attendanceStatus.textContent = result.message;
        }
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
    const R = 6371e3;
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
