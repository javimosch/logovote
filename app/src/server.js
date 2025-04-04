const path = require('path');
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;

const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const basicAuth = require('express-basic-auth');

const app = express();
const port = 3000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const NAMESPACES_DIR = path.join(DATA_DIR, 'namespaces');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// --- Friendly URL Map ---
let friendlyUrlToNamespaceIdMap = {};

// Function to normalize friendly names (slugify)
function normalizeFriendlyName(name) {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Function to load the map from existing data on startup
async function loadFriendlyUrlMap() {
    console.log('Loading friendly URL map...');
    const newMap = {};
    try {
        const files = await fs.readdir(NAMESPACES_DIR);
        const namespaceFiles = files.filter(file => file.endsWith('.json'));
        for (const file of namespaceFiles) {
            const namespaceId = file.replace('.json', '');
            try {
                const data = await readNamespaceData(namespaceId);
                if (data && data.friendlyUrlName) {
                    const normalizedName = normalizeFriendlyName(data.friendlyUrlName);
                    if (normalizedName) {
                        if (newMap[normalizedName]) {
                            console.warn(`WARN: Duplicate friendly URL name "${normalizedName}" detected during map load. Namespace ${namespaceId} conflicts with ${newMap[normalizedName]}. Last one wins.`);
                        }
                        newMap[normalizedName] = namespaceId;
                    }
                }
            } catch (readError) {
                console.error(`Error reading namespace ${namespaceId} during map load:`, readError);
            }
        }
        friendlyUrlToNamespaceIdMap = newMap;
        console.log(`Friendly URL map loaded with ${Object.keys(friendlyUrlToNamespaceIdMap).length} entries.`);
    } catch (error) {
        console.error('FATAL: Failed to load friendly URL map on startup:', error);
        friendlyUrlToNamespaceIdMap = {};
    }
}

// Function to update the map when a friendly name changes
function updateFriendlyUrlMap(namespaceId, oldFriendlyName, newFriendlyName) {
    const normalizedOld = normalizeFriendlyName(oldFriendlyName);
    const normalizedNew = normalizeFriendlyName(newFriendlyName);

    if (normalizedOld && friendlyUrlToNamespaceIdMap[normalizedOld] === namespaceId) {
        delete friendlyUrlToNamespaceIdMap[normalizedOld];
        console.log(`Map: Removed old friendly name "${normalizedOld}" for namespace ${namespaceId}`);
    }
    if (normalizedNew) {
        if (friendlyUrlToNamespaceIdMap[normalizedNew] && friendlyUrlToNamespaceIdMap[normalizedNew] !== namespaceId) {
            console.error(`Map Update Conflict: Attempted to map "${normalizedNew}" to ${namespaceId}, but it's already mapped to ${friendlyUrlToNamespaceIdMap[normalizedNew]}.`);
        } else {
            friendlyUrlToNamespaceIdMap[normalizedNew] = namespaceId;
            console.log(`Map: Added new friendly name "${normalizedNew}" for namespace ${namespaceId}`);
        }
    }
}

// --- Superadmin Auth ---
const superadminUser = process.env.SUPERADMIN_USER;
const superadminPassword = process.env.SUPERADMIN_PASSWORD;

if (!superadminUser || !superadminPassword) {
    console.warn("WARN: SUPERADMIN_USER or SUPERADMIN_PASSWORD not set in .env file. Superadmin routes will be disabled.");
}

const superadminAuthMiddleware = superadminUser && superadminPassword ? basicAuth({
    users: { [superadminUser]: superadminPassword },
    challenge: true,
    realm: 'SuperAdminArea',
}) : (req, res, next) => {
    res.status(403).send('Superadmin access is disabled.');
};

// --- Data Helper Functions ---
// Get the path for a namespace's JSON file
const getNamespaceFilePath = (namespaceId) => path.join(NAMESPACES_DIR, `${namespaceId}.json`);

// Read namespace data
async function readNamespaceData(namespaceId) {
    const filePath = getNamespaceFilePath(namespaceId);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // Namespace file doesn't exist
        }
        console.error(`Error reading namespace ${namespaceId}:`, error);
        throw new Error('Could not read namespace data.');
    }
}

