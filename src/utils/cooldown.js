const map = new Map();

module.exports = function(user, cmd, t = 5) {
    const k = `${user}:${cmd}`;
    const now = Date.now();

    if (map.has(k)) {
        const e = map.get(k);
        if (now < e) return (e - now) / 1000;
    }

    map.set(k, now + t * 1000);
    return 0;
};
