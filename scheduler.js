const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

function clearUploadsFolder() {
    console.log("Scheduler Starts ************")
    const uploadPath = path.join(__dirname, 'uploads');

    fs.readdir(uploadPath, (err, files) => {
        if (err) return console.error('Error reading upload folder:', err);

        for (const file of files) {
            const filePath = path.join(uploadPath, file);
            fs.unlink(filePath, err => {
                if (err) console.error(`Failed to delete ${file}:`, err);
            });
        }
        console.log('✅ Uploads folder cleared successfully at end of day');
    });
}

// Schedule job: every day at midnight
cron.schedule('0 0 * * *', () => {
    console.log('🕛 Running scheduled cleanup...');
    clearUploadsFolder();
});

module.exports = clearUploadsFolder;
