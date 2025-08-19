document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const lecturerId = document.getElementById('lecturer-id').value.trim();
    const password = document.getElementById('password').value.trim();
    const status = document.getElementById('login-status');

    if (!lecturerId || !password) {
        status.textContent = 'Please fill in all fields';
        return;
    }

    status.textContent = 'Logging in...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lecturerId, password })
        });
        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem('token', data.token);
            console.log('Login successful, token stored:', data.token);

            // ✅ Verify lecturer
            const verifyRes = await fetch('/api/auth/lecturer/me', {
                headers: { 'Authorization': 'Bearer ' + data.token }
            });

            if (verifyRes.ok) {
                const lecturer = await verifyRes.json();
                console.log("✅ Verified Lecturer:", lecturer);

                status.textContent = 'Login successful! Redirecting...';
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 1000);
            } else {
                status.textContent = '❌ Failed to verify lecturer account.';
                localStorage.removeItem('token');
            }
        } else {
            status.textContent = data.message || 'Login failed';
            console.error('Login error:', data.message);
        }
    } catch (err) {
        status.textContent = 'Error: Unable to connect to server';
        console.error('Login error:', err);
    }
});
