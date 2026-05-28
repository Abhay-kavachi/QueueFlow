const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../utils/database');


const authenticateMaster = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Master authentication token required' });
    
    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, decoded) => {
        if (err || decoded.role !== 'master') return res.status(403).json({ error: 'Invalid or unauthorized master token' });
        req.master = decoded;
        next();
    });
};


router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (username === process.env.MASTER_USERNAME && password === process.env.MASTER_PASSWORD) {
        const token = jwt.sign(
            { role: 'master', timestamp: Date.now() },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '8h' }
        );
        return res.json({ success: true, token });
    }
    
    return res.status(401).json({ error: 'Invalid Master Credentials' });
});


router.get('/organizations', authenticateMaster, async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                o.id, 
                o.name, 
                o.type, 
                o.auth_mode,
                o.admin_invite_key,
                w.username as admin_username,
                (SELECT COUNT(*) FROM services s WHERE s.organization_id = o.id) as total_services,
                (SELECT COUNT(*) FROM workers w2 WHERE w2.organization_id = o.id) as total_workers,
                (SELECT COUNT(*) FROM live_queue q WHERE q.organization_id = o.id) as current_queue
            FROM organizations o
            LEFT JOIN workers w ON w.organization_id = o.id AND w.role = 'admin'
            ORDER BY o.name ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});


router.post('/organizations/provision', authenticateMaster, async (req, res) => {
    const { orgName, type, authMode } = req.body;
    
    if (!orgName || !type || !authMode) {
        return res.status(400).json({ error: 'Name, Type, and Auth Mode are required' });
    }

    try {
        const crypto = require('crypto');
        const adminKey = 'QF-' + crypto.randomBytes(8).toString('hex').toUpperCase();

        
        const orgRes = await query(
            "INSERT INTO organizations (name, type, auth_mode, admin_invite_key) VALUES ($1, $2, $3, $4) RETURNING id",
            [orgName, type, authMode, adminKey]
        );
        const orgId = orgRes.rows[0].id;
        
        
        await query(
            "INSERT INTO services (organization_id, name, description, capacity) VALUES ($1, $2, $3, $4)",
            [orgId, 'Main Service Counter', 'Default platform queue entry', 1]
        );

        res.json({ 
            success: true, 
            message: 'Domain Successfully Provisioned',
            data: { orgId, orgName, type, authMode, admin_invite_key: adminKey }
        });
    } catch (error) {
        console.error('Error provisioning domain:', error);
        res.status(500).json({ error: 'Failed to provision organization', details: error.message });
    }
});


router.patch('/organizations/:id', authenticateMaster, async (req, res) => {
    const { id } = req.params;
    const { name, type, authMode } = req.body;
    
    if (!name || !type || !authMode) {
        return res.status(400).json({ error: 'Name, type, and auth mode are required' });
    }

    try {
        await query(
            "UPDATE organizations SET name = $1, type = $2, auth_mode = $3 WHERE id = $4",
            [name, type, authMode, id]
        );
        res.json({ success: true, message: 'Organization updated successfully' });
    } catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({ error: 'Failed to update organization' });
    }
});


router.post('/organizations/:id/generate-key', authenticateMaster, async (req, res) => {
    const { id } = req.params;
    const crypto = require('crypto');
    const newKey = 'QF-' + crypto.randomBytes(8).toString('hex').toUpperCase();

    try {
        await query(
            "UPDATE organizations SET admin_invite_key = $1 WHERE id = $2",
            [newKey, id]
        );
        res.json({ success: true, admin_invite_key: newKey });
    } catch (error) {
        console.error('Error generating invite key:', error);
        res.status(500).json({ error: 'Failed to generate invite key' });
    }
});


router.delete('/organizations/:id', authenticateMaster, async (req, res) => {
    const { id } = req.params;
    try {
        await query("DELETE FROM organizations WHERE id = $1", [id]);
        res.json({ success: true, message: 'Organization deleted successfully' });
    } catch (error) {
        console.error('Error deleting organization:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

module.exports = router;