// Write namespace data
async function writeNamespaceData(namespaceId, data) {
    const filePath = getNamespaceFilePath(namespaceId);
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error(`Error writing namespace ${namespaceId}:`, error);
        throw new Error('Could not write namespace data.');
    }
}

// Validate admin key
async function validateAdminKey(namespaceId, adminKey) {
    if (!namespaceId || !adminKey) return false;
    const data = await readNamespaceData(namespaceId);
    return data && data.adminKey === adminKey;
}

// Delete namespace files (JSON and uploads)
async function deleteNamespaceFiles(namespaceId) {
    const namespaceJsonPath = getNamespaceFilePath(namespaceId);
    const namespaceUploadDir = path.join(UPLOADS_DIR, namespaceId);
    let success = true;

    console.log(`Attempting to delete files for namespace: ${namespaceId}`);

    // 1. Delete the namespace JSON file
    try {
        await fs.unlink(namespaceJsonPath);
        console.log(`Deleted namespace JSON: ${namespaceJsonPath}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Namespace JSON not found (already deleted?): ${namespaceJsonPath}`);
        } else {
            console.error(`Error deleting namespace JSON ${namespaceJsonPath}:`, error);
            success = false;
        }
    }

    // 2. Delete the namespace upload directory
    try {
        await fs.access(namespaceUploadDir);
        await fs.rm(namespaceUploadDir, { recursive: true, force: true });
        console.log(`Deleted namespace upload directory: ${namespaceUploadDir}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Namespace upload directory not found (already deleted or never existed?): ${namespaceUploadDir}`);
        } else {
            console.error(`Error deleting namespace upload directory ${namespaceUploadDir}:`, error);
            success = false;
        }
    }

    return success;
}

// Ensure data directories exist
async function ensureDataDirs() {
    try {
        await fs.mkdir(NAMESPACES_DIR, { recursive: true });
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        console.log('Data directories ensured.');
    } catch (err) {
        console.error('Error creating data directories:', err);
        process.exit(1);
    }
}

// --- Middleware ---
app.use(express.json());
app.use('/data/uploads', express.static(UPLOADS_DIR));

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const namespaceId = req.query.namespace;
        if (!namespaceId) {
            return cb(new Error('Namespace ID is required for upload'), null);
        }
        const namespaceUploadDir = path.join(UPLOADS_DIR, namespaceId);
        try {
            await fs.mkdir(namespaceUploadDir, { recursive: true });
            cb(null, namespaceUploadDir);
        } catch (err) {
            cb(err, null);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, uniqueSuffix + extension);
    }
});

// Basic file filter (can be expanded)
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|svg/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Error: File upload only supports the following filetypes - ' + allowedTypes));
};

const MAX_FILES_UPLOAD = 10; // Define a max number of files per upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
    fileFilter: fileFilter
}).array('logoFiles', MAX_FILES_UPLOAD); // Expecting an array of files named 'logoFiles'

// --- API Endpoints ---

// POST /namespace - Create a new namespace
app.post('/namespace', async (req, res) => {
    const namespaceId = uuidv4();
    const adminKey = uuidv4();
    const newNamespaceData = {
        adminKey: adminKey,
        createdAt: new Date().toISOString(),
        logos: [],
        friendlyUrlName: null
    };

    try {
        await writeNamespaceData(namespaceId, newNamespaceData);
        console.log(`Namespace created: ${namespaceId}`);
        res.status(201).json({ namespaceId, adminKey });
    } catch (error) {
        console.error('Error creating namespace:', error);
        res.status(500).json({ message: 'Failed to create namespace.' });
    }
});

