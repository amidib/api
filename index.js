export default async function handler(req, res) {
    // Разрешаем запросы со всех доменов (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Получаем путь (например, /bot123/sendMessage)
    const url = new URL(req.url, `https://${req.headers.host}`);
    const targetUrl = `https://api.telegram.org${url.pathname}${url.search}`;

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
