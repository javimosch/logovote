const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');

const app = express();
const port = 3000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const NAMESPACES_DIR = path.join(DATA_DIR, 'namespaces');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure data directories exist
async function ensureDataDirs() {
    try {
        await fs.mkdir(NAMESPACES_DIR, { recursive: true });
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        console.log('Data directories ensured.');
    } catch (err) {
        console.error('Error creating data directories:', err);
        process.exit(1); // Exit if we can't create essential directories
    }
}

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
    let success = true; // Assume success initially

    console.log(`Attempting to delete files for namespace: ${namespaceId}`);

    // 1. Delete the namespace JSON file
    try {
        await fs.unlink(namespaceJsonPath);
        console.log(`Deleted namespace JSON: ${namespaceJsonPath}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Namespace JSON not found (already deleted?): ${namespaceJsonPath}`);
            // Don't mark as failure if file doesn't exist
        } else {
            console.error(`Error deleting namespace JSON ${namespaceJsonPath}:`, error);
            success = false; // Mark as failure on other errors
        }
    }

    // 2. Delete the namespace upload directory
    try {
        // Check if directory exists before attempting to remove
        await fs.access(namespaceUploadDir); // Throws error if doesn't exist
        await fs.rm(namespaceUploadDir, { recursive: true, force: true }); // Use force to handle potential issues
        console.log(`Deleted namespace upload directory: ${namespaceUploadDir}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Namespace upload directory not found (already deleted or never existed?): ${namespaceUploadDir}`);
            // Don't mark as failure if directory doesn't exist
        } else {
            console.error(`Error deleting namespace upload directory ${namespaceUploadDir}:`, error);
            success = false; // Mark as failure on other errors
        }
    }

    return success;
}

//serve index.html at /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Middleware ---
app.use(express.json()); // For parsing application/json
app.use(express.static(path.join(__dirname, '..', 'frontend'))); // Serve static frontend files
app.use('/data/uploads', express.static(UPLOADS_DIR)); // Serve uploaded files statically

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const namespaceId = req.query.namespace;
        if (!namespaceId) {
            return cb(new Error('Namespace ID is required for upload'), null);
        }
        const namespaceUploadDir = path.join(UPLOADS_DIR, namespaceId);
        try {
            await fs.mkdir(namespaceUploadDir, { recursive: true }); // Ensure namespace upload dir exists
            cb(null, namespaceUploadDir);
        } catch (err) {
            cb(err, null);
        }
    },
    filename: (req, file, cb) => {
        // Generate a unique filename (e.g., timestamp + original name)
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

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
}).single('logoFile'); // Expecting a single file named 'logoFile'

// --- API Endpoints ---

// POST /namespace - Create a new namespace
app.post('/namespace', async (req, res) => {
    const namespaceId = uuidv4();
    const adminKey = uuidv4();
    const newNamespaceData = {
        adminKey: adminKey,
        createdAt: new Date().toISOString(), // Add createdAt timestamp
        logos: []
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
        // Return logos with relative path and vote count
        const logosResponse = data.logos.map(logo => ({
            id: logo.id,
            path: logo.path, // Path relative to /data/uploads/
            votes: logo.votes.length // Only return the count
        }));
        res.json(logosResponse);
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve logos.' });
    }
});

// POST /upload?namespace=[id] - Upload a logo
app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        const { namespace } = req.query;

        if (!namespace) {
            // Clean up uploaded file if namespace is missing after upload attempt
            if (req.file) await fs.unlink(req.file.path).catch(console.error);
            return res.status(400).json({ message: 'Namespace ID is required.' });
        }

        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            console.error('Multer error:', err);
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            // An unknown error occurred when uploading.
            console.error('Unknown upload error:', err);
            return res.status(500).json({ message: `Upload error: ${err.message}` });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded or invalid file type.' });
        }

        // File uploaded successfully
        try {
            const data = await readNamespaceData(namespace);
            if (!data) {
                // Clean up uploaded file if namespace doesn't exist
                await fs.unlink(req.file.path).catch(console.error);
                return res.status(404).json({ message: 'Namespace not found.' });
            }

            const logoId = uuidv4();
            // Store path relative to the UPLOADS_DIR base, including the namespace
            const relativePath = path.join(namespace, req.file.filename);

            const newLogo = {
                id: logoId,
                path: relativePath, // e.g., "namespace-id/filename.jpg"
                votes: []
            };

            data.logos.push(newLogo);
            await writeNamespaceData(namespace, data);

            console.log(`Logo ${logoId} uploaded to namespace ${namespace}`);
            res.status(201).json({
                message: 'File uploaded successfully.',
                logoId: logoId,
                path: `/data/uploads/${relativePath}` // Full path for client use
            });
        } catch (error) {
            console.error('Error processing upload:', error);
            // Clean up uploaded file on error
            await fs.unlink(req.file.path).catch(console.error);
            res.status(500).json({ message: 'Failed to process upload.' });
        }
    });
});