// --- NEW ENDPOINT: Set Friendly URL ---
app.post('/namespace/friendly-url', async (req, res) => {
    const { namespace, admin } = req.query;
    const { friendlyName } = req.body;

    if (!namespace || !admin) {
        return res.status(400).json({ message: 'Namespace ID and Admin Key are required.' });
    }
    if (typeof friendlyName !== 'string') {
        return res.status(400).json({ message: 'friendlyName (string) is required in the request body.' });
    }

    try {
        const isAdmin = await validateAdminKey(namespace, admin);
        if (!isAdmin) {
            return res.status(403).json({ message: 'Invalid Admin Key.' });
        }

        const normalizedName = normalizeFriendlyName(friendlyName);

        if (normalizedName) {
            const existingNamespaceId = friendlyUrlToNamespaceIdMap[normalizedName];
            if (existingNamespaceId && existingNamespaceId !== namespace) {
                return res.status(409).json({ message: `Friendly URL name "${normalizedName}" is already taken.` });
            }
        }

        const data = await readNamespaceData(namespace);
        if (!data) {
            return res.status(404).json({ message: 'Namespace not found.' });
        }
        const oldFriendlyName = data.friendlyUrlName || '';

        data.friendlyUrlName = normalizedName;

        await writeNamespaceData(namespace, data);

        updateFriendlyUrlMap(namespace, oldFriendlyName, normalizedName);

        console.log(`Friendly URL for namespace ${namespace} set to "${normalizedName}"`);
        res.status(200).json({ message: 'Friendly URL updated successfully.', friendlyUrlName: normalizedName });
    } catch (error) {
        console.error(`Error setting friendly URL for namespace ${namespace}:`, error);
        res.status(500).json({ message: 'Failed to set friendly URL.' });
    }
});

// GET /logos?namespace=[id] - Get logos for a namespace
app.get('/logos', async (req, res) => {
    const { namespace } = req.query;
    if (!namespace) {
        return res.status(400).json({ message: 'Namespace ID is required.' });
    }

    try {
        const data = await readNamespaceData(namespace);
        if (!data) {
            return res.status(404).json({ message: 'Namespace not found.' });
        }
        const logosResponse = data.logos.map(logo => ({
            id: logo.id,
            path: logo.path,
            votes: logo.votes.length,
            description: logo.description || "" // Return description, default to empty string
        }));
        res.json({
            logos: logosResponse,
            friendlyUrlName: data.friendlyUrlName || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve logos.' });
    }
});

// POST /upload?namespace=[id] - Upload one or more logos
app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        const { namespace } = req.query;

        if (!namespace) {
            if (req.files && req.files.length > 0) {
                 console.log('Namespace missing, cleaning up uploaded files...');
                 await Promise.all(req.files.map(file => fs.unlink(file.path).catch(console.error)));
            }
            return res.status(400).json({ message: 'Namespace ID is required.' });
        }

        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            console.error('Unknown upload error:', err);
            if (err.message.startsWith('Error: File upload only supports')) {
                 return res.status(400).json({ message: err.message });
            }
            return res.status(500).json({ message: `Upload error: ${err.message}` });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded or invalid file types.' });
        }

        let data;
        try {
            data = await readNamespaceData(namespace);
            if (!data) {
                console.log(`Namespace ${namespace} not found, cleaning up uploaded files...`);
                await Promise.all(req.files.map(file => fs.unlink(file.path).catch(console.error)));
                return res.status(404).json({ message: 'Namespace not found.' });
            }
        } catch (readError) {
             console.error(`Error reading namespace ${namespace} before processing uploads:`, readError);
             await Promise.all(req.files.map(file => fs.unlink(file.path).catch(console.error)));
             return res.status(500).json({ message: 'Failed to read namespace data.' });
        }

        const uploadedLogos = [];
        const errors = [];

        for (const file of req.files) {
            try {
                const logoId = uuidv4();
                const relativePath = path.join(namespace, file.filename);

                const newLogo = {
                    id: logoId,
                    path: relativePath,
                    votes: [],
                    description: "" // Initialize description as empty
                };

                data.logos.push(newLogo);

                uploadedLogos.push({
                    originalName: file.originalname,
                    logoId: logoId,
                    path: `/data/uploads/${relativePath}`
                });
                 console.log(`Logo ${logoId} (${file.originalname}) staged for namespace ${namespace}`);

            } catch (processingError) {
                console.error(`Error processing file ${file.originalname}:`, processingError);
                errors.push({ originalName: file.originalname, message: 'Failed to process file data.' });
                await fs.unlink(file.path).catch(console.error);
            }
        }

        try {
            if (uploadedLogos.length > 0) {
                 await writeNamespaceData(namespace, data);
                 console.log(`Successfully processed and saved ${uploadedLogos.length} logos for namespace ${namespace}.`);
            } else {
                 console.log(`No logos successfully processed for namespace ${namespace}.`);
            }

            if (errors.length === 0) {
                res.status(201).json({
                    message: `${uploadedLogos.length} file(s) uploaded successfully.`,
                    uploadedLogos: uploadedLogos
                });
            } else if (uploadedLogos.length > 0) {
                 res.status(207).json({
                     message: `Processed ${req.files.length} files. ${uploadedLogos.length} succeeded, ${errors.length} failed.`,
                     uploadedLogos: uploadedLogos,
                     errors: errors
                 });
            } else {
                 res.status(500).json({
                     message: `All ${errors.length} files failed during processing.`,
                     errors: errors
                 });
            }
        } catch (writeError) {
            console.error(`Error writing namespace data for ${namespace} after processing uploads:`, writeError);
            res.status(500).json({ message: 'Failed to save uploaded file data. Server error.' });
        }
    });
});

