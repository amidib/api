export default async function handler(req, res) {
    const { pathname, search } = new URL(req.url, `https://${req.headers.host}`);
    // Убираем /api/proxy из пути, если нужно, или просто пересылаем всё
    const targetUrl = `https://api.telegram.org${pathname.replace('/api/proxy', '')}${search}`;

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: req.method === 'POST' ? JSON.stringify(req.body) : null,
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
