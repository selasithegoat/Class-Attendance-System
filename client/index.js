document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
        return;
    }

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
    const logoutBtn = document.querySelector("#logout-btn");
    const lecturerNameElement = document.querySelector("#lecturer-name");
    const welcomeMessageElement = document.querySelector("#welcome-message");
    const activeSessionsElement = document.querySelector("#active-sessions");
    const sessionsTodayElement = document.querySelector("#sessions-today");
    const studentsMarkedElement = document.querySelector("#students-marked");

    let activeTimers = new Map();

    // Function to check if token is expired
    function isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000;
            return exp < Date.now();
        } catch (e) {
            console.error('Invalid token format:', e);
            return true;
        }
    }

   // Fetch lecturer info
async function fetchLecturerInfo() {
    try {
        const response = await fetch('/api/auth/lecturer/me', {   // <-- FIXED
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Token expired or invalid, redirecting to login');
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const lecturer = await response.json();
        if (lecturer.name) {
            lecturerNameElement.textContent = lecturer.name;
            welcomeMessageElement.textContent = `Welcome back, ${lecturer.name}! Ready to manage your classes?`;
        }
    } catch (err) {
        console.error('Error fetching lecturer info:', err.message);
        lecturerNameElement.textContent = 'Lecturer';
    }
}

    // Update dashboard stats
    async function updateDashboardStats() {
        try {
            const response = await fetch('/api/attendance/active', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch active attendances');
            const activeAttendances = await response.json();
            activeSessionsElement.textContent = activeAttendances.length;

            const today = new Date().toISOString().split('T')[0];
            const historyResponse = await fetch('/api/attendance/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!historyResponse.ok) throw new Error('Failed to fetch history');
            const historyAttendances = await historyResponse.json();
            const todaySessions = historyAttendances.filter(att => att.date === today).length;
            sessionsTodayElement.textContent = todaySessions;

            const totalStudents = activeAttendances.reduce((sum, att) => sum + (att.students ? att.students.length : 0), 0);
            studentsMarkedElement.textContent = totalStudents;
        } catch (err) {
            console.error('Error updating dashboard stats:', err.message);
            activeSessionsElement.textContent = 'N/A';
            sessionsTodayElement.textContent = 'N/A';
            studentsMarkedElement.textContent = 'N/A';
        }
    }

    // Logout handler
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    });

    function formatTimeLeft(seconds) {
        if (seconds <= 0) return "00:00:00";
        const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
        const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
        const secs = (seconds % 60).toString().padStart(2, "0");
        return `${hours}:${minutes}:${secs}`;
    }

    function startTimer(row, endDateTime, attendanceId) {
        if (activeTimers.has(attendanceId)) {
            clearInterval(activeTimers.get(attendanceId));
        }
        const timer = setInterval(() => {
            const now = new Date();
            const secondsLeft = Math.max(0, Math.floor((endDateTime - now) / 1000));
            const timeLeftCell = row.querySelector('td:nth-child(3)');
            if (timeLeftCell) {
                timeLeftCell.textContent = formatTimeLeft(secondsLeft);
            }
            if (secondsLeft <= 0) {
                clearInterval(timer);
                activeTimers.delete(attendanceId);
                row.remove();
                updateHistoryTable();
                updateDashboardStats();
            }
        }, 1000);
        activeTimers.set(attendanceId, timer);
    }

    function stopAllTimers() {
        activeTimers.forEach((timer) => clearInterval(timer));
        activeTimers.clear();
    }

    async function updateActiveAttendanceTable() {
        const tableBody = document.querySelector("#active-attendance-table");
        if (!tableBody) return;

        try {
            const response = await fetch('/api/attendance/active', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 401) {
                    console.log('Token expired or invalid, redirecting to login');
                    localStorage.removeItem('token');
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const activeAttendances = await response.json();
            const now = new Date();

            if (!tableBody.querySelector('th')) {
                tableBody.innerHTML = `
                    <tr>
                        <th>Class</th>
                        <th>Course</th>
                        <th>Time Left</th>
                        <th></th>
                    </tr>
                `;
            }

            const existingRows = Array.from(tableBody.querySelectorAll('tr:not(:first-child)'));
            const existingIds = new Set(existingRows.map(row => row.dataset.id));
            const newIds = new Set();

            activeAttendances.forEach((attendance) => {
                const endDateTime = new Date(`${attendance.date}T${attendance.endTime}:00Z`);
                const secondsLeft = Math.max(0, Math.floor((endDateTime - now) / 1000));

                if (secondsLeft > 0) {
                    newIds.add(attendance._id);
                    const existingRow = existingRows.find(row => row.dataset.id === attendance._id);

                    if (existingRow) {
                        existingRow.querySelector('td:nth-child(3)').textContent = formatTimeLeft(secondsLeft);
                        startTimer(existingRow, endDateTime, attendance._id);
                    } else {
                        const row = document.createElement("tr");
                        row.dataset.id = attendance._id;
                        row.innerHTML = `
                            <td>${attendance.className}</td>
                            <td>${attendance.courseName}</td>
                            <td>${formatTimeLeft(secondsLeft)}</td>
                            <td><button class="cancel-btn" data-id="${attendance._id}">Cancel</button></td>
                        `;
                        tableBody.appendChild(row);
                        startTimer(row, endDateTime, attendance._id);
                    }
                }
            });

            existingRows.forEach(row => {
                if (!newIds.has(row.dataset.id)) {
                    row.remove();
                    if (activeTimers.has(row.dataset.id)) {
                        clearInterval(activeTimers.get(row.dataset.id));
                        activeTimers.delete(row.dataset.id);
                    }
                }
            });

            document.querySelectorAll(".cancel-btn").forEach(button => {
                button.removeEventListener('click', handleCancel);
                button.addEventListener("click", handleCancel);
            });

            if (activeAttendances.length > 0 || existingIds.size > 0) {
                console.log(`Fetched ${activeAttendances.length} active attendances at ${new Date().toISOString()}`);
            }

            updateDashboardStats();
        } catch (err) {
            console.error('Error fetching active attendances:', err.message);
        }
    }

    async function handleCancel(event) {
        const id = event.target.getAttribute("data-id");
        try {
            await fetch(`/api/attendance/cancel/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (activeTimers.has(id)) {
                clearInterval(activeTimers.get(id));
                activeTimers.delete(id);
            }
            updateActiveAttendanceTable();
            updateHistoryTable();
        } catch (err) {
            console.error('Error canceling attendance:', err.message);
        }
    }

    async function updateHistoryTable() {
        const tableBody = document.querySelector("#history-table");
        if (!tableBody) return;
    
        tableBody.innerHTML = `
            <tr>
                <th>Class</th>
                <th>Course</th>
                <th>Date</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Status</th>
                <th>Action</th>
            </tr>
        `;
    
        try {
            const response = await fetch('/api/attendance/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    
            const historyAttendances = await response.json();
    
            historyAttendances.forEach(attendance => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${attendance.className}</td>
                    <td>${attendance.courseName}</td>
                    <td>${attendance.date}</td>
                    <td>${attendance.startTime}</td>
                    <td>${attendance.endTime}</td>
                    <td>${attendance.status}</td>
                    <td>
                        ${attendance.status === 'Completed'
                            ? `<button class="download-btn" data-id="${attendance._id}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
     viewBox="0 0 24 24" aria-hidden="true">
  <path fill="currentColor" d="M11 3a1 1 0 0 1 2 0v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4A1 1 0 1 1 8.707 9.293L11 11.586V3z"/>
  <path fill="currentColor" d="M4 19a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z"/>
</svg>
</button>`
                            : ''}
                        <button class="delete-btn" data-id="${attendance._id}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                        viewBox="0 0 24 24" aria-hidden="true">
                     <path fill="currentColor" d="M9 3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h4a1 1 0 1 1 0 2h-1.1l-1.03 13.02A3 3 0 0 1 14.88 22H9.12a3 3 0 0 1-2.99-2.98L5.1 6H4a1 1 0 1 1 0-2h4V3Zm2 1h2V3h-2v1Z"/>
                     <path fill="currentColor" d="M10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z"/>
                   </svg>
                   </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
    
            // ✅ Re-bind DELETE buttons
            document.querySelectorAll(".delete-btn").forEach(btn => {
                btn.addEventListener("click", async function () {
                    const attendanceId = this.getAttribute("data-id");
                    if (!confirm("Are you sure you want to delete this attendance record?")) return;
    
                    try {
                        const res = await fetch(`/api/attendance/${attendanceId}`, {
                            method: "DELETE",
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
    
                        if (!res.ok) throw new Error("Failed to delete");
    
                        this.closest("tr").remove();
                        console.log(`🗑 Deleted attendance ${attendanceId}`);
                    } catch (err) {
                        console.error("Delete error:", err.message);
                        alert("Failed to delete attendance. Please try again.");
                    }
                });
            });
    
            // ✅ Re-bind DOWNLOAD buttons
            document.querySelectorAll(".download-btn").forEach(btn => {
                btn.addEventListener("click", async function () {
                    const attendanceId = this.getAttribute("data-id");
    
                    try {
                        const res = await fetch(`/api/attendance/download/${attendanceId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
    
                        if (!res.ok) throw new Error("Failed to download");
    
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `Attendance_${attendanceId}.xlsx`;
                        a.click();
                        window.URL.revokeObjectURL(url);
    
                        console.log(`⬇ Downloaded attendance ${attendanceId}`);
                    } catch (err) {
                        console.error("Download error:", err.message);
                    }
                });
            });
    
        } catch (err) {
            console.error('Error fetching history:', err.message);
        }
    }
    
