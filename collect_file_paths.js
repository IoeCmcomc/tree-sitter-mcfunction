var fs = require('fs');
var Path = require('path');

let files = [];

function ThroughDirectory(dir) {
    fs.readdirSync(dir).forEach(file => {
        const absolute = Path.join(dir, file);
        if (fs.statSync(absolute).isDirectory()) return ThroughDirectory(absolute);
        else if (Path.extname(file) == ".mcfunction") return files.push(absolute);
    });
}

ThroughDirectory("datapacks");

fs.writeFile('paths.txt', files.join('\n'), function (err) {
  if (err) throw err;
  console.log('Saved!');
});