// POST /vote?namespace=[id] - Vote for a logo
app.post('/vote', async (req, res) => {
    const { namespace } = req.query;
    const { logoId, identifier } = req.body;

    if (!namespace || !logoId || !identifier) {
        return res.status(400).json({ message: 'Namespace ID, Logo ID, and identifier are required.' });
    }

    try {
        const data = await readNamespaceData(namespace);
        if (!data) {
            return res.status(404).json({ message: 'Namespace not found.' });
        }

        const logo = data.logos.find(l => l.id === logoId);
        if (!logo) {
            return res.status(404).json({ message: 'Logo not found.' });
        }

        if (logo.votes.includes(identifier)) {
            return res.status(409).json({ message: 'Identifier has already voted for this logo.' });
        }

        logo.votes.push(identifier);
        await writeNamespaceData(namespace, data);

        console.log(`Vote recorded for logo ${logoId} in namespace ${namespace}`);
        res.status(200).json({ message: 'Vote recorded successfully.', votes: logo.votes.length });
    } catch (error) {
        console.error('Error recording vote:', error);
        res.status(500).json({ message: 'Failed to record vote.' });
    }
});

// --- Admin Endpoints ---

// --- NEW ENDPOINT: Update Logo Description ---
app.post('/logo/description', async (req, res) => {
    const { namespace, logoId, admin } = req.query;
    const { description } = req.body;

    if (!namespace || !logoId || !admin) {
        return res.status(400).json({ message: 'Namespace ID, Logo ID, and Admin Key are required query parameters.' });
    }
    if (description === undefined || typeof description !== 'string') {
        return res.status(400).json({ message: 'Description (string) is required in the request body.' });
    }

    try {
        const isAdmin = await validateAdminKey(namespace, admin);
        if (!isAdmin) {
            return res.status(403).json({ message: 'Invalid Admin Key.' });
        }

        const data = await readNamespaceData(namespace);
        if (!data) {
            return res.status(404).json({ message: 'Namespace not found.' });
        }

        const logo = data.logos.find(l => l.id === logoId);
        if (!logo) {
            return res.status(404).json({ message: 'Logo not found.' });
        }

        logo.description = description.trim();

        await writeNamespaceData(namespace, data);

        console.log(`Description updated for logo ${logoId} in namespace ${namespace}`);
        res.status(200).json({ message: 'Description updated successfully.', description: logo.description });
    } catch (error) {
        console.error(`Error updating description for logo ${logoId} in namespace ${namespace}:`, error);
        if (error.message.includes('Could not read') || error.message.includes('Could not write')) {
             res.status(500).json({ message: 'Server error reading or writing namespace data.' });
        } else {
             res.status(500).json({ message: 'Failed to update description due to an unexpected server error.' });
        }
    }
});

