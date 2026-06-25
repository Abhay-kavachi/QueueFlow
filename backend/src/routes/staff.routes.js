const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse');
const fs = require('fs');
const QueueModel = require('../models/Queue.model');
const AuthModel = require('../models/Auth.model');
const { query } = require('../utils/database');
const { authenticateStaff } = require('../middleware/auth.middleware');
const { authorizeTransition } = require('../middleware/rbac.middleware');
const AuditService = require('../services/Audit.service');
const bcrypt = require('bcryptjs');


const upload = multer({ dest: 'uploads/' });


const verifyTenantAccess = async (req, res, next) => {
  const { serviceId } = req.params;
  if (!serviceId) return next();
  try {
    const result = await query('SELECT organization_id FROM services WHERE id = $1', [serviceId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Service not found' });
    
    console.log("verifyTenantAccess:", {
      db_org_id: result.rows[0].organization_id,
      staff_org_id: req.staff.organizationId,
      match: String(result.rows[0].organization_id) === String(req.staff.organizationId)
    });

    if (req.staff.role !== 'admin' && req.staff.role !== 'master' && String(result.rows[0].organization_id) !== String(req.staff.organizationId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Multi-tenant DB boundary violation' });
    }

    
    if (req.staff.role === 'worker' && String(serviceId) !== String(req.staff.serviceId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only access your assigned service queue' });
    }

    next();
  } catch(e) { next(e); }
};

router.get('/dashboard/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const queueStatus = await QueueModel.getCurrentQueueStatus(serviceId);
    const services = await QueueModel.getAllServices();
    const service = services.find(s => s.id == serviceId);
    const config = await QueueModel.getServiceConfig(serviceId);
    res.json({
      success: true,
      data: {
        service,
        queueStatus,
        configuration: config
      }
    });
  } catch (error) {
    next(error);
  }
});
router.post('/create-account', authenticateStaff, async (req, res, next) => {
  try {
    if (req.staff.role !== 'admin' && req.staff.role !== 'ORG_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can create new staff accounts'
      });
    }
    
    // Mass Assignment Protection: explicitly destructure only allowed fields
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    // Ensure role assignment is strictly controlled
    const allowedRoles = ['worker', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN'];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or unauthorized role assignment'
      });
    }
    
    const result = await AuthModel.createAdminUser(
      username, 
      password, 
      role || 'worker', 
      req.staff.adminId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    await AuditService.logEvent({
      tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'WORKER_CREATED', entityType: 'Worker', entityId: result.admin.id, correlationId: req.correlationId, metadata: { role }
    });

    res.status(201).json({
      success: true,
      message: 'Staff account created successfully',
      data: result.admin
    });
  } catch (error) {
    next(error);
  }
});
router.get('/accounts', authenticateStaff, async (req, res, next) => {
  try {
    if (req.staff.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can view staff accounts'
      });
    }
    const admins = await AuthModel.getAllAdminUsers();
    res.json({
      success: true,
      data: admins
    });
  } catch (error) {
    next(error);
  }
});
router.put('/accounts/:adminId', authenticateStaff, async (req, res, next) => {
  try {
    if (req.staff.role !== 'admin' && req.staff.role !== 'ORG_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can update staff accounts'
      });
    }
    const { adminId } = req.params;
    
    // Mass Assignment Protection: explicitly destructure only allowed fields
    const { role, is_active } = req.body;
    const updates = {};
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;
    
    if (adminId === req.staff.adminId && updates.role) {
      return res.status(400).json({
        success: false,
        error: 'Cannot change your own role'
      });
    }
    
    // Validate role escalation
    const allowedRoles = ['worker', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN'];
    if (updates.role && !allowedRoles.includes(updates.role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or unauthorized role assignment'
      });
    }
    
    const result = await AuthModel.updateAdminUser(adminId, updates);
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    if (updates.role) {
      await AuditService.logEvent({
        tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'ROLE_CHANGED', entityType: 'Worker', entityId: adminId, correlationId: req.correlationId, metadata: { role: updates.role }
      });
    }
    
    res.json({
      success: true,
      message: 'Staff account updated successfully',
      data: result.admin
    });
  } catch (error) {
    next(error);
  }
});
router.delete('/accounts/:adminId', authenticateStaff, async (req, res, next) => {
  try {
    if (req.staff.role !== 'admin' && req.staff.role !== 'ORG_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can delete staff accounts'
      });
    }
    const { adminId } = req.params;
    if (adminId === req.staff.adminId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    const result = await AuthModel.deleteAdminUser(adminId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    await AuditService.logEvent({
      tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'WORKER_REMOVED', entityType: 'Worker', entityId: adminId, correlationId: req.correlationId, metadata: {}
    });
    
    res.json({
      success: true,
      message: 'Staff account deleted successfully',
      data: result.deleted
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mark-active/:serviceId', authenticateStaff, verifyTenantAccess, authorizeTransition('active'), async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const nextPerson = await QueueModel.markPatientActive(serviceId);
    if (!nextPerson) {
      return res.status(400).json({ error: 'No patient is currently called' });
    }
    await AuditService.logEvent({
      tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'STATE_TRANSITION', entityType: 'Queue', entityId: nextPerson.id, correlationId: req.correlationId, metadata: { state: 'active' }
    });
    const io = req.app.get('io');
    if (io) io.to(serviceId.toString()).emit('queue:update');
    res.json({ message: 'Patient marked as active in examination', nextPerson });
  } catch (error) {
    next(error);
  }
});

router.post('/complete/:serviceId', authenticateStaff, verifyTenantAccess, authorizeTransition('completed'), async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await QueueModel.completeServiceCurrent(serviceId);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No active service found'
      });
    }
    await AuditService.logEvent({
      tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'STATE_TRANSITION', entityType: 'Queue', entityId: result.id, correlationId: req.correlationId, metadata: { state: 'completed' }
    });
    res.json({
      success: true,
      message: 'Service completed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});
router.post('/call-next/:serviceId', authenticateStaff, verifyTenantAccess, authorizeTransition('next'), async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await QueueModel.callNextCurrent(serviceId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'No pending users in queue' });
    }
    await AuditService.logEvent({
      tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'STATE_TRANSITION', entityType: 'Queue', entityId: result.id, correlationId: req.correlationId, metadata: { state: 'next' }
    });
    res.json({ success: true, message: 'Next user called', data: result });
  } catch (error) { next(error); }
});
router.post('/no-show/:serviceId', authenticateStaff, verifyTenantAccess, authorizeTransition('grace'), async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const result = await QueueModel.setNoShowCurrent(serviceId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'No active user found to mark as no-show' });
    }
    await AuditService.logEvent({
      tenantId: req.tenantId, userId: req.staff.id, roleId: req.roleId, action: 'STATE_TRANSITION', entityType: 'Queue', entityId: result.id, correlationId: req.correlationId, metadata: { state: 'grace' }
    });
    res.json({ success: true, message: 'User moved to grace period', data: result });
  } catch (error) { next(error); }
});

