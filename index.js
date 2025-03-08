const express = require('express');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.enable("trust proxy");
app.set("json spaces", 2);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

// Serve static files from "web"
app.use('/', express.static(path.join(__dirname, 'web')));

// Load settings.json globally
const settingsPath = path.join(__dirname, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

// API response middleware
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (data) {
        if (data && typeof data === 'object') {
            const responseData = {
                status: data.status || 200,
                creator: settings.apiSettings?.creator || "Created Using Rynn UI",
                ...data
            };
            return originalJson.call(this, responseData);
        }
        return originalJson.call(this, data);
    };
    next();
});

// Load API modules
const apiFolder = path.join(__dirname, 'api');
const apiModules = [];
let totalRoutes = 0;

const loadModules = (dir) => {
    fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            return loadModules(filePath); // Recursively load subdirectories
        }
        if (path.extname(file) === '.js') {
            try {
                const module = require(filePath);
                if (!module.meta || !module.onStart || typeof module.onStart !== 'function') {
                    console.warn(chalk.bgRed(`⚠️ Skipped ${filePath} (Invalid module format)`));
                    return;
                }

                const basePath = module.meta.path.split('?')[0];
                const routePath = '/api' + basePath;
                const method = (module.meta.method || 'get').toLowerCase();

                app[method](routePath, (req, res) => {
                    console.log(chalk.bgGreen(`📌 ${method.toUpperCase()} ${routePath}`));
                    module.onStart({ req, res });
                });

                apiModules.push({
                    name: module.meta.name,
                    description: module.meta.description,
                    category: module.meta.category,
                    path: routePath + (module.meta.path.includes('?') ? '?' + module.meta.path.split('?')[1] : ''),
                    author: module.meta.author,
                    method: module.meta.method || 'get'
                });

                totalRoutes++;
            } catch (error) {
                console.error(chalk.bgRed(`❌ Error loading ${filePath}: ${error.message}`));
            }
        }
    });
};

loadModules(apiFolder);

console.log(chalk.bgGreen(`✅ Load Complete! ${totalRoutes} Routes Loaded`));

// API Info Endpoint
app.get('/api/info', (req, res) => {
    const categories = {};
    apiModules.forEach(module => {
        if (!categories[module.category]) {
            categories[module.category] = { name: module.category, items: [] };
        }
        categories[module.category].items.push({
            name: module.name,
            desc: module.description,
            path: module.path,
            author: module.author,
            method: module.method
        });
    });
    res.json({ categories: Object.values(categories) });
});

// Serve settings.json at root
app.get('/settings.json', (req, res) => {
    res.sendFile(settingsPath);
});

// Serve Web Pages
const webPages = ["portal.html", "test-post.html", "docs.html"];
webPages.forEach(page => {
    app.get(`/${page.split('.')[0]}`, (req, res) => {
        res.sendFile(path.join(__dirname, 'web', page));
    });
});

// Error Handling
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.url}`);
    res.status(404).sendFile(path.join(__dirname, 'web', '404.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(path.join(__dirname, 'web', '500.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(chalk.bgGreen(`🚀 Server running on port ${PORT}`));
});

module.exports = app;
