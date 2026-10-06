function registerShutdownHandlers({
    server,
    closeDatabase,
    processRef = process,
    logger,
    exit = process.exit,
    timeoutMs = 10000
}) {
    if (!server || typeof server.close !== 'function') throw new TypeError('server.close is required');
    if (typeof closeDatabase !== 'function') throw new TypeError('closeDatabase is required');
    if (!processRef || typeof processRef.once !== 'function') throw new TypeError('processRef.once is required');
    if (!logger || typeof logger.info !== 'function' || typeof logger.error !== 'function') {
        throw new TypeError('logger is required');
    }
    if (typeof exit !== 'function') throw new TypeError('exit is required');

    const deadlineMs = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
    let closingPromise;

    function shutdown() {
        if (closingPromise) return closingPromise;

        let serverError;
        let timedOut = false;
        const serverClosed = new Promise(resolve => {
            try {
                server.close(error => {
                    serverError = error;
                    resolve();
                });
            } catch (error) {
                serverError = error;
                resolve();
            }
        });

        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                try {
                    server.closeAllConnections?.();
                } catch {
                    // A timeout remains a failed shutdown regardless of force-close outcome.
                }
                reject(new Error('Server shutdown timeout'));
            }, deadlineMs);
        });

        const work = serverClosed.then(async () => {
            if (timedOut) return;
            await closeDatabase();
            if (serverError) throw serverError;
        });

        closingPromise = Promise.race([work, timeout]).then(
            () => {
                try { logger.info('server_shutdown_success', 'none'); } catch { /* ignore logger failure */ }
                exit(0);
            },
            () => {
                try { logger.error('server_shutdown_failed', 'shutdown_error'); } catch { /* ignore logger failure */ }
                exit(1);
            }
        ).finally(() => clearTimeout(timer));
        return closingPromise;
    }

    processRef.once('SIGTERM', shutdown);
    processRef.once('SIGINT', shutdown);
    return shutdown;
}

module.exports = { registerShutdownHandlers };
