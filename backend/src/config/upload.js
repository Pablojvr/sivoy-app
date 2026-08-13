const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', '..', '..', 'public', 'uploads'));
    },
    filename: function (req, file, cb) {
        const hash = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${hash}${ext}`);
    }
});

const upload = multer({ storage: storage });

module.exports = upload;
