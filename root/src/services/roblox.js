async function robloxFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(process.env.ROBLOX_COOKIE && {
                Cookie: `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`
            })
        }
    });

    if (!res.ok) throw new Error(`Roblox API ${res.status}`);
    return res.json();
}

async function getUserByName(username) {
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        body: JSON.stringify({ usernames: [username] })
    });
    return data.data?.[0] || null;
}

async function getProfile(id) {
    return robloxFetch(`https://users.roblox.com/v1/users/${id}`);
}

async function getAvatar(id) {
    const d = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`
    );
    return d.data?.[0]?.imageUrl;
}

async function getPresence(id) {
    const d = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
        method: 'POST',
        body: JSON.stringify({ userIds: [id] })
    });
    return d.userPresences?.[0];
}

async function getGameName(id) {
    if (!id) return null;
    const d = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${id}`);
    return d.data?.[0]?.name;
}

async function getInventory(id) {
    return robloxFetch(`https://inventory.roblox.com/v1/users/${id}/assets/collectibles`);
}

module.exports = {
    getUserByName,
    getProfile,
    getAvatar,
    getPresence,
    getGameName,
    getInventory
};
