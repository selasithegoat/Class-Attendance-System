// test-bcrypt.js
const bcrypt = require('bcryptjs');

// paste one of the hashes that got saved in MongoDB:
const storedHash = "$2b$10$FyJCce1DLMdaAVCg9FqTe.qPGjmC8kUFm9.o1aFpbb2JO8G0SntNa";

// the plain password you typed at registration
const plainPassword = "12345";

(async () => {
  const match = await bcrypt.compare(plainPassword, storedHash);
  console.log("🔍 Compare result:", match);
})();
