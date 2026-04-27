const express = require("express");
const puppeteer = require("puppeteer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const CHECKOUT_URL = "https://pay.finaliza.shop/checkout/dados?pl=9d75397acf";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

function generateGmailFromCpf(cpf) {
  const firstNames = ["gabriel", "lucas", "mateus", "felipe", "rafael", "bruno", "thiago", "vinicius", "rodrigo", "andre"];
  const cleanCpf = (cpf || "").replace(/\D/g, "");
  const seed = cleanCpf ? parseInt(crypto.createHash("md5").update(cleanCpf).digest("hex").substring(0, 8), 16) : Math.floor(Math.random() * 1000000);
  const firstName = firstNames[seed % firstNames.length];
  const randomNum = Math.floor(Math.random() * 900 + 100);
  return `${firstName}${randomNum}@gmail.com`.toLowerCase();
}

app.post("/proxy/pix", async (req, res) => {
  console.log("--- Iniciando Geração PIX via Appmax Checkout ---");
  const { payer_name, payer_email, amount, payer_cpf } = req.body;

  if (!payer_name || !payer_cpf) {
    return res.status(400).json({ error: "Nome e CPF são obrigatórios." });
  }

  const finalEmail = (!payer_email || payer_email === "nao@informado.com") 
    ? generateGmailFromCpf(payer_cpf)
    : payer_email;

  let browser;
  try {
    // Inicializa o browser com configurações para rodar no servidor
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    console.log(`Navegando para: ${CHECKOUT_URL}`);
    await page.goto(CHECKOUT_URL, { waitUntil: "networkidle2", timeout: 60000 });

    // PASSO 1: Identificação
    console.log("Preenchendo Passo 1: Identificação...");
    await page.waitForSelector('input', { visible: true });
    const inputs = await page.$$('input');
    
    // Ordem baseada no layout da Appmax: Nome, WhatsApp, Email
    await inputs[0].type(payer_name, { delay: 50 });
    await inputs[1].type("11999999999", { delay: 50 });
    await inputs[2].type(finalEmail, { delay: 50 });

    await page.click('button#am-button');
    console.log("Avançando para Passo 2...");
    
    // PASSO 2: Método de Pagamento
    // Aguarda a transição de tela
    await page.waitForFunction(() => document.URL.includes('/pagamento'), { timeout: 10000 });
    await page.waitForSelector('button#am-button', { visible: true });
    
    // Clicar para avançar (PIX costuma ser a opção padrão selecionada)
    await page.click('button#am-button');
    console.log("Avançando para Passo 3...");

    // PASSO 3: CPF do PIX
    await page.waitForFunction(() => document.URL.includes('/pagamento-pix'), { timeout: 10000 });
    await page.waitForSelector('input[type="tel"]', { visible: true });
    
    const cleanCpf = payer_cpf.replace(/\D/g, "");
    await page.type('input[type="tel"]', cleanCpf, { delay: 50 });
    
    await page.click('button#am-button');
    console.log("Gerando Código PIX...");

    // PASSO 4: Extração do Código
    // Aguarda o elemento que contém o código PIX "Copia e Cola"
    // Na Appmax, geralmente é um input readonly ou um elemento com classe específica
    await page.waitForSelector('input[readonly], textarea[readonly], .am-copy-content', { timeout: 20000 });
    
    const pixCode = await page.evaluate(() => {
      // Tenta encontrar o código em diferentes elementos comuns
      const selectors = [
        'input[readonly]', 
        'textarea[readonly]', 
        '.am-copy-content', 
        '.pix-code-text'
      ];
      
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const val = el.value || el.innerText;
          if (val && val.startsWith('000201')) return val.trim();
        }
      }
      
      // Busca por texto bruto se os seletores falharem
      const allText = document.body.innerText;
      const match = allText.match(/000201[a-zA-Z0-9]+/);
      return match ? match[0] : null;
    });

    if (pixCode) {
      console.log("Sucesso: PIX Extraído.");
      res.status(200).json({ success: true, pixCode: pixCode });
    } else {
      console.error("Falha ao localizar código PIX na página final.");
      res.status(500).json({ error: "Código PIX não encontrado na página de confirmação." });
    }

  } catch (err) {
    console.error("Erro durante a automação:", err.message);
    res.status(500).json({ error: "Erro interno no processamento do checkout", message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/health", (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
