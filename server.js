const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path'); // Adicionado para lidar com caminhos de arquivos

const app = express();

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// --- ADICIONE ISSO PARA O SITE APARECER ---
// Isso diz ao servidor para mostrar os arquivos que estão na pasta 'public'
app.use(express.static('public'));

// Rota para garantir que o index.html abra na página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ------------------------------------------

const PUSHINPAY_TOKEN = 'SEU_TOKEN_AQUI';
const PUSHINPAY_API_URL = 'https://api.pushinpay.com.br/api/pix/cash-in';

app.post('/api/pix', async (req, res ) => {
    try {
        const { payer_name, payer_document, amount } = req.body;
        const valueInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            value: valueInCents,
            webhook_url: '', 
        };

        const response = await axios.post(PUSHINPAY_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            pixCode: response.data.qr_code,
            qr_code_base64: response.data.qr_code_base64
        });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao gerar PIX.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando!`));
