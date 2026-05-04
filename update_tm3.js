const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      if (name.endsWith('.tsx')) {
        files.push(name);
      }
    }
  }
  return files;
}

const files = getFiles('src/components');
const regex = /tm3_epsg = \`\$\{23826 \+ tm3Index\}\`;/g;
const replacement = `const baseZone = 46 + Math.floor((tm3Index + 1) / 2);
            const subZone = (tm3Index % 2 === 0) ? 2 : 1;
            tm3_epsg = \`\${23826 + tm3Index} (Zona \${baseZone}-\${subZone})\`;`;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (regex.test(content)) {
        content = content.replace(regex, replacement);
        fs.writeFileSync(file, content);
        console.log('Updated ' + file);
    }
});