router.post('/reinstate/:queueId', authenticateStaff, async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const queueEntry = await QueueModel.query('SELECT organization_id, service_id FROM live_queue WHERE id = $1', [queueId]);
    if (queueEntry.rows.length === 0) return res.status(404).json({ success: false, error: 'Queue entry not found' });
    if (req.staff.role !== 'admin' && req.staff.role !== 'master' && String(queueEntry.rows[0].organization_id) !== String(req.staff.organizationId)) return res.status(403).json({ success: false, error: 'Unauthorized: Multi-tenant DB boundary violation' });
    if (req.staff.role === 'worker' && String(queueEntry.rows[0].service_id) !== String(req.staff.serviceId)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const result = await QueueModel.reinstateFromGrace(queueId);
    res.json({ success: true, message: 'Reinstated user', data: result });
  } catch (error) { next(error); }
});

router.post('/send-to-back/:queueId', authenticateStaff, async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const queueEntry = await QueueModel.query('SELECT organization_id, service_id FROM live_queue WHERE id = $1', [queueId]);
    if (queueEntry.rows.length === 0) return res.status(404).json({ success: false, error: 'Queue entry not found' });
    if (req.staff.role !== 'admin' && req.staff.role !== 'master' && String(queueEntry.rows[0].organization_id) !== String(req.staff.organizationId)) return res.status(403).json({ success: false, error: 'Unauthorized: Multi-tenant DB boundary violation' });
    if (req.staff.role === 'worker' && String(queueEntry.rows[0].service_id) !== String(req.staff.serviceId)) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const result = await QueueModel.sendToBack(queueId);
    res.json({ success: true, message: 'Sent to back of queue', data: result });
  } catch (error) { next(error); }
});
router.post('/pause/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { isPaused } = req.body;
    if (typeof isPaused !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isPaused must be a boolean'
      });
    }
    const result = await QueueModel.setServicePaused(serviceId, isPaused);
    res.json({
      success: true,
      message: `Service ${isPaused ? 'paused' : 'resumed'} successfully`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});