// POST /vote?namespace=[id] - Vote for a logo
app.post('/vote', async (req, res) => {
    const { namespace } = req.query;
    const { logoId, identifier } = req.body; // Expecting Base64 identifier

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

        // Check if identifier already voted for this logo
        if (logo.votes.includes(identifier)) {
            return res.status(409).json({ message: 'Identifier has already voted for this logo.' });
        }

        // Add vote
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

        const data = await readNamespaceData(namespace); // Read again after validation
        if (!data) {
             return res.status(404).json({ message: 'Namespace not found (should not happen after validation).' }); // Should be caught by validation
        }

        const logoIndex = data.logos.findIndex(l => l.id === logoId);
        if (logoIndex === -1) {
            return res.status(404).json({ message: 'Logo not found.' });
        }

        const logoToDelete = data.logos[logoIndex];
        const logoFilePath = path.join(UPLOADS_DIR, logoToDelete.path);

        // Remove logo entry from data
        data.logos.splice(logoIndex, 1);

        // Write updated data first
        await writeNamespaceData(namespace, data);

        // Then delete the file
        await fs.unlink(logoFilePath).catch(err => {
            // Log error if file deletion fails, but proceed as data is updated
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

        // Clear votes for all logos
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

        // Use the refactored deletion logic
        const deleted = await deleteNamespaceFiles(namespace);

        if (deleted) {
             console.log(`Namespace ${namespace} deleted via API request.`);
             res.status(200).json({ message: 'Namespace deleted successfully.' });
        } else {
            // If deleteNamespaceFiles returned false, it means an error occurred during deletion
            // which was already logged. Send a generic server error.
             res.status(500).json({ message: 'Failed to completely delete namespace. Check server logs.' });
        }

    } catch (error) {
        // Catch errors from validateAdminKey or other unexpected issues
        console.error('Error processing namespace deletion request:', error);
        res.status(500).json({ message: 'Failed to delete namespace.' });
    }
});

// --- Cron Job for Pruning Old, Empty Namespaces ---
// Schedule to run once daily at midnight ('0 0 * * *')
// For testing, you might use '*/5 * * * *' (every 5 seconds) or '0 * * * *' (every hour)
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

                // Check 1: createdAt exists and is older than 30 days
                const createdAt = data.createdAt ? new Date(data.createdAt) : null;
                if (!createdAt || createdAt >= thirtyDaysAgo) {
                    // console.log(`[Cron] Skipping ${namespaceId}: Not old enough or no createdAt timestamp.`);
                    continue;
                }

                // Check 2: Total votes across all logos is 0
                const totalVotes = data.logos.reduce((sum, logo) => sum + (logo.votes ? logo.votes.length : 0), 0);
                if (totalVotes > 0) {
                    // console.log(`[Cron] Skipping ${namespaceId}: Has ${totalVotes} total votes.`);
                    continue;
                }

                // If both checks pass, prune the namespace
                console.log(`[Cron] Pruning namespace ${namespaceId}: Older than 30 days (${createdAt.toISOString()}) and has 0 votes.`);
                await deleteNamespaceFiles(namespaceId); // Use refactored deletion logic

            } catch (readError) {
                console.error(`[Cron] Error processing namespace ${namespaceId}:`, readError);
                // Continue to the next namespace file
            }
        }
        console.log('[Cron] Pruning job finished.');
    } catch (cronError) {
        console.error('[Cron] Error during the pruning job execution:', cronError);
    }
});

// --- Server Start ---
ensureDataDirs().then(() => {
    app.listen(port, () => {
        console.log(`LogoVote backend listening at http://localhost:${port}`);
        console.log('[Cron] Namespace pruning job scheduled to run daily at midnight.');
    });
}).catch(err => {
    console.error("Failed to initialize server:", err);
    process.exit(1);
});