const express = require('express');
const router = express.Router();
const job = require('../controllers/job.controller');
const { protect, employerOnly, optionalAuth } = require('../middleware/auth');

router.get('/', job.listJobs);
router.get('/my-applications', protect, job.getMyApplications);
router.get('/applications', protect, job.getApplications);
router.post('/', protect, employerOnly, job.createJob);
router.get('/:id', optionalAuth, job.getJob);
router.put('/:id', protect, employerOnly, job.updateJob);
router.delete('/:id', protect, employerOnly, job.deleteJob);
router.post('/:id/apply', protect, job.applyForJob);
router.put('/applications/:applicationId', protect, employerOnly, job.updateApplicationStatus);

module.exports = router;
