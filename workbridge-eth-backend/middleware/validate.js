const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

// Auth validations
const registerValidation = [
  body('full_name').trim().isLength({ min: 2, max: 255 }).withMessage('Full name is required (2-255 chars)'),
  body('username').trim().isLength({ min: 3, max: 100 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username must be 3-100 chars, alphanumeric'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('user_type').isIn(['jobseeker','employer','freelancer','model','dating','business']).withMessage('Invalid user type'),
  handleValidationErrors
];

const loginValidation = [
  body('email').notEmpty().withMessage('Email or username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

// Job validations
const jobValidation = [
  body('title').trim().isLength({ min: 5, max: 255 }).withMessage('Title is required (5-255 chars)'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('job_type').isIn(['full-time','part-time','contract','freelance','remote','daily']).withMessage('Invalid job type'),
  handleValidationErrors
];

// Service validations
const serviceValidation = [
  body('title').trim().isLength({ min: 5, max: 255 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  handleValidationErrors
];

// Dating validations
const datingProfileValidation = [
  body('looking_for').optional().isIn(['male','female','both']).withMessage('Invalid preference'),
  body('age_min').optional().isInt({ min: 18, max: 100 }).withMessage('Age must be 18-100'),
  body('age_max').optional().isInt({ min: 18, max: 100 }).withMessage('Age must be 18-100'),
  handleValidationErrors
];

// Message validation
const messageValidation = [
  body('receiver_id').isUUID().withMessage('Valid receiver ID is required'),
  body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('Message content is required (max 5000 chars)'),
  handleValidationErrors
];

// Review validation
const reviewValidation = [
  body('reviewee_id').isUUID().withMessage('Valid reviewee ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('context_type').isIn(['job','service','user']).withMessage('Invalid context type'),
  handleValidationErrors
];

module.exports = {
  registerValidation,
  loginValidation,
  jobValidation,
  serviceValidation,
  datingProfileValidation,
  messageValidation,
  reviewValidation,
  handleValidationErrors
};
