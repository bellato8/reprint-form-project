// DIAGNOSTIC MODE
module.exports = async function (context, req) {
    context.log('--- DIAGNOSTIC RUN ---');
    try {
        const headers = req.headers;
        const contentType = headers['content-type'] || 'Content-Type Not Found';
        const rawBodyLength = req.rawBody ? req.rawBody.length : 0;

        const report = {
            message: "This is a diagnostic report from the backend.",
            receivedContentType: contentType,
            rawBodyLengthInBytes: rawBodyLength,
            first100CharsOfRawBody: req.rawBody ? req.rawBody.toString('utf-8').substring(0, 100) : "N/A"
        };

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report, null, 2)
        };

    } catch (error) {
        context.log.error(error);
        context.res = {
            status: 500,
            body: "An error occurred during diagnostics: " + error.message
        };
    }
};