router.post('/skip/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { count } = req.body;
    if (!count || count <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid count required'
      });
    }
    const skippedUsers = await QueueModel.batchSkipUsers(serviceId, count);
    res.json({
      success: true,
      message: `${skippedUsers.length} users skipped`,
      data: skippedUsers
    });
  } catch (error) {
    next(error);
  }
});
router.post('/complete-manual/:queueId', authenticateStaff, async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const { actualWaitDuration } = req.body;
    const queueEntry = await QueueModel.query(
      'SELECT created_at, organization_id, service_id FROM live_queue WHERE id = $1',
      [queueId]
    );
    if (queueEntry.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue entry not found'
      });
    }
    if (req.staff.role !== 'admin' && req.staff.role !== 'master' && String(queueEntry.rows[0].organization_id) !== String(req.staff.organizationId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Multi-tenant DB boundary violation' });
    }
    if (req.staff.role === 'worker' && String(queueEntry.rows[0].service_id) !== String(req.staff.serviceId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only modify your assigned service queue' });
    }
    const entry = queueEntry.rows[0];
    const calculatedWaitTime = actualWaitDuration || 
      Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 60000);
    const result = await QueueModel.completeService(queueId, calculatedWaitTime);
    res.json({
      success: true,
      message: 'Manual completion successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
});
router.post('/grace/:queueId', authenticateStaff, async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const queueEntry = await QueueModel.query(
      'SELECT id, organization_id, service_id, state FROM live_queue WHERE id = $1',
      [queueId]
    );
    if (queueEntry.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
    }
    
    if (req.staff.role !== 'admin' && req.staff.role !== 'master' && String(queueEntry.rows[0].organization_id) !== String(req.staff.organizationId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Multi-tenant DB boundary violation' });
    }
    if (req.staff.role === 'worker' && String(queueEntry.rows[0].service_id) !== String(req.staff.serviceId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only modify your assigned service queue' });
    }
    const result = await QueueModel.startGracePeriod(queueId);
    res.json({ success: true, message: 'User moved to grace queue', data: result });
  } catch (error) { next(error); }
});

router.delete('/remove/:queueId', authenticateStaff, async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const queueEntry = await QueueModel.query(
      'SELECT id, organization_id, service_id, state FROM live_queue WHERE id = $1',
      [queueId]
    );
    if (queueEntry.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
    }
    
    if (req.staff.role !== 'admin' && req.staff.role !== 'master' && String(queueEntry.rows[0].organization_id) !== String(req.staff.organizationId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Multi-tenant DB boundary violation' });
    }
    if (req.staff.role === 'worker' && String(queueEntry.rows[0].service_id) !== String(req.staff.serviceId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only modify your assigned service queue' });
    }
    
    const result = await QueueModel.removeUserFromQueue(queueId);
    
    // Notify clients about the change
    const io = req.app.get('io');
    if (io && result.success && result.removed) {
      io.to(queueEntry.rows[0].service_id.toString()).emit('queue:update');
    }

    res.json({ success: true, message: 'User successfully removed from the queue', data: result });
  } catch (error) { next(error); }
});
router.get('/queue/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { state } = req.query; 
    let queryText = `
      SELECT lq.*, u.full_name as user_name, u.identifier as user_identifier, u.phone as user_phone
      FROM live_queue lq
      LEFT JOIN users u ON encode(digest(u.identifier, 'sha256'), 'hex') = lq.user_hash
      WHERE lq.service_id = $1
    `;
    let queryParams = [serviceId];
    if (state) {
      queryText += ' AND lq.state = $2';
      queryParams.push(state);
    }
    queryText += ' ORDER BY lq.position ASC';
    const result = await QueueModel.query(queryText, queryParams);
    
    const { maskIdentifier } = require('../utils/masking');
    const maskedData = result.rows.map(row => ({
      ...row,
      user_identifier: maskIdentifier(row.user_identifier),
      user_phone: maskIdentifier(row.user_phone)
    }));

    res.json({
      success: true,
      data: maskedData
    });
  } catch (error) {
    next(error);
  }
});
router.post('/add-entry/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { identifier } = req.body; 
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'Identifier required'
      });
    }
    const crypto = require('crypto');
    const userHash = crypto.createHash('sha256').update(identifier.toString()).digest('hex');
    const result = await QueueModel.addUserToQueue(userHash, serviceId, 'admin');
    res.status(201).json({
      success: true,
      message: 'Manual entry added successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});
router.get('/records/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    const result = await QueueModel.query(
      `SELECT * FROM historical_queue_logs 
       WHERE service_id = $1 
       ORDER BY completed_at DESC 
       LIMIT $2 OFFSET $3`,
      [serviceId, parseInt(limit), parseInt(offset)]
    );
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});


