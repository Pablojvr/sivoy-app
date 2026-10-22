'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const DEFAULT_UPLOAD_DIRECTORY = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
const ALLOWED_IMAGE_TYPES = Object.freeze({
    'image/jpeg': new Set(['.jpg', '.jpeg']),
    'image/jpg': new Set(['.jpg', '.jpeg']),
    'image/png': new Set(['.png']),
    'image/webp': new Set(['.webp'])
});

function boundedEnvInteger(value, fallback, minimum, maximum) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
}

function createUpload(options = {}) {
    const env = options.env || process.env;
    const multerFactory = options.multerFactory || multer;
    const destination = options.destination || DEFAULT_UPLOAD_DIRECTORY;
    const storage = multerFactory.diskStorage({
        destination,
        filename(req, file, callback) {
            const hash = crypto.randomBytes(8).toString('hex');
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `${Date.now()}-${hash}${extension}`);
        }
    });

    const upload = multerFactory({
        storage,
        limits: {
            fileSize: boundedEnvInteger(env.UPLOAD_MAX_FILE_SIZE_BYTES, 2097152, 65536, 10485760),
            files: 1,
            fields: 10,
            fieldSize: 65536,
            parts: 12,
            fieldNameSize: 100,
            headerPairs: 50
        },
        fileFilter(req, file, callback) {
            const extension = path.extname(file.originalname).toLowerCase();
            const allowedExtensions = ALLOWED_IMAGE_TYPES[file.mimetype];
            if (!allowedExtensions || !allowedExtensions.has(extension)) {
                const error = new Error('Unsupported media type');
                error.code = 'UNSUPPORTED_MEDIA_TYPE';
                callback(error, false);
                return;
            }
            callback(null, true);
        }
    });
    if (typeof upload?.single !== 'function') return upload;

    const originalSingle = upload.single.bind(upload);
    upload.single = (fieldName) => {
        const parseMultipart = originalSingle(fieldName);
        return (req, res, next) => parseMultipart(req, res, (error) => {
            if (error) {
                if (isMultipartParseError(error)) error.code = 'INVALID_MULTIPART';
                next(error);
                return;
            }
            registerFailedUploadCleanup(req, res);
            next();
        });
    };
    return upload;
}

function isMultipartParseError(error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return message === 'Unexpected end of form'
        || message === 'Malformed part header'
        || message.startsWith('Multipart:');
}

function registerFailedUploadCleanup(req, res) {
    if (!req.file?.path || typeof res?.once !== 'function') return;
    let cleaned = false;
    const removeFile = () => {
        if (cleaned) return;
        cleaned = true;
        fs.unlink(req.file.path, () => {});
    };
    res.once('finish', () => {
        if (res.statusCode >= 400) removeFile();
    });
    res.once('close', () => {
        if (!res.writableEnded || res.statusCode >= 400) removeFile();
    });
}

const upload = createUpload();

module.exports = upload;
module.exports.createUpload = createUpload;