// Clear history table 
document.getElementById("clear-history-btn")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear all attendance history?")) return;
  
    try {
      const res = await fetch(`/api/attendance/clear-history`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
      alert(" All attendance history cleared.");
      updateHistoryTable(); // reload table after clearing
    } catch (err) {
      console.error("Clear history error:", err.message);
      alert("Failed to clear history. Please try again.");
    }
  });
  
  document.getElementById("history-search-input")?.addEventListener("input", function () {
    const filter = this.value.toLowerCase();
    document.querySelectorAll("#history-table tr").forEach((row, i) => {
      if (i === 0) return; // skip header row
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(filter) ? "" : "none";
    });
  });
  

    
    
    

    // Initialize page
    await fetchLecturerInfo();
    updateActiveAttendanceTable();
    setInterval(updateActiveAttendanceTable, 10000);

    // Close modals on outside click with event delegation
    document.addEventListener('click', (event) => {
        if (vaaModal.classList.contains('active') && !vaaModal.contains(event.target) && event.target !== viewActiveAttendanceBtn) {
            vaaModal.classList.remove('active');
            stopAllTimers();
        }
        if (historyModal.classList.contains('active') && !historyModal.contains(event.target) && event.target !== historyBtn) {
            historyModal.classList.remove('active');
        }
        if (caModal.classList.contains('ca-active') && !caModal.contains(event.target) && event.target !== createAttendanceBtn) {
            caModal.classList.remove('ca-active');
            qrCodePage.classList.remove('qr-active');
            qrCodePage.classList.add('qr-hide');
        }
    });

    // Prevent modal close when clicking inside
    [vaaModal, historyModal, caModal].forEach(modal => {
        modal.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });

    closeVaaBtn.addEventListener("click", function () {
        vaaModal.classList.remove("active");
        stopAllTimers();
    });

    viewActiveAttendanceBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation(); // Prevent immediate close
        vaaModal.classList.toggle("active");
        if (vaaModal.classList.contains("active")) {
            updateActiveAttendanceTable();
        } else {
            stopAllTimers();
        }
    });

    historyBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation(); // Prevent immediate close
        historyModal.classList.toggle("active");
        updateHistoryTable();
    });

    closeHistoryBtn.addEventListener("click", function () {
        historyModal.classList.remove("active");
    });

    createAttendanceBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation(); // Prevent immediate close
        caModal.classList.toggle("ca-active");
    });

    createBtn.addEventListener("click", async function (event) {
        event.preventDefault();

        const className = document.getElementById("class-name").value.trim();
        const courseName = document.getElementById("course-name").value.trim();
        const date = document.getElementById("date").value;
        const startTime = document.getElementById("start-time").value;
        const endTime = document.getElementById("end-time").value;

        if (!className || !courseName || !date || !startTime || !endTime) {
            alert("Please fill in all fields.");
            return;
        }

        try {
            const response = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ className, courseName, date, startTime, endTime })
            });
            if (!response.ok) {
                if (response.status === 401) {
                    console.log('Token expired or invalid, redirecting to login');
                    localStorage.removeItem('token');
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const attendance = await response.json();

            const qrData = new URLSearchParams({
                class: className,
                course: courseName,
                date: date,
                start: startTime,
                end: endTime
            }).toString();
            const baseUrl = 'https://337006a6cf25.ngrok-free.app/';
            const qrUrl = `${baseUrl}/student-portal.html?${qrData}`;

            const qrContainer = document.getElementById("qrCodeContainer");
            if (!qrContainer) {
                console.error("qrCodeContainer not found");
                return;
            }
            qrContainer.innerHTML = "";

            new QRCode(qrContainer, {
                text: qrUrl,
                width: 250,
                height: 250,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H,
                margin: 10
            });

            qrCodePage.classList.remove("qr-hide");
            qrCodePage.classList.add("qr-active");

            updateActiveAttendanceTable();

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

            const saveBtn = document.querySelector(".save-btn");
            saveBtn.style.display = "flex";
            saveBtn.addEventListener("click", function () {
                const qrCanvas = qrContainer.querySelector("canvas");
                if (qrCanvas) {
                    const paddedCanvas = document.createElement("canvas");
                    const padding = 20;
                    const ctx = paddedCanvas.getContext("2d");
                    paddedCanvas.width = qrCanvas.width + padding * 2;
                    paddedCanvas.height = qrCanvas.height + padding * 2;

                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
                    ctx.drawImage(qrCanvas, padding, padding);

                    const link = document.createElement("a");
                    link.href = paddedCanvas.toDataURL("image/png");
                    link.download = `QR_Attendance_${className}_${courseName}_${date}.png`;
                    link.click();
                } else {
                    alert("No QR code available to save.");
                }
            });
        } catch (err) {
            console.error('Error creating attendance:', err.message);
            alert('Error creating attendance: ' + err.message);
        }
    });

    closeCaBtn.addEventListener("click", function () {
        caModal.classList.remove("ca-active");
        qrCodePage.classList.remove('qr-active');
        qrCodePage.classList.add('qr-hide');
    });

    document.querySelectorAll(".time-input").forEach((input) => {
        if (!input) return;
        const placeholderText = input.getAttribute("data-placeholder");

        input.addEventListener("focus", function () {
            input.setAttribute("placeholder", "");
        });

        input.addEventListener("blur", function () {
            if (!input.value) {
                input.setAttribute("placeholder", placeholderText);
            }
        });

        input.setAttribute("placeholder", placeholderText);
    });
});