router.post('/bulk-register', authenticateStaff, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No CSV file provided' });
    
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true }))
      .on('error', (err) => {
         try { fs.unlinkSync(req.file.path); } catch(e){}
         return res.status(400).json({ success: false, error: 'CSV Parsing Error: Your file is malformed. Ensure the first row has exact header names.' });
      })
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        let inserted = 0;
        for (const rawRow of results) {
          
          const row = {};
          for (const key in rawRow) {
            const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
            row[cleanKey] = rawRow[key];
          }

          // Intelligently find variants of 'identifier' and 'name'
          const identifierKey = Object.keys(row).find(k => k.includes('aadhaar') || k.includes('identifier') || k === 'id');
          const nameKey = Object.keys(row).find(k => k.includes('name') || k.includes('full'));
          const emailKey = Object.keys(row).find(k => k.includes('email'));
          const phoneKey = Object.keys(row).find(k => k.includes('phone') || k.includes('mobile'));

          const identifierVal = identifierKey ? row[identifierKey] : null;
          const nameVal = nameKey ? row[nameKey] : null;

          if (identifierVal && nameVal) {
            await query(
              `INSERT INTO users (identifier, full_name, email, phone) 
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (identifier) DO UPDATE 
               SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone = EXCLUDED.phone`,
              [identifierVal.toString().trim(), nameVal.toString().trim(), emailKey ? row[emailKey] : '', phoneKey ? row[phoneKey] : '']
            );
            inserted++;
          }
        }
        fs.unlinkSync(req.file.path); // Cleanup temp file
        if (inserted === 0 && results.length > 0) {
           return res.json({ success: false, error: '0 users inserted. Found headers: ' + Object.keys(results[0]).join(', ') + ' | Expected a column containing "identifier" or "aadhaar", and "name".' });
        }
        res.json({ success: true, message: `Successfully registered ${inserted} users from CSV.` });
      });
  } catch (error) {
    next(error);
  }
});

