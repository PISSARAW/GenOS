const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function run() {
    const dir = process.argv[2] || process.cwd();
    if (!fs.existsSync(path.join(dir, 'index.html'))) {
        process.exit(0);
    }

    const server = http.createServer((req, res) => {
        let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url);
        if (fs.existsSync(filePath)) {
            res.writeHead(200);
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(0, async () => {
        const port = server.address().port;
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        let errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        page.on('pageerror', err => {
            errors.push(err.message);
        });

        await page.goto('http://localhost:' + port + '/', { waitUntil: 'networkidle0' });
        
        await browser.close();
        server.close();

        if (errors.length > 0) {
            console.error('RUNTIME ERRORS DETECTED:');
            errors.forEach(e => console.error(e));
            process.exit(1);
        } else {
            console.log('No runtime errors.');
            process.exit(0);
        }
    });
}

run();