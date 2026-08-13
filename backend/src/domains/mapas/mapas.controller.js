const mapasService = require('./mapas.service');

async function resolveMapsLink(req, res) {
    try {
        const { url } = req.body;
        const result = await mapasService.resolveMapsLink(url);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('resolve-maps-link error:', e.message);
        if (e.message.startsWith('Missing')) {
            return res.status(400).json({ error: e.message });
        }
        return res.status(500).json({ success: false, error: e.message });
    }
}

module.exports = {
    resolveMapsLink
};
