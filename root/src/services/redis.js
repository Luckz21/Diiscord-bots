const BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function req(path, opt = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...opt,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) throw new Error('Redis error');
    return res.json();
}

async function set(key, value) {
    await req(`/set/${key}`, {
        method: 'POST',
        body: JSON.stringify({
            value: JSON.stringify(value),
            ex: 86400
        })
    });
}

async function get(key) {
    const d = await req(`/get/${key}`);
    return d.result ? JSON.parse(d.result) : null;
}

async function del(key) {
    await req(`/del/${key}`, { method: 'POST' });
}

module.exports = { set, get, del };