// Bulk Inject into Queue
router.post('/bulk-queue-inject/:serviceId', authenticateStaff, verifyTenantAccess, upload.single('file'), async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, error: 'No CSV file provided' });
    
    const results = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(parse({ columns: true, skip_empty_lines: true, relax_column_count: true }))
        .on('error', (err) => {
           try { fs.unlinkSync(req.file.path); } catch(e){}
           reject(new Error('CSV Parsing Error: Your file is malformed. Ensure headers are correct.'));
        })
        .on('data', (data) => results.push(data))
        .on('end', resolve);
    });

    const crypto = require('crypto');
    let injected = 0;
    let failed = 0;
    let errors = [];

    const idAliases = ['aadhaar', 'aadhaar_number', 'aadhaar number', 'aadhar', 'aadhar number', 'student_id', 'student id', 'studentid', 'enrollment_id', 'enrollment id', 'mobile', 'mobile_number', 'mobile number', 'phone', 'phone number'];
    const nameAliases = ['name', 'full_name', 'full name', 'patient name', 'student name'];

    for (let i = 0; i < results.length; i++) {
      const rawRow = results[i];
      const rowNum = i + 1; 
      
      const row = {};
      for (const key in rawRow) {
        const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
        row[cleanKey] = rawRow[key];
      }

      const identifierKey = Object.keys(row).find(k => idAliases.includes(k));
      const nameKey = Object.keys(row).find(k => nameAliases.includes(k));

      const identifierVal = identifierKey ? row[identifierKey] : null;
      const nameVal = nameKey ? row[nameKey] : null;

      if (!identifierVal) {
        failed++;
        errors.push({ row: rowNum, reason: 'missing identifier' });
        continue;
      }

      const cleanIdentifier = identifierVal.toString().trim();
      const userHash = crypto.createHash('sha256').update(cleanIdentifier).digest('hex');
      
      try {
        
        if (nameVal) {
          await query(
            `INSERT INTO users (identifier, full_name) 
             VALUES ($1, $2)
             ON CONFLICT (identifier) DO UPDATE 
             SET full_name = EXCLUDED.full_name`,
            [cleanIdentifier, nameVal.toString().trim()]
          );
        }

        
        const existing = await query('SELECT id FROM live_queue WHERE user_hash = $1 AND state IN ($2, $3)', [userHash, 'pending', 'next']);
        if (existing.rows.length === 0) {
          await QueueModel.addUserToQueue(userHash, serviceId, 'worker');
          injected++;
        } else {
          failed++;
          errors.push({ row: rowNum, reason: 'duplicate identifier in queue' });
        }
      } catch (err) {
        failed++;
        errors.push({ row: rowNum, reason: err.message || 'database error' });
      }
    }
    
    try { fs.unlinkSync(req.file.path); } catch(e){}
    
    if (injected > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to(serviceId.toString()).emit('queue:update');
      }
    }
    
    res.json({
      success: true,
      message: `Successfully injected ${injected} users. Failed: ${failed}. Reasons: ${[...new Set(errors.map(e => e.reason))].join(', ')}`,
      injected,
      failed,
      errors
    });
  } catch (error) {
    next(error);
  }
});


router.post('/generate-worker-key', authenticateStaff, async (req, res, next) => {
  try {
    if (req.staff.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admins can generate worker keys' });
    }
    const crypto = require('crypto');
    const newKey = 'WORKER-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    
    const workerRes = await query('SELECT organization_id FROM workers WHERE id = $1', [req.staff.adminId]);
    if (workerRes.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    const orgId = workerRes.rows[0].organization_id;

    await query('UPDATE organizations SET worker_invite_key = $1 WHERE id = $2', [newKey, orgId]);
    res.json({ success: true, worker_invite_key: newKey });
  } catch (error) {
    next(error);
  }
});


router.patch('/update-credentials', authenticateStaff, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE workers SET username = $1, password_hash = $2 WHERE id = $3', [username, hash, req.staff.adminId]);
    res.json({ success: true, message: 'Credentials updated successfully' });
  } catch (error) {
    if (error.constraint === 'workers_username_key') {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    next(error);
  }
});



// Add Analytics Endpoint
router.get('/analytics/:serviceId', authenticateStaff, verifyTenantAccess, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    
    if (req.staff.role === 'worker') {
      return res.status(403).json({ success: false, error: 'Workers cannot view analytics' });
    }

    const { query } = require('../utils/database');

    const avgWaitRes = await query(`
      SELECT AVG(actual_wait_duration) as avg_wait 
      FROM historical_queue_logs 
      WHERE service_id = $1 AND final_status = 'completed'
    `, [serviceId]);

    const statsRes = await query(`
      SELECT final_status, COUNT(*) as count 
      FROM historical_queue_logs 
      WHERE service_id = $1 
      GROUP BY final_status
    `, [serviceId]);

    const peakRes = await query(`
      SELECT EXTRACT(HOUR FROM completed_at) as hour, COUNT(*) as count 
      FROM historical_queue_logs 
      WHERE service_id = $1 
      GROUP BY hour 
      ORDER BY count DESC 
      LIMIT 5
    `, [serviceId]);

    res.json({
      success: true,
      data: {
        averageWaitTime: avgWaitRes.rows[0]?.avg_wait || 0,
        statusCounts: statsRes.rows,
        peakHours: peakRes.rows
      }
    });

  } catch(e) {
    next(e);
  }
});

module.exports = router;