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
const successPopup = document.getElementById("success-popup");

let stream = null;

window.addEventListener("load", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const qrData = {
        class: urlParams.get("class"),
        course: urlParams.get("course"),
        date: urlParams.get("date"),
        start: urlParams.get("start"),
        end: urlParams.get("end")
        // 🚫 removed lecturerLat/lng from QR
    };

    if (qrData.class && qrData.course && qrData.date && qrData.start && qrData.end) {
        attendanceContainer.style.display = "block";
        startScannerBtn.style.display = "none";
        scanStatus.textContent = "Attendance details loaded.";
        attendanceForm.dataset.qrData = JSON.stringify(qrData);
        displayClassInfo(qrData);
        // Proximity check now only on server
    }
});

// QR Scanning
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
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

        if (code) {
            try {
                const url = new URL(code.data);
                const qrData = {
                    class: url.searchParams.get("class"),
                    course: url.searchParams.get("course"),
                    date: url.searchParams.get("date"),
                    start: url.searchParams.get("start"),
                    end: url.searchParams.get("end")
                    // 🚫 removed lecturerLat/lng
                };
                if (qrData.class) {
                    scanStatus.textContent = "QR code scanned successfully!";
                    video.style.display = "none";
                    canvas.style.display = "none";
                    attendanceContainer.style.display = "block";
                    stopCamera();
                    attendanceForm.dataset.qrData = JSON.stringify(qrData);
                    displayClassInfo(qrData);
                }
            } catch {
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

attendanceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    attendanceStatus.textContent = "Verifying location...";

    try {
        const qrData = JSON.parse(attendanceForm.dataset.qrData);
        const position = await getCurrentPosition();
        const { latitude, longitude } = position.coords;

        console.log("📍 Student current coords:", latitude, longitude);

        const studentName = document.getElementById("student-name").value.trim();
        const indexNumber = document.getElementById("index-number").value.trim();
        if (!studentName || !indexNumber) {
            attendanceStatus.textContent = "Please fill in all fields.";
            return;
        }

        console.log("📤 Sending attendance mark request:", {
            className: qrData.class,
            date: qrData.date,
            endTime: qrData.end,
            studentName,
            indexNumber,
            latitude,
            longitude
        });

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

        console.log("📥 Server responded with status:", response.status);

        const result = await response.json();
        console.log("📥 Server response body:", result);

        if (response.ok) {
            attendanceStatus.textContent = "Attendance taken successfully!";
            successPopup.style.display = "block";
            setTimeout(() => { successPopup.style.display = "none"; }, 3000);
            attendanceForm.reset();
            attendanceContainer.style.display = "none";
            startScannerBtn.style.display = "block";
        } else {
            attendanceStatus.textContent = result.message;
        }
    } catch (err) {
        console.error("❌ Error during attendance submit:", err);
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
