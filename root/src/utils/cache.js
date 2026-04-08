const cache = new Map();

function get(key) {
    const d = cache.get(key);
    if (!d) return null;

    if (Date.now() > d.expire) {
        cache.delete(key);
        return null;
    }

    return d.value;
}

function set(key, value, ttl = 60) {
    cache.set(key, {
        value,
        expire: Date.now() + ttl * 1000
    });
}

module.exports = { get, set };
