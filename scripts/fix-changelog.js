#!/usr/bin/env node
// Ensures CHANGELOG.md starts with "# Changelog" header
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'CHANGELOG.md');
let content = fs.readFileSync(file, 'utf8');

// Remove any existing header variations and leading whitespace
content = content.replace(/^\s*(#\s*Changelog\s*\n+)?/i, '');

// Add proper header
content = '# Changelog\n\n' + content;

fs.writeFileSync(file, content);
