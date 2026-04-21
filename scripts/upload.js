const admin = require("firebase-admin");
const fs = require("fs");
const csv = require("csv-parser");

// 🔥 Your actual service account file
const serviceAccount = require("../expense-tracker-b2f4c-firebase-adminsdk-fbsvc-5141fc5445.json");

// 🔥 Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const results = [];

console.log("🚀 Uploading data to Firestore...");

// ⚠️ Make sure CSV file name EXACTLY matches this
fs.createReadStream("MasterData.csv")
  .pipe(csv())
  .on("data", (data) => {
    results.push(data);
  })
  .on("end", async () => {
    for (const row of results) {
      try {
        await db.collection("expenses").add({
          amount: Number(row.amount),
          category: row.category,
          paidBy: row.paidBy,
          date: row.date,
          description: row.description || "",
          rishabhShare: Number(row.rishabhShare),
          tejalShare: Number(row.tejalShare),
        });

        console.log(`✅ Added: ${row.category} - ₹${row.amount}`);
      } catch (err) {
        console.error("❌ Error adding row:", err);
      }
    }

    console.log("🎉 Upload complete!");
    process.exit();
  });