// DELETE /logo?namespace=[id]&logoId=[logo-id]&admin=[key] - Delete a logo
app.delete('/logo', async (req, res) => {
    const { namespace, logoId, admin } = req.query;

    if (!namespace || !logoId || !admin) {
        return res.status(400).json({ message: 'Namespace ID, Logo ID, and Admin Key are required.' });
    }

    try {
        const isAdmin = await validateAdminKey(namespace, admin);
        if (!isAdmin) {
            return res.status(403).json({ message: 'Invalid Admin Key.' });
        }

        const data = await readNamespaceData(namespace);
        if (!data) {
            return res.status(404).json({ message: 'Namespace not found (should not happen after validation).' });
        }

        const logoIndex = data.logos.findIndex(l => l.id === logoId);
        if (logoIndex === -1) {
            return res.status(404).json({ message: 'Logo not found.' });
        }

        const logoToDelete = data.logos[logoIndex];
        const logoFilePath = path.join(UPLOADS_DIR, logoToDelete.path);

        data.logos.splice(logoIndex, 1);
        await writeNamespaceData(namespace, data);

        await fs.unlink(logoFilePath).catch(err => {
            console.error(`Failed to delete logo file ${logoFilePath}:`, err);
        });

        console.log(`Logo ${logoId} deleted from namespace ${namespace}`);
        res.status(200).json({ message: 'Logo deleted successfully.' });
    } catch (error) {
        console.error('Error deleting logo:', error);
        res.status(500).json({ message: 'Failed to delete logo.' });
    }
});

// POST /clear-votes?namespace=[id]&admin=[key] - Clear all votes in a namespace
app.post('/clear-votes', async (req, res) => {
    const { namespace, admin } = req.query;

    if (!namespace || !admin) {
        return res.status(400).json({ message: 'Namespace ID and Admin Key are required.' });
    }

    try {
        const isAdmin = await validateAdminKey(namespace, admin);
        if (!isAdmin) {
            return res.status(403).json({ message: 'Invalid Admin Key.' });
        }

        const data = await readNamespaceData(namespace);
        if (!data) {
            return res.status(404).json({ message: 'Namespace not found.' });
        }

        data.logos.forEach(logo => {
            logo.votes = [];
        });

        await writeNamespaceData(namespace, data);

        console.log(`Votes cleared for namespace ${namespace}`);
        res.status(200).json({ message: 'All votes cleared successfully.' });
    } catch (error) {
        console.error('Error clearing votes:', error);
        res.status(500).json({ message: 'Failed to clear votes.' });
    }
});

// DELETE /namespace?namespace=[id]&admin=[key] - Delete an entire namespace
app.delete('/namespace', async (req, res) => {
    const { namespace, admin } = req.query;

    if (!namespace || !admin) {
        return res.status(400).json({ message: 'Namespace ID and Admin Key are required.' });
    }

    try {
        const isAdmin = await validateAdminKey(namespace, admin);
        if (!isAdmin) {
            return res.status(403).json({ message: 'Invalid Admin Key.' });
        }

        const deleted = await deleteNamespaceFiles(namespace);

        if (deleted) {
            console.log(`Namespace ${namespace} deleted via API request.`);
            res.status(200).json({ message: 'Namespace deleted successfully.' });
        } else {
            res.status(500).json({ message: 'Failed to completely delete namespace. Check server logs.' });
        }
    } catch (error) {
        console.error('Error processing namespace deletion request:', error);
        res.status(500).json({ message: 'Failed to delete namespace.' });
    }
});

// --- Cron Job for Pruning Old, Empty Namespaces ---
cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running job to prune old, empty namespaces...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
        const files = await fs.readdir(NAMESPACES_DIR);
        const namespaceFiles = files.filter(file => file.endsWith('.json'));

        console.log(`[Cron] Found ${namespaceFiles.length} namespace files to check.`);

        for (const file of namespaceFiles) {
            const namespaceId = file.replace('.json', '');
            try {
                const data = await readNamespaceData(namespaceId);

                if (!data) {
                    console.warn(`[Cron] Namespace data for ${namespaceId} is null or unreadable, skipping.`);
                    continue;
                }

                const createdAt = data.createdAt ? new Date(data.createdAt) : null;
                if (!createdAt || createdAt >= thirtyDaysAgo) {
                    continue;
                }

                const totalVotes = data.logos.reduce((sum, logo) => sum + (logo.votes ? logo.votes.length : 0), 0);
                if (totalVotes > 0) {
                    continue;
                }

                console.log(`[Cron] Pruning namespace ${namespaceId}: Older than 30 days (${createdAt.toISOString()}) and has 0 votes.`);
                await deleteNamespaceFiles(namespaceId);
            } catch (readError) {
                console.error(`[Cron] Error processing namespace ${namespaceId}:`, readError);
            }
        }
        console.log('[Cron] Pruning job finished.');
    } catch (cronError) {
        console.error('[Cron] Error during the pruning job execution:', cronError);
    }
});

