const vaaModal = document.querySelector(".vaa-modal");
const closeVaaBtn = document.querySelector(".close-vaa-modal");
const viewActiveAttendanceBtn = document.querySelector(".view-active-attendance-menu");
const historyModal = document.querySelector(".history-modal");
const closeHistoryBtn = document.querySelector(".close-history-modal");
const historyBtn = document.querySelector(".history-menu");
const createAttendanceBtn = document.querySelector(".create-attendance-menu");
const createBtn = document.querySelector(".create-btn");
const caModal = document.querySelector(".ca-modal");
const qrCodePage = document.querySelector(".qr-code-page");
const closeCaBtn = document.querySelector(".close-ca-modal");

// Arrays to store active and historical attendance data
let activeAttendances = [];
let historyAttendances = [];

function formatTimeLeft(seconds) {
    if (seconds <= 0) return "00:00:00";
    const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${secs}`;
}

function updateActiveAttendanceTable() {
    const tableBody = document.querySelector("#active-attendance-table");
    tableBody.innerHTML = `
        <tr>
            <th>Class</th>
            <th>Course</th>
            <th>Time Left</th>
            <th></th>
        </tr>
    `;

    const now = new Date();
    activeAttendances = activeAttendances.filter(attendance => {
        const endTime = new Date(`${attendance.date}T${attendance.endTime}`);
        const secondsLeft = Math.max(0, Math.floor((endTime - now) / 1000));
        if (secondsLeft <= 0) {
            historyAttendances.push({ ...attendance, completedAt: new Date().toISOString() });
            return false;
        }
        return true;
    });

    activeAttendances.forEach((attendance, index) => {
        const endTime = new Date(`${attendance.date}T${attendance.endTime}`);
        const secondsLeft = Math.max(0, Math.floor((endTime - now) / 1000));
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${attendance.className}</td>
            <td>${attendance.courseName}</td>
            <td>${formatTimeLeft(secondsLeft)}</td>
            <td><button class="cancel-btn" data-index="${index}">Cancel</button></td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll(".cancel-btn").forEach(button => {
        button.addEventListener("click", function () {
            const index = this.getAttribute("data-index");
            const cancelledAttendance = activeAttendances.splice(index, 1)[0];
            historyAttendances.push({ ...cancelledAttendance, completedAt: new Date().toISOString(), status: "Cancelled" });
            updateActiveAttendanceTable();
            updateHistoryTable();
        });
    });
}

function updateHistoryTable() {
    const tableBody = document.querySelector("#history-table");
    tableBody.innerHTML = `
        <tr>
            <th>Class</th>
            <th>Course</th>
            <th>Date</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Status</th>
        </tr>
    `;

    historyAttendances.forEach(attendance => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${attendance.className}</td>
            <td>${attendance.courseName}</td>
            <td>${attendance.date}</td>
            <td>${attendance.startTime}</td>
            <td>${attendance.endTime}</td>
            <td>${attendance.status || "Completed"}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Update active attendance table every second
setInterval(updateActiveAttendanceTable, 1000);

// ############# View Active Attendance ################

viewActiveAttendanceBtn.addEventListener("click", function (event) {
    event.preventDefault();
    vaaModal.classList.toggle("active");
});

closeVaaBtn.addEventListener("click", function () {
    vaaModal.classList.remove("active");
});

// ############# History ################

historyBtn.addEventListener("click", function (event) {
    event.preventDefault();
    historyModal.classList.toggle("active");
    updateHistoryTable();
});

closeHistoryBtn.addEventListener("click", function () {
    historyModal.classList.remove("active");
});

// ############## Create Attendance ################

createAttendanceBtn.addEventListener("click", function (event) {
    caModal.classList.add("ca-active");
});

createBtn.addEventListener("click", function (event) {
    event.preventDefault();

    // Get form values
    const className = document.getElementById("class-name").value.trim();
    const courseName = document.getElementById("course-name").value.trim();
    const date = document.getElementById("date").value;
    const startTime = document.getElementById("start-time").value;
    const endTime = document.getElementById("end-time").value;

    // Validation
    if (!className || !courseName || !date || !startTime || !endTime) {
        alert("Please fill in all fields.");
        return;
    }

    // Add to active attendances
    activeAttendances.push({
        className,
        courseName,
        date,
        startTime,
        endTime
    });

    // Generate QR content as a URL with query parameters
    const qrData = new URLSearchParams({
        class: className,
        course: courseName,
        date: date,
        start: startTime,
        end: endTime
    }).toString();
    const baseUrl = "https://fthg5hgr-5500.uks1.devtunnels.ms";
    const qrUrl = `${baseUrl}/student-portal.html?${qrData}`;

    // Clear previous QR code
    const qrContainer = document.getElementById("qrCodeContainer");
    qrContainer.innerHTML = "";

    // Generate QR Code
    new QRCode(qrContainer, {
        text: qrUrl,
        width: 250,
        height: 250,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // Show QR code section
    qrCodePage.classList.remove("qr-hide");
    qrCodePage.classList.add("qr-active");

    // Update active attendance table
    updateActiveAttendanceTable();

    // Enable share button
    const shareBtn = document.querySelector(".share-btn");
    shareBtn.style.display = "flex";
    shareBtn.addEventListener("click", async function () {
        try {
            await navigator.share({
                title: `Attendance for ${className} - ${courseName}`,
                text: `Join the attendance for ${className} (${courseName}) on ${date} from ${startTime} to ${endTime}.`,
                url: qrUrl
            });
        } catch (err) {
            console.error("Share failed:", err);
            alert("Sharing is not supported on this device or an error occurred.");
        }
    });

    // Enable save button
    const saveBtn = document.querySelector(".save-btn");
    saveBtn.style.display = "flex";
    saveBtn.addEventListener("click", function () {
        const qrCanvas = qrContainer.querySelector("canvas");
        if (qrCanvas) {
            const link = document.createElement("a");
            link.href = qrCanvas.toDataURL("image/png");
            link.download = `QR_Attendance_${className}_${courseName}_${date}.png`;
            link.click();
        } else {
            alert("No QR code available to save.");
        }
    });
});

closeCaBtn.addEventListener("click", function () {
    caModal.classList.remove("ca-active");
    qrCodePage.classList.remove("qr-active");
    qrCodePage.classList.add("qr-hide");
});

document.querySelectorAll(".time-input").forEach((input) => {
    const placeholderText = input.getAttribute("data-placeholder");

    input.addEventListener("focus", function () {
        input.setAttribute("placeholder", "");
    });

    input.addEventListener("blur", function () {
        if (!input.value) {
            input.setAttribute("placeholder", placeholderText);
        }
    });

    // Set initial placeholder
    input.setAttribute("placeholder", placeholderText);
});
