import { Redis } from '@upstash/redis';
import crypto from 'crypto';
 
const kv = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
 
// ============================================================
// HELPERS
// ============================================================
 
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
}
 
function generateKey() {
    const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `BF-${seg()}-${seg()}-${seg()}`;
}
 
// ============================================================
// MAIN HANDLER
// ============================================================
 
export default async function handler(req, res) {
    cors(res);
 
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
 
    const url = new URL(req.url, `https://${req.headers.host}`);
    const pathname = url.pathname;
 
    // ── ADMIN: создать лицензию ──────────────────────────────
    // POST /api/admin/create-license
    // Header: X-Admin-Secret: <твой секрет>
    // Body: { "bot_token": "...", "chat_id": "...", "label": "Имя клиента" }
    if (pathname === '/api/admin/create-license') {
        if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
 
        const { bot_token, chat_id, label } = req.body;
        if (!bot_token || !chat_id) {
            return res.status(400).json({ error: 'bot_token and chat_id are required' });
        }
 
        const license_key = generateKey();
        const record = {
            bot_token,
            chat_id: String(chat_id),
            label: label || 'Unknown',
            created_at: new Date().toISOString(),
            active: true,
        };
 
        await kv.set(`license:${license_key}`, record);
 
        return res.status(200).json({
            ok: true,
            license_key,
            label: record.label,
            created_at: record.created_at,
        });
    }
 
    // ── ADMIN: отозвать лицензию ─────────────────────────────
    // POST /api/admin/revoke-license
    // Body: { "license_key": "BF-XXXX-XXXX-XXXX" }
    if (pathname === '/api/admin/revoke-license') {
        if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
 
        const { license_key } = req.body;
        if (!license_key) {
            return res.status(400).json({ error: 'license_key is required' });
        }
 
        const record = await kv.get(`license:${license_key}`);
        if (!record) {
            return res.status(404).json({ error: 'License not found' });
        }
 
        await kv.set(`license:${license_key}`, { ...record, active: false });
        return res.status(200).json({ ok: true, message: `License ${license_key} revoked` });
    }
 
    // ── ADMIN: список всех лицензий ──────────────────────────
    // GET /api/admin/list-licenses
    if (pathname === '/api/admin/list-licenses') {
        if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ error: 'Forbidden' });
        }
 
        const keys = await kv.keys('license:*');
        const records = await Promise.all(
            keys.map(async (k) => {
                const data = await kv.get(k);
                return { key: k.replace('license:', ''), ...data };
            })
        );
 
        return res.status(200).json({ ok: true, licenses: records });
    }
 
    // ── CLIENT: отправить сообщение ──────────────────────────
    // POST /api/send
    // Body: { "license_key": "BF-XXXX-XXXX-XXXX", "text": "...", "parse_mode": "HTML" }
    if (pathname === '/api/send') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
 
        const { license_key, text, parse_mode } = req.body;
 
        if (!license_key || !text) {
            return res.status(400).json({ error: 'license_key and text are required' });
        }
 
        // Проверка лицензии
        const record = await kv.get(`license:${license_key}`);
        if (!record) {
            return res.status(403).json({ ok: false, error: 'Invalid license key' });
        }
        if (!record.active) {
            return res.status(403).json({ ok: false, error: 'License revoked' });
        }
 
        const { bot_token, chat_id } = record;
 
        // Обновляем время последнего использования
        await kv.set(`license:${license_key}`, {
            ...record,
            last_used: new Date().toISOString(),
        });
 
        // Отправляем в Telegram
        try {
            const tgRes = await fetch(
                `https://api.telegram.org/bot${bot_token}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id,
                        text,
                        parse_mode: parse_mode || 'HTML',
                        disable_web_page_preview: true,
                    }),
                }
            );
 
            const data = await tgRes.json();
 
            if (!data.ok) {
                console.error('Telegram error:', data.description);
            }
 
            return res.status(tgRes.status).json(data);
        } catch (e) {
            console.error('Fetch to Telegram failed:', e);
            return res.status(500).json({ ok: false, error: e.message });
        }
    }
 
    // ── 404 ──────────────────────────────────────────────────
    return res.status(404).json({ error: 'Unknown endpoint' });
}
