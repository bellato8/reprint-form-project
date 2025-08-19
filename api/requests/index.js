// File: api/requests/index.js
// Diagnostic version: No image processing to test deployment.

const { BlobServiceClient } = require("@azure/storage-blob");
const formidable = require("formidable");
const fs = require("fs");
const { Connection, Request, TYPES } = require("tedious");

const parseForm = (req) => {
    return new Promise((resolve, reject) => {
        const form = new formidable.IncomingForm();
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            const unwrappedFields = {};
            for (const key in fields) {
                if (Array.isArray(fields[key])) unwrappedFields[key] = fields[key][0];
                else unwrappedFields[key] = fields[key];
            }
            resolve({ fields: unwrappedFields, files });
        });
    });
};

const executeSql = (connection, request) => {
    return new Promise((resolve, reject) => {
        request.on('requestCompleted', () => resolve());
        request.on('error', err => reject(err));
        connection.execSql(request);
    });
};

module.exports = async function (context, req) {
    context.log('Processing request without image watermarking.');
    let connection;
    try {
        const { fields, files } = await parseForm(req);
        const imageFile = files.file ? (Array.isArray(files.file) ? files.file[0] : files.file) : null;
        if (!imageFile) throw new Error("Image file not found in form data.");

        // We will use the original, un-watermarked image buffer directly
        const originalImageBuffer = fs.readFileSync(imageFile.filepath);

        // Generate Request ID
        const now = new Date();
        const year = now.getFullYear() + 543;
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4);
        const requestId = `R${year}${month}${day}-${timestamp}`;

        // --- WATERMARKING SECTION IS REMOVED FOR THIS TEST ---

        // Upload original image to Azure Blob Storage
        const storageConnectionString = process.env.ReprintStorageConnectionString;
        if (!storageConnectionString) throw new Error("Azure Storage Connection String is not configured.");
        const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient("re-print-ids");
        const blobName = `${now.getFullYear()}/${month}/${day}/${requestId}.jpg`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Uploading the original buffer
        await blockBlobClient.upload(originalImageBuffer, originalImageBuffer.length, {
            blobHTTPHeaders: { blobContentType: imageFile.mimetype }
        });

        // Save to SQL Database
        const sqlConnectionString = process.env.SqlConnectionString;
        if (!sqlConnectionString) throw new Error("SQL Database Connection String is not configured.");
        connection = new Connection({ server: sqlConnectionString.match(/Server=tcp:([^,]+)/)[1], authentication: { type: 'default', options: { userName: sqlConnectionString.match(/User ID=([^;]+)/)[1], password: sqlConnectionString.match(/Password=([^;]+)/)[1] }}, options: { database: sqlConnectionString.match(/Initial Catalog=([^;]+)/)[1], encrypt: true }});
        await new Promise((resolve, reject) => connection.on('connect', err => { if (err) reject(err); else resolve(); }));
        const sql = `INSERT INTO Requests (RequestId, Timestamp, FullName, Age, Phone, Province, District, Subdistrict, ApplicantRole, VehicleType, Brand, Model, Color, LicensePlate, Gate, ReasonType, ReasonOther, ConsentAgreed, IdImageFileId) VALUES (@RequestId, @Timestamp, @FullName, @Age, @Phone, @Province, @District, @Subdistrict, @ApplicantRole, @VehicleType, @Brand, @Model, @Color, @LicensePlate, @Gate, @ReasonType, @ReasonOther, @ConsentAgreed, @IdImageFileId)`;
        const request = new Request(sql, err => { if (err) reject(err); });
        request.addParameter('RequestId', TYPES.NVarChar, requestId);
        request.addParameter('Timestamp', TYPES.DateTimeOffset, now);
        request.addParameter('FullName', TYPES.NVarChar, fields.FullName);
        request.addParameter('Age', TYPES.Int, fields.Age ? parseInt(fields.Age, 10) : null);
        request.addParameter('Phone', TYPES.VarChar, fields.Phone);
        request.addParameter('Province', TYPES.NVarChar, fields.Province);
        request.addParameter('District', TYPES.NVarChar, fields.District);
        request.addParameter('Subdistrict', TYPES.NVarChar, fields.Subdistrict);
        request.addParameter('ApplicantRole', TYPES.NVarChar, fields.ApplicantRole);
        request.addParameter('VehicleType', TYPES.NVarChar, fields.VehicleType);
        request.addParameter('Brand', TYPES.NVarChar, fields.Brand);
        request.addParameter('Model', TYPES.NVarChar, fields.Model);
        request.addParameter('Color', TYPES.NVarChar, fields.Color);
        request.addParameter('LicensePlate', TYPES.NVarChar, fields.LicensePlate);
        request.addParameter('Gate', TYPES.NVarChar, fields.Gate);
        request.addParameter('ReasonType', TYPES.NVarChar, fields.ReasonType);
        request.addParameter('ReasonOther', TYPES.NVarChar, fields.ReasonOther);
        request.addParameter('ConsentAgreed', TYPES.Bit, fields.ConsentAgreed === 'on');
        request.addParameter('IdImageFileId', TYPES.NVarChar, blobName);
        await executeSql(connection, request);

        // Respond with success
        context.res = {
            status: 200,
            body: `(TEST) Submission successful! Your Request ID is: ${requestId}. Original image saved.`
        };
    } catch (error) {
        context.log.error("Error in function:", error);
        context.res = { status: 500, body: "An error occurred: " + error.message };
    } finally {
        if (connection && connection.connected) {
            connection.close();
        }
    }
};