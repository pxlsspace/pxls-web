const fs = require('fs');
const path = require('path');

/**
 * Recursively list all files in a directory.
 * @param dir {string} The directory to list files from.
 * @param fileList {string[]} The list of files to append to.
 * @returns {string[]} The list of files.
 */
function listFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        let filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            listFiles(filePath, fileList);
        } else {
            filePath = filePath
                .replace(__dirname, '')
                .replaceAll('\\', '/');
            fileList.push(filePath);
        }
    });

    return fileList;
}
exports.listFiles = listFiles;
