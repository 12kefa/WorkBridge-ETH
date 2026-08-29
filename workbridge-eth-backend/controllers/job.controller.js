const { query, withTransaction } = require('../config/database');
const { parseListParam } = require('../utils/query');

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'remote', 'daily'];
const ALLOWED_JOB_FIELDS = [
  'title', 'description', 'category', 'sub_category', 'job_type', 'location',
  'salary_min', 'salary_max', 'salary_currency', 'requirements', 'benefits',
  'skills_required', 'experience_level', 'education_required', 'expires_at',
  'status', 'is_featured'
];
const APPLICATION_STATUSES = ['applied', 'viewed', 'shortlisted', 'interview', 'hired', 'rejected'];

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

exports.createJob = async (req, res) => {
  try {
    const {
      title, description, category, sub_category, job_type,
      location, salary_min, salary_max, salary_currency,
      requirements, benefits, skills_required, experience_level, education_required,
      expires_at
    } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Title required (5+ chars)' });
    }
    if (!description || description.trim().length < 20) {
      return res.status(400).json({ success: false, message: 'Description required (20+ chars)' });
    }
    if (!category) return res.status(400).json({ success: false, message: 'Category required' });
    if (!JOB_TYPES.includes(job_type)) {
      return res.status(400).json({ success: false, message: 'Invalid job_type' });
    }

    const result = await query(
      `INSERT INTO jobs (employer_id, title, description, category, sub_category, job_type,
       location, salary_min, salary_max, salary_currency, requirements, benefits,
       skills_required, experience_level, education_required, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        req.user.id, title.trim(), description.trim(), category, sub_category || null, job_type,
        location || null, salary_min || null, salary_max || null, salary_currency || 'ETB',
        requirements || [], benefits || [], skills_required || [],
        experience_level || null, education_required || null, expires_at || null
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createJob error:', err);
    res.status(500).json({ success: false, message: 'Failed to create job' });
  }
};

exports.listJobs = async (req, res) => {
  try {
    const {
      category, job_type, location, search, skills,
      salary_min, salary_max, is_featured,
      page = 1, limit = 20
    } = req.query;

    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const where = [`j.status = 'active'`];
    const params = [];
    let i = 1;
    if (category) { where.push(`j.category = $${i++}`); params.push(category); }
    if (job_type) {
      if (!JOB_TYPES.includes(job_type)) {
        return res.status(400).json({ success: false, message: 'Invalid job_type' });
      }
      where.push(`j.job_type = $${i++}`); params.push(job_type);
    }
    if (location) { where.push(`j.location ILIKE $${i++}`); params.push(`%${location}%`); }
    if (search) { where.push(`(j.title ILIKE $${i++} OR j.description ILIKE $${i++})`); params.push(`%${search}%`, `%${search}%`); }
    const skillsList = parseListParam(skills);
    if (skillsList.length) { where.push(`j.skills_required && $${i++}::text[]`); params.push(skillsList); }
    if (salary_min) { where.push(`j.salary_max >= $${i++}`); params.push(parseFloat(salary_min)); }
    if (salary_max) { where.push(`j.salary_min <= $${i++}`); params.push(parseFloat(salary_max)); }
    if (is_featured === 'true') { where.push(`j.is_featured = true`); }

    const whereSql = where.join(' AND ');
    const countResult = await query(
      `SELECT COUNT(*)::int as total FROM jobs j WHERE ${whereSql}`,
      params
    );
    const total = countResult.rows[0].total;

    const result = await query(
      `SELECT j.*, u.full_name as employer_name, u.company_name, u.is_verified as employer_verified
       FROM jobs j JOIN users u ON j.employer_id = u.id
       WHERE ${whereSql}
       ORDER BY j.is_featured DESC, j.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('listJobs error:', err);
    res.status(500).json({ success: false, message: 'Failed to list jobs' });
  }
};

exports.getJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid job id' });

    // Increment views
    await query('UPDATE jobs SET views_count = views_count + 1 WHERE id = $1', [id]);

    const result = await query(
      `SELECT j.*, u.full_name as employer_name, u.company_name, u.company_logo, u.is_verified, u.company_description
       FROM jobs j JOIN users u ON j.employer_id = u.id WHERE j.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Check if user already applied (only if authenticated)
    let hasApplied = false;
    if (req.user && req.user.id) {
      const appResult = await query(
        'SELECT id FROM job_applications WHERE job_id = $1 AND applicant_id = $2',
        [id, req.user.id]
      );
      hasApplied = appResult.rows.length > 0;
    }

    res.json({ success: true, data: { ...result.rows[0], has_applied: hasApplied } });
  } catch (err) {
    console.error('getJob error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch job' });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid job id' });

    const check = await query('SELECT employer_id FROM jobs WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Job not found' });
    if (check.rows[0].employer_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const key of ALLOWED_JOB_FIELDS) {
      if (req.body[key] !== undefined) {
        setClauses.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    values.push(id);
    const sql = `UPDATE jobs SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
    const result = await query(sql, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateJob error:', err);
    res.status(500).json({ success: false, message: 'Failed to update job' });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid job id' });
    const check = await query('SELECT employer_id FROM jobs WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Job not found' });
    if (check.rows[0].employer_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await query('DELETE FROM jobs WHERE id = $1', [id]);
    res.json({ success: true, message: 'Job deleted' });
  } catch (err) {
    console.error('deleteJob error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete job' });
  }
};

