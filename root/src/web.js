const express = require('express');
const app = express();

app.get('/', (_, res) => res.send('OK'));

app.listen(3000);
