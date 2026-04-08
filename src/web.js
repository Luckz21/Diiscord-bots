const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('OK'));

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});