// --- Superadmin Routes ---
const superadminRouter = express.Router();

// Apply auth middleware to all superadmin routes *except* the HTML page itself initially
// We apply it within the router for API calls, and separately for the HTML page GET request
// superadminRouter.use(superadminAuthMiddleware); // Moved auth to specific routes or main app level

// --- MODIFICATION: Serve superadmin.html ---
// GET /superadmin - Serve the HTML page (apply auth here)
app.get('/superadmin', superadminAuthMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'superadmin.html'));
});
// --- MODIFICATION END ---

// GET /superadmin/namespaces - List all namespaces (API)
superadminRouter.get('/namespaces', async (req, res) => {
    try {
        const files = await fs.readdir(NAMESPACES_DIR);
        const namespaceFiles = files.filter(file => file.endsWith('.json'));
        const namespaceDetails = [];

        for (const file of namespaceFiles) {
            const namespaceId = file.replace('.json', '');
            try {
                const data = await readNamespaceData(namespaceId);
                if (data) {
                    const totalVotes = data.logos.reduce((sum, logo) => sum + (logo.votes ? logo.votes.length : 0), 0);
                    namespaceDetails.push({
                        id: namespaceId,
                        createdAt: data.createdAt || 'N/A',
                        logoCount: data.logos.length,
                        totalVotes: totalVotes,
                        adminKey: data.adminKey,
                        friendlyUrlName: data.friendlyUrlName || null
                    });
                } else {
                    namespaceDetails.push({ id: namespaceId, error: 'Could not read data', adminKey: null, friendlyUrlName: null });
                }
            } catch (readError) {
                console.error(`Superadmin: Error reading namespace ${namespaceId}:`, readError);
                namespaceDetails.push({ id: namespaceId, error: 'Error reading data', adminKey: null, friendlyUrlName: null });
            }
        }
        res.json(namespaceDetails);
    } catch (error) {
        console.error('Superadmin: Error listing namespaces:', error);
        res.status(500).json({ message: 'Failed to list namespaces.' });
    }
});

// DELETE /superadmin/namespace/:namespaceId - Delete a specific namespace (API)
superadminRouter.delete('/namespace/:namespaceId', async (req, res) => {
    const { namespaceId } = req.params;
    console.log(`Superadmin: Received request to delete namespace ${namespaceId}`);
    try {
        const deleted = await deleteNamespaceFiles(namespaceId);
        if (deleted) {
            console.log(`Superadmin: Namespace ${namespaceId} deleted successfully.`);
            res.status(200).json({ message: `Namespace ${namespaceId} deleted successfully.` });
        } else {
            console.warn(`Superadmin: Namespace ${namespaceId} deletion reported issues (check logs).`);
            res.status(200).json({ message: `Namespace ${namespaceId} deletion process completed. Some files might not have existed.` });
        }
    } catch (error) {
        console.error(`Superadmin: Error deleting namespace ${namespaceId}:`, error);
        res.status(500).json({ message: `Failed to delete namespace ${namespaceId}.` });
    }
});