exports.applyForJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid job id' });
    const { cover_letter, resume_url } = req.body || {};

    // Check if already applied
    const existing = await query(
      'SELECT id FROM job_applications WHERE job_id = $1 AND applicant_id = $2',
      [id, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'You already applied for this job' });
    }

    // Check job exists + is active
    const jobCheck = await query('SELECT employer_id, status, title FROM jobs WHERE id = $1', [id]);
    if (jobCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Job not found' });
    if (jobCheck.rows[0].status !== 'active') {
      return res.status(400).json({ success: false, message: 'Job is not accepting applications' });
    }
    if (jobCheck.rows[0].employer_id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot apply to your own job' });
    }

    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO job_applications (job_id, applicant_id, cover_letter, resume_url)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, req.user.id, cover_letter || null, resume_url || null]
      );
      await client.query(
        'UPDATE jobs SET applications_count = applications_count + 1 WHERE id = $1',
        [id]
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          jobCheck.rows[0].employer_id,
          'New Application',
          `${req.user.full_name || 'Someone'} applied for ${jobCheck.rows[0].title}`,
          'application',
          ins.rows[0].id,
          'job_application'
        ]
      );
      return ins.rows[0];
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('applyForJob error:', err);
    res.status(500).json({ success: false, message: 'Failed to apply' });
  }
};

exports.getApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limitNum;

    let sql, params;
    if (req.user.user_type === 'employer') {
      sql = `SELECT ja.id, ja.job_id, ja.applicant_id, ja.cover_letter, ja.resume_url,
                    ja.status, ja.interview_date, ja.interview_notes,
                    ja.created_at, ja.updated_at,
                    j.title as job_title, u.full_name as applicant_name, u.profile_photo
             FROM job_applications ja
             JOIN jobs j ON ja.job_id = j.id
             JOIN users u ON ja.applicant_id = u.id
             WHERE j.employer_id = $1`;
      params = [req.user.id];
    } else {
      sql = `SELECT ja.id, ja.job_id, ja.applicant_id, ja.cover_letter, ja.resume_url,
                    ja.status, ja.interview_date, ja.interview_notes,
                    ja.created_at, ja.updated_at,
                    j.title as job_title, j.employer_id, u.company_name
             FROM job_applications ja
             JOIN jobs j ON ja.job_id = j.id
             JOIN users u ON j.employer_id = u.id
             WHERE ja.applicant_id = $1`;
      params = [req.user.id];
    }

    if (status) { sql += ` AND ja.status = $${params.length + 1}`; params.push(status); }
    sql += ` ORDER BY ja.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getApplications error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    if (!isUuid(applicationId)) return res.status(400).json({ success: false, message: 'Invalid application id' });
    const { status, interview_date, interview_notes } = req.body || {};

    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const check = await query(
      `SELECT ja.applicant_id, j.employer_id, j.title
       FROM job_applications ja JOIN jobs j ON ja.job_id = j.id WHERE ja.id = $1`,
      [applicationId]
    );
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Application not found' });
    if (check.rows[0].employer_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE job_applications
         SET status = $1, interview_date = $2, interview_notes = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, interview_date || null, interview_notes || null, applicationId]
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          check.rows[0].applicant_id, 'Application Update',
          `Your application status changed to: ${status}`,
          'application_update', applicationId, 'job_application'
        ]
      );
    });
    res.json({ success: true, message: 'Status updated' });
  } catch (err) {
    console.error('updateApplicationStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

// Compatibility aliases for the camelCase route file
exports.getJobs = exports.listJobs;
exports.getJobById = exports.getJob;
exports.applyToJob = (req, res, next) => {
  // Old route sent { job_id } in the body. The new path-based route uses :id.
  if (req.body && req.body.job_id && !req.params.id) req.params.id = req.body.job_id;
  return exports.applyForJob(req, res, next);
};
exports.getMyApplications = exports.getApplications;
