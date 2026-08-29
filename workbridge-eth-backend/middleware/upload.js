const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

/**
 * Ready-to-use Express middleware for a single-image field upload. Wraps
 * multer's callback-style error handling so validation/size errors come
 * back as a normal 400 JSON response instead of falling through to the
 * generic 500 error handler.
 */
const uploadSingleImage = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (!err) return next();
    const isClientError = err instanceof multer.MulterError || /Only image files/.test(err.message || '');
    res.status(isClientError ? 400 : 500).json({ success: false, message: err.message || 'Upload failed' });
  });
};

module.exports = { upload, uploadSingleImage };