// DELETE /superadmin/namespaces/all - Delete ALL namespaces (API)
superadminRouter.delete('/namespaces/all', async (req, res) => {
    console.log('Superadmin: Received request to delete ALL namespaces.');
    let successCount = 0;
    let failCount = 0;
    let notFoundCount = 0;
    let namespacesToDelete = [];

    try {
        const files = await fs.readdir(NAMESPACES_DIR);
        namespacesToDelete = files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
        console.log(`Superadmin: Found ${namespacesToDelete.length} namespaces to attempt deletion.`);

        for (const namespaceId of namespacesToDelete) {
            try {
                const deleted = await deleteNamespaceFiles(namespaceId);
                if (deleted) {
                    successCount++;
                } else {
                    notFoundCount++;
                }
            } catch (deleteError) {
                console.error(`Superadmin: Error during bulk delete for namespace ${namespaceId}:`, deleteError);
                failCount++;
            }
        }

        const message = `Deleted ${successCount} namespaces. ${notFoundCount} namespaces reported issues (e.g., already deleted). ${failCount} failed with errors.`;
        console.log(`Superadmin: Bulk delete finished. ${message}`);
        res.status(200).json({ message });

    } catch (error) {
        console.error('Superadmin: Error listing namespaces for bulk delete:', error);
        res.status(500).json({ message: 'Failed to list namespaces for deletion.' });
    }
});

// DELETE /superadmin/namespaces/empty - Delete namespaces with zero votes (API)
superadminRouter.delete('/namespaces/empty', async (req, res) => {
    console.log('Superadmin: Received request to delete empty namespaces.');
    let deletedCount = 0;
    let checkedCount = 0;
    let errorCount = 0;

    try {
        const files = await fs.readdir(NAMESPACES_DIR);
        const namespaceFiles = files.filter(file => file.endsWith('.json'));
        checkedCount = namespaceFiles.length;
        console.log(`Superadmin: Found ${checkedCount} namespaces to check for emptiness.`);

        for (const file of namespaceFiles) {
            const namespaceId = file.replace('.json', '');
            try {
                const data = await readNamespaceData(namespaceId);
                if (!data) {
                    console.warn(`Superadmin: Skipping empty check for ${namespaceId}, could not read data.`);
                    continue;
                }

                const totalVotes = data.logos.reduce((sum, logo) => sum + (logo.votes ? logo.votes.length : 0), 0);

                if (totalVotes === 0) {
                    console.log(`Superadmin: Namespace ${namespaceId} has 0 votes. Deleting...`);
                    const deleted = await deleteNamespaceFiles(namespaceId);
                    if (deleted) {
                        deletedCount++;
                    } else {
                        console.warn(`Superadmin: Deletion of empty namespace ${namespaceId} reported issues (check logs).`);
                        errorCount++;
                    }
                }
            } catch (processError) {
                console.error(`Superadmin: Error processing namespace ${namespaceId} for empty deletion:`, processError);
                errorCount++;
            }
        }

        const message = `Checked ${checkedCount} namespaces. Deleted ${deletedCount} empty namespaces. Encountered ${errorCount} errors or issues during processing.`;
        console.log(`Superadmin: Empty deletion finished. ${message}`);
        res.status(200).json({ message });

    } catch (error) {
        console.error('Superadmin: Error listing namespaces for empty deletion:', error);
        res.status(500).json({ message: 'Failed to list namespaces for empty deletion.' });
    }
});

// Mount the superadmin API router under /superadmin path, applying auth
if (superadminUser && superadminPassword) {
    // Apply auth middleware specifically to the API router
    app.use('/superadmin', superadminAuthMiddleware, superadminRouter);
    console.log("Superadmin API routes enabled at /superadmin");
} else {
     // If disabled, still mount a handler to inform the user for API paths
     app.use('/superadmin/*', (req, res) => {
         res.status(403).send('Superadmin access is disabled.');
     });
}

// --- NEW ROUTE: Access via Friendly URL ---
app.get('/v/:friendlyUrlName', (req, res) => {
    const friendlyName = req.params.friendlyUrlName;
    const namespaceId = friendlyUrlToNamespaceIdMap[friendlyName];

    if (namespaceId) {
        res.redirect(`/?namespace=${namespaceId}`);
    } else {
        res.status(404).send('Friendly URL not found.');
    }
});

// --- Serve index.html at root ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Server Start ---
ensureDataDirs()
    .then(loadFriendlyUrlMap)
    .then(() => {
        app.listen(port, () => {
            console.log(`LogoVote backend listening at http://localhost:${port}`);
            console.log('[Cron] Namespace pruning job scheduled to run daily at midnight.');
        });
    }).catch(err => {
        console.error("Failed to initialize server:", err);
        process.exit(1);